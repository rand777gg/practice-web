import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { chunkIds } from '@/lib/chunk-ids'
import { AppError, fromPostgrestError, toAppError } from './errors'

/** 全应用唯一的类型化客户端。业务代码不再直接 import supabase。 */
export const db = supabase as SupabaseClient<Database>

export type Tables = Database['public']['Tables']
export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T]['Row']
export type Insert<T extends TableName> = Tables[T]['Insert']
export type Update<T extends TableName> = Tables[T]['Update']

export interface QueryOptions {
  /** 用于取消：请求返回前用户切页/关弹窗时传进来，PostgREST 会中断连接 */
  signal?: AbortSignal
  /** 网络/服务端瞬时故障的重试次数，默认 2（共 3 次尝试） */
  retries?: number
  /** 出错时的上下文，进 AppError.message 和开发日志 */
  context?: string
}

/**
 * 任何 PostgREST 查询构造器的形状。run 系列都从「构造器本身」推导结果类型，
 * 而不是声明成 `() => PromiseLike<{data: T}>` —— 后者会让 TS 推不出 T 并静默退化成 never，
 * 于是服务层返回的类型全是假的（编译过，但字段级检查全部失效）。
 */
type AnyBuilder = PromiseLike<{ data: unknown; error: PostgrestError | null }>
/** 解析结果类型；写成条件类型而不是 Awaited<B>['data']，否则泛型 B 未实例化时无法索引 */
type DataOf<B> = B extends PromiseLike<infer R> ? (R extends { data: infer D } ? D : never) : never
/** 列表结果的元素类型 */
type ElementOf<D> = NonNullable<D> extends (infer E)[] ? E[] : never

/**
 * JSONB 列的写入边界。领域对象都是 interface，没有索引签名，直接塞不进 Json 类型；
 * 这里是全应用唯一一处「领域对象 → Json」的转换点，读回来必须过对应的 normalize。
 */
export function toJson(value: unknown): Json {
  return value as Json
}

/**
 * RPC 返回值的收口。
 *
 * 生成类型把好几个 TABLE / JSONB 函数一律标成 `Json`（生成器推断不出返回表），于是：
 *   · 直接断言 Json → 领域类型不够「重叠」，TS 会拒绝；
 *   · 而用 supabase-js 的 overrideTypes 声明成数组，又会撞上它的
 *     "Cannot cast single object to array type" 诊断（因为声明返回不是数组）。
 * 真实形状只有 001_initial_schema.sql 知道，所以显式声明在这里收口一次 ——
 * 形状写错的代价是运行时的字段级 undefined，所以取值处仍然要容忍缺字段。
 */
export function rpcJson<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null
  return data as T
}

/** 同上，用于 `RETURNS JSONB` 但内部是 jsonb_agg(...) 的聚合型函数（运行时会回数组） */
export function rpcJsonRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

const DEFAULT_RETRIES = 2
const BASE_DELAY_MS = 300

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * 执行一次 PostgREST 请求：错误统一成 AppError，网络/服务端瞬时故障按指数退避重试。
 * 认证、权限、校验这类错误不重试 —— 重试只会把同一个失败再做两遍。
 */
export async function run<B extends AnyBuilder>(build: () => B, options: QueryOptions = {}): Promise<DataOf<B>> {
  const { signal, retries = DEFAULT_RETRIES, context } = options
  let lastError: AppError | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfAborted(signal)
    try {
      const { data, error } = await build()
      if (error) throw fromPostgrestError(error, context ?? '')
      return data as DataOf<B>
    } catch (e) {
      throwIfAborted(signal)
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      lastError = toAppError(e, context ?? '')
      if (!lastError.retryable || attempt === retries) throw lastError
      await sleep(BASE_DELAY_MS * 2 ** attempt, signal)
    }
  }
  throw lastError ?? new AppError({ kind: 'unknown', message: context ?? 'query failed' })
}

/** 列表查询：PostgREST 空结果回 null，这里统一成 []。 */
export async function runList<B extends AnyBuilder>(build: () => B, options: QueryOptions = {}): Promise<ElementOf<DataOf<B>>> {
  const data = await run(build, options)
  return (data ?? []) as unknown as ElementOf<DataOf<B>>
}

/** 带 count 的查询的形状：精确计数在响应的 count 字段上，不在 data 里 */
type CountBuilder = PromiseLike<{ data: unknown; error: PostgrestError | null; count: number | null }>

/**
 * 需要精确计数时用这个入口（`select(..., { count: 'exact' })` / `head: true`）。
 *
 * 为什么必须单开一个：run 只把 data 交出去，而计数是响应上的另一个字段，
 * 于是各服务只能各写一份"绕过 run 的等待逻辑"——同一件事三份实现，
 * 重试和错误分类的口径就散了。分页器、管理页总数、`head: true` 的存在性探测都走这里。
 */
export async function runCount<B extends CountBuilder>(
  build: () => B,
  options: QueryOptions = {},
): Promise<{ rows: ElementOf<DataOf<B>>; count: number }> {
  const { signal, retries = DEFAULT_RETRIES, context } = options
  let lastError: AppError | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfAborted(signal)
    try {
      const { data, error, count } = await build()
      if (error) throw fromPostgrestError(error, context ?? '')
      return { rows: (data ?? []) as ElementOf<DataOf<B>>, count: count ?? 0 }
    } catch (e) {
      throwIfAborted(signal)
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      lastError = toAppError(e, context ?? '')
      if (!lastError.retryable || attempt === retries) throw lastError
      await sleep(BASE_DELAY_MS * 2 ** attempt, signal)
    }
  }
  throw lastError ?? new AppError({ kind: 'unknown', message: context ?? 'count query failed' })
}

const DEFAULT_PAGE_SIZE = 1000

/**
 * 翻完全部结果。PostgREST 单次最多回 1000 行，老代码里 `.limit(5000)` 那种写法
 * 其实只拿到 1000 行而且毫无提示 —— 这里显式分页，并在 max 处封顶。
 */
export async function fetchAll<B extends AnyBuilder>(
  page: (from: number, to: number) => B,
  options: QueryOptions & { pageSize?: number; max?: number } = {},
): Promise<ElementOf<DataOf<B>>> {
  const { pageSize = DEFAULT_PAGE_SIZE, max = Number.POSITIVE_INFINITY } = options
  const out: unknown[] = []
  for (let from = 0; out.length < max; from += pageSize) {
    const to = Math.min(from + pageSize, max) - 1
    const rows = await run(() => page(from, to), { ...options, context: options.context ?? 'fetchAll' })
    const list = (rows ?? []) as unknown[]
    out.push(...list)
    if (list.length < to - from + 1) break
  }
  return out as ElementOf<DataOf<B>>
}

/**
 * 按 chunkIds 切批执行 `.in()` 查询再拼起来。
 * URL 长度上限的问题见 lib/chunk-ids.ts；这里让调用方不必各自写一遍循环。
 *
 * 注意：signal 由调用方在 chunk 回调里自己挂（见各服务模块的写法）——
 * 回调负责构造查询，这里没有机会替它挂上，不挂就是取消失效。
 */
export async function fetchInChunks<I, B extends AnyBuilder>(
  ids: I[],
  fetchPage: (chunk: I[]) => B,
  options: QueryOptions & { chunkSize?: number } = {},
): Promise<ElementOf<DataOf<B>>> {
  if (ids.length === 0) return [] as unknown as ElementOf<DataOf<B>>
  const out: unknown[] = []
  for (const chunk of chunkIds(ids, options.chunkSize)) {
    const rows = await run(() => fetchPage(chunk), options)
    if (rows) out.push(...(rows as unknown[]))
  }
  return out as ElementOf<DataOf<B>>
}
