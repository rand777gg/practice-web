/**
 * RAG 检索入口 —— 前端只跟这一层打交道。
 *
 * 实际工作在 Edge Function 里做: 查询向量在服务端算(QWEN_API_KEY 不落前端),
 * 检索用调用者自己的 JWT 走 PostgREST, 所以 RLS 照常生效。
 *
 * 以后换 embedding 服务或换检索引擎, 只动这个文件 + 对应的函数。
 */
import { supabase } from '@/lib/supabase'

/** 索引来源。resource=文献区块(可跳到具体页与段落), 其余按内容展示 */
export type RagSource = 'resource' | 'question' | 'kp' | 'subject' | 'note'

export const RAG_SOURCE_LABEL: Record<RagSource, string> = {
  resource: '文献',
  question: '题库',
  kp: '知识点',
  subject: '学科解读',
  note: '公开笔记',
}

export interface RagHit {
  id: number
  source: RagSource
  sourceId: string
  label: string
  subLabel: string | null
  content: string
  pageNo: number | null
  blockIndex: number | null
  /** 能直接跳转的站内地址(目前只有文献有) */
  anchor: string | null
}

export interface RagSearchResult {
  hits: RagHit[]
  /** hybrid = 向量+全文; text-only = 向量服务不可用, 降级成纯全文 */
  mode: 'hybrid' | 'text-only'
  /** 降级原因, 便于排查(例如额度欠费) */
  error: string | null
}

interface RawHit {
  id: number
  source: string
  source_id: string
  label: string | null
  sub_label: string | null
  content: string
  page_no: number | null
  block_index: number | null
  anchor: string | null
}

export async function searchKnowledge(
  query: string,
  options: { sources?: RagSource[]; limit?: number } = {},
): Promise<RagSearchResult> {
  const q = query.trim()
  if (!q) return { hits: [], mode: 'text-only', error: null }

  const { data, error } = await supabase.functions.invoke('rag-search', {
    body: { query: q, sources: options.sources, limit: options.limit ?? 12 },
  })
  if (error) throw new Error(`检索失败: ${error.message}`)

  const payload = (data ?? {}) as { hits?: RawHit[]; mode?: string; embed_error?: string | null }
  return {
    hits: (payload.hits ?? []).map((h) => ({
      id: h.id,
      source: h.source as RagSource,
      sourceId: h.source_id,
      label: h.label ?? '',
      subLabel: h.sub_label,
      content: h.content,
      pageNo: h.page_no,
      blockIndex: h.block_index,
      anchor: h.anchor,
    })),
    mode: payload.mode === 'hybrid' ? 'hybrid' : 'text-only',
    error: payload.embed_error ?? null,
  }
}

/**
 * 一次同步的结果。
 *
 * embedded 是"这次真正算了向量的块数" —— 服务端按内容做差分, 文本没变的块直接跳过,
 * 所以改一道题只会 embedded 1, 而不是把整个题库重算一遍。
 */
export interface RagSyncResult {
  /** 同步后该范围内的块总数 */
  total: number
  embedded: number
  added: number
  updated: number
  removed: number
  unchanged: number
  /** >0 说明这次撞上服务端时间预算, 还没跑完 */
  pending: number
  done: boolean
  elapsedMs: number
}

interface RawSyncResult {
  error?: string
  total_chunks?: number
  embedded?: number
  added?: number
  updated?: number
  removed?: number
  unchanged?: number
  pending_chunks?: number
  done?: boolean
  elapsed_ms?: number
}

function toSyncResult(payload: RawSyncResult): RagSyncResult {
  return {
    total: payload.total_chunks ?? 0,
    embedded: payload.embedded ?? 0,
    added: payload.added ?? 0,
    updated: payload.updated ?? 0,
    removed: payload.removed ?? 0,
    unchanged: payload.unchanged ?? 0,
    pending: payload.pending_chunks ?? 0,
    done: payload.done !== false,
    elapsedMs: payload.elapsed_ms ?? 0,
  }
}

/** 调一次索引同步。返回 done=false 时说明还没跑完(服务端有时间预算), 需要接着调 */
export async function indexRagSource(source: RagSource, id?: string): Promise<RagSyncResult> {
  const { data, error } = await supabase.functions.invoke('rag-index', {
    body: { source, id },
  })
  if (error) throw new Error(`建索引失败: ${error.message}`)
  const payload = (data ?? {}) as RawSyncResult
  if (payload.error) throw new Error(payload.error)
  return toSyncResult(payload)
}

/** 反复调到跑完为止。一本 295 页的书近千个块, 一次调用装不下 */
export async function syncRagSource(
  source: RagSource,
  id?: string,
  options: { onRound?: (result: RagSyncResult) => void; maxRounds?: number } = {},
): Promise<RagSyncResult> {
  const maxRounds = options.maxRounds ?? 40
  let last: RagSyncResult | null = null
  for (let round = 0; round < maxRounds; round++) {
    const result = await indexRagSource(source, id)
    last = last
      ? {
        ...result,
        embedded: last.embedded + result.embedded,
        added: last.added + result.added,
        updated: last.updated + result.updated,
        removed: last.removed + result.removed,
        elapsedMs: last.elapsedMs + result.elapsedMs,
      }
      : result
    options.onRound?.(last)
    if (result.done) return last
  }
  return last!
}

/**
 * 内容写完之后顺手同步索引 —— 不 await、不报错、不打断用户操作。
 *
 * 为什么不做成数据库触发器: 触发器的活是同步的, 而算向量要发外部请求, 放到写入路径上
 * 会让"保存一道题"变成"等 1 秒"。为什么不放 Edge Function 里定时扫: 增量差分已经让
 * 闲置同步几乎免费, 但定时任务总归有延迟, 而用户刚写的东西立刻搜不到会被当成 bug。
 */
export function autoIndex(source: RagSource, id?: string): void {
  void syncRagSource(source, id, { maxRounds: 20 }).catch((err) => {
    console.warn('[rag] 自动同步索引失败(不影响内容保存):', err)
  })
}
