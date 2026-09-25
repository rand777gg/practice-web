/**
 * RAG 管理页的数据层 —— 概览、块浏览、清空。
 *
 * 重建索引仍然走 rag.ts 的 syncRagSource(和资料库管理页同一套), 这里只补管理页独有的三条:
 *   概览要 pg_column_size 与"未向量化块数", 前端 count(*) 拿不到, 所以走 rag_admin_stats();
 *   块浏览走服务层的 listRagChunks(RLS 已对 authenticated 开放读);
 *   清空走 rag_clear_index(), 服务端再判一次管理员。
 */
import { supabase } from '@/lib/supabase'
import { logError, userMessage } from '@/services/errors'
import { listRagChunks as listRagChunkRows, type RagChunk } from '@/services/resources'
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

/** 索引里的一个块; 领域对象由服务层给出, 这里只是给管理页一个本地的名字 */
export type RagChunkRow = RagChunk

/** 浏览索引里的块。关键词按 content 子串匹配 —— 这是给人核对的工具, 不走向量 */
export async function listRagChunks(
  options: { source?: RagSource | null; keyword?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: RagChunkRow[]; total: number }> {
  try {
    return await listRagChunkRows(options)
  } catch (e) {
    logError('rag-admin.listRagChunks', e)
    throw new Error(`读取索引块失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 清空索引。不传 source 就是整表 —— 服务端会再判一次管理员 */
export async function clearRagIndex(source?: RagSource | null): Promise<number> {
  // 省略 p_source 就是整表（SQL 里 DEFAULT NULL），生成类型同样只接受 undefined 表示省略
  const { data, error } = await supabase.rpc('rag_clear_index', { p_source: source ?? undefined }) as {
    data: number | string | null
    error: { message: string } | null
  }
  if (error) throw new Error(`清空索引失败: ${error.message}`)
  return Number(data ?? 0)
}
