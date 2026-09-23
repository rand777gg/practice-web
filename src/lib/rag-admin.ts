/**
 * RAG 管理页的数据层 —— 概览、块浏览、清空。
 *
 * 重建索引仍然走 rag.ts 的 syncRagSource(和资料库管理页同一套), 这里只补管理页独有的三条:
 *   概览要 pg_column_size 与"未向量化块数", 前端 count(*) 拿不到, 所以走 rag_admin_stats();
 *   块浏览直接读 rag_chunks(RLS 已对 authenticated 开放读);
 *   清空走 rag_clear_index(), 服务端再判一次管理员。
 */
import { supabase } from '@/lib/supabase'
import type { RagSource } from '@/lib/rag'

export interface RagSourceStat {
  source: RagSource
  chunks: number
  embedded: number
  unembedded: number
  contentBytes: number
  lastEmbeddedAt: string | null
  lastCreatedAt: string | null
}

interface RawStatRow {
  source: string
  chunks: number | string
  embedded: number | string
  unembedded: number | string
  content_bytes: number | string | null
  last_embedded: string | null
  last_created: string | null
}

export async function ragStats(): Promise<RagSourceStat[]> {
  const { data, error } = await supabase.rpc('rag_admin_stats') as {
    data: RawStatRow[] | null
    error: { message: string } | null
  }
  if (error) throw new Error(`读取索引概况失败: ${error.message}`)
  return (data ?? []).map((r) => ({
    source: r.source as RagSource,
    chunks: Number(r.chunks),
    embedded: Number(r.embedded),
    unembedded: Number(r.unembedded),
    contentBytes: Number(r.content_bytes ?? 0),
    lastEmbeddedAt: r.last_embedded,
    lastCreatedAt: r.last_created,
  }))
}

export interface RagChunkRow {
  id: number
  source: RagSource
  sourceId: string
  chunkIndex: number
  label: string
  subLabel: string | null
  content: string
  pageNo: number | null
  blockIndex: number | null
  anchor: string | null
  embedded: boolean
  createdAt: string
}

interface RawChunkRow {
  id: number
  source: string
  source_id: string
  chunk_index: number
  label: string
  sub_label: string | null
  content: string
  page_no: number | null
  block_index: number | null
  anchor: string | null
  embedded_at: string | null
  created_at: string
}

const CHUNK_COLS = 'id, source, source_id, chunk_index, label, sub_label, content, page_no, block_index, anchor, embedded_at, created_at'

/** 浏览索引里的块。关键词按 content 子串匹配 —— 这是给人核对的工具, 不走向量 */
export async function listRagChunks(
  options: { source?: RagSource | null; keyword?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: RagChunkRow[]; total: number }> {
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0
  const keyword = options.keyword?.trim() ?? ''

  let q = supabase.from('rag_chunks').select(CHUNK_COLS, { count: 'exact' })
  if (options.source) q = q.eq('source', options.source)
  if (keyword) q = q.ilike('content', `%${keyword}%`)

  const { data, error, count } = await q.order('id', { ascending: false }).range(offset, offset + limit - 1)
  if (error) throw new Error(`读取索引块失败: ${error.message}`)

  return {
    total: count ?? 0,
    rows: ((data ?? []) as RawChunkRow[]).map((r) => ({
      id: r.id,
      source: r.source as RagSource,
      sourceId: r.source_id,
      chunkIndex: r.chunk_index,
      label: r.label,
      subLabel: r.sub_label,
      content: r.content,
      pageNo: r.page_no,
      blockIndex: r.block_index,
      anchor: r.anchor,
      embedded: r.embedded_at !== null,
      createdAt: r.created_at,
    })),
  }
}

/** 清空索引。不传 source 就是整表 —— 服务端会再判一次管理员 */
export async function clearRagIndex(source?: RagSource | null): Promise<number> {
  const { data, error } = await supabase.rpc('rag_clear_index', { p_source: source ?? null }) as {
    data: number | string | null
    error: { message: string } | null
  }
  if (error) throw new Error(`清空索引失败: ${error.message}`)
  return Number(data ?? 0)
}
