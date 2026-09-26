import type { PostgrestError } from '@supabase/supabase-js'

/**
 * 统一的失败分类。调用方只关心"该怎么办"，不该去认 PostgREST 的错误码 ——
 * 分类在服务层做完，UI 层拿到的永远是一个带 kind 的 AppError。
 */
export type AppErrorKind =
  | 'auth'        // 未登录 / 会话过期 / JWT 无效
  | 'permission'  // 角色不足或 RLS 拒绝
  | 'not_found'   // 期望一行却没有
  | 'conflict'    // 唯一键冲突（含幂等键重复）
  | 'validation'  // 外键 / CHECK / 非空约束失败
  | 'network'     // 离线、超时、连接被重置
  | 'server'      // 5xx / 数据库内部错误
  | 'unknown'

const AUTH_CODES = new Set(['PGRST301', 'PGRST302', '42501_LOGIN'])
const PERMISSION_CODES = new Set(['42501'])
const NETWORK_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '57014'])

function classifyCode(code: string): AppErrorKind {
  if (AUTH_CODES.has(code)) return 'auth'
  if (PERMISSION_CODES.has(code)) return 'permission'
  if (NETWORK_CODES.has(code)) return 'network'
  if (code === '23505') return 'conflict'
  if (code === '23503' || code === '23502' || code === '23514' || code === '22P02' || code === '22001') return 'validation'
  if (code === 'PGRST116') return 'not_found'
  if (/^5/.test(code)) return 'server'
  if (/^23/.test(code)) return 'validation'
  if (/^08/.test(code)) return 'network'
  return 'unknown'
}

/** 只有这两类值得原样重试：网络抖动和服务端瞬时故障。 */
function isRetryableKind(kind: AppErrorKind): boolean {
  return kind === 'network' || kind === 'server'
}

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly code: string | null
  readonly details: string | null
  readonly hint: string | null
  readonly retryable: boolean
  override readonly cause: unknown

  constructor(init: {
    kind: AppErrorKind
    message: string
    code?: string | null
    details?: string | null
    hint?: string | null
    cause?: unknown
  }) {
    super(init.message)
    this.name = 'AppError'
    this.kind = init.kind
    this.code = init.code ?? null
    this.details = init.details ?? null
    this.hint = init.hint ?? null
    this.retryable = isRetryableKind(init.kind)
    this.cause = init.cause
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}

/** PostgREST 直接返回的 error 对象 → AppError */
export function fromPostgrestError(error: PostgrestError, context: string): AppError {
  return new AppError({
    kind: classifyCode(error.code),
    message: context ? `${context}: ${error.message}` : error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    cause: error,
  })
}

/**
 * 任意抛出物 → AppError。fetch 层的失败（断网、DNS、超时）在 supabase-js 里
 * 表现为 TypeError 或带 ERR_ 前缀的字符串，这里统一收成 network。
 */
export function toAppError(e: unknown, context = ''): AppError {
  if (isAppError(e)) return e
  if (e && typeof e === 'object' && 'code' in e && 'message' in e && typeof (e as PostgrestError).code === 'string') {
    return fromPostgrestError(e as PostgrestError, context)
  }
  const raw = e instanceof Error ? e.message : String(e)
  const isNetwork = /NETWORK_CHANGED|QUIC_PROTOCOL_ERROR|CONNECTION_RESET|CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_IO_SUSPENDED|ERR_TIMED_OUT|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError|AbortError/i.test(raw)
  const kind: AppErrorKind = isNetwork ? 'network' : 'unknown'
  return new AppError({
    kind,
    message: context ? `${context}: ${raw}` : raw,
    cause: e,
  })
}

/**
 * 这个错误是不是「服务端还没有这个函数」。
 *
 * 需要的理由：本仓库的部署约定是**先发代码、后跑迁移**（Section 31 的原话：
 * "前端在列缺失时自动降级插入，故先部署代码后执行本迁移也不会开考失败"）。
 * 新增的 RPC（Section 102 的 complete_exam、Section 103 的 save_learning_route、
 * Section 106 的 submit_answer）在迁移执行前线上并不存在 —— 那时 PostgREST 回 404 +
 * `PGRST202: Could not find the function ... in the schema cache`。调用方据此退回旧路径，
 * 而不是让核心动作直接不可用。
 *
 * 只认这一种错：网络抖动、权限不足、幂等冲突都不能当"函数不存在"处理，
 * 否则会把真正的失败悄悄降级成旧的、有半成功窗口的路径。
 */
export function isFunctionMissing(e: unknown): boolean {
  const err = isAppError(e) ? e : toAppError(e)
  if (err.code === 'PGRST202') return true
  return /could not find the function|function .* does not exist/i.test(err.message)
}

/** 用户可见提示：不暴露表名、约束名和错误码。 */
export function userMessage(e: unknown): string {
  const err = isAppError(e) ? e : toAppError(e)
  switch (err.kind) {
    case 'auth': return '登录状态已失效，请重新登录'
    case 'permission': return '没有权限执行该操作'
    case 'not_found': return '数据不存在或已被删除'
    case 'conflict': return '数据已被他人修改，请刷新后重试'
    case 'validation': return '数据格式不符合要求'
    case 'network': return '网络不稳定，请稍后重试'
    case 'server': return '服务暂时不可用，请稍后重试'
    default: return '操作失败，请稍后重试'
  }
}

/**
 * 生产环境的上报出口，由应用启动时注入（见 lib/client-events.ts 的 installErrorReporting）。
 *
 * 为什么用注入而不是直接 import 上报模块：`errors.ts` 是这个仓库里被引最广的纯工具，
 * 连它的**单元测试**都在 Node 里跑（scripts/test-practice-machine.mjs）—— 一旦它 import 了
 * 带 supabase 的模块，那套零依赖测试就装不起来了。而且服务层本来也不该知道遥测的存在。
 */
type ErrorReporter = (context: string, err: AppError) => void
let errorReporter: ErrorReporter | null = null

export function setErrorReporter(fn: ErrorReporter | null): void {
  errorReporter = fn
}

/** 开发日志：带上下文和错误码，只在非生产环境打。 */
export function logError(context: string, e: unknown): void {
  const err = isAppError(e) ? e : toAppError(e)
  // 生产环境控制台看不到，但**不能就此看不见**：交给注入的上报出口（去重 + 封顶，见 lib/client-events）。
  // 这是 P2 可观测性的最小落点 —— 至少知道"线上有哪些错误在发生"。
  if (import.meta.env.PROD) {
    errorReporter?.(context, err)
    return
  }
  console.error(`[${context}] ${err.kind}${err.code ? `/${err.code}` : ''}: ${err.message}`, err.cause ?? '')
}
