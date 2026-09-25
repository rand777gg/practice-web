/**
 * 资料库检索层 —— 全库 / 单篇的知识点与关键字检索。
 *
 * 这里是将来换搜索引擎的唯一边界: 现在走 Supabase 上的 pg_trgm, 两个函数返回的形状
 * 就是页面需要的全部信息(命中区块 + 页码 + bbox + 摘要)。以后真上了 Meilisearch,
 * 只要让同名函数返回同样的结构, 阅读页和列表页都不用改。
 *
 * 为什么中文不走分词器: 中文没有词边界, pg_trgm 的子串匹配语义正好等价于
 * "关键词出现在正文里"。但 2 字词(「死锁」「调度」)生成不出内部 trigram, GIN 索引
 * 根本用不上, 所以库里另存了一份逐字加空格的 search_text 专供索引, 详见 Section 49。
 */

import { supabase } from '@/lib/supabase'

export interface BlockHit {
  documentId: string
  docTitle: string
  pageNo: number
  blockIndex: number
  bbox: number[] | null
  blockType: string
  headingLevel: number
  snippet: string
  score: number
  totalHits: number
}

export interface DocumentHit {
  id: string
  title: string
  authors: string
  source: string
  pubYear: number | null
  docType: string
  subject: string
  tags: string[]
  abstract: string
  pdfTotalPages: number | null
  parseStatus: string
  createdAt: string
  snippet: string
  totalHits: number
}

export interface LibraryFilter {
  subject?: string | null
  docType?: string | null
  tag?: string | null
}

interface RawBlockRow {
  document_id: string
  doc_title: string
  page_no: number
  block_index: number
  bbox: number[] | null
  block_type: string
  heading_level: number
  snippet: string | null
  score: number
  total_hits: number
}

interface RawDocRow {
  id: string
  title: string
  authors: string
  source: string
  pub_year: number | null
  doc_type: string
  subject: string
  tags: string[] | null
  abstract: string
  pdf_total_pages: number | null
  parse_status: string
  created_at: string
  snippet: string | null
  total_hits: number
}

/** 正文区块检索: 全库命中, 或限定单篇(阅读页内的检索)。 */
export async function searchBlocks(
  query: string,
  options: LibraryFilter & { documentId?: string | null; limit?: number } = {},
): Promise<BlockHit[]> {
  if (!query.trim()) return []

  const { data, error } = await supabase.rpc('search_resource_blocks', {
    p_query: query.trim(),
    // 这几个过滤参数在 SQL 里的默认值就是 NULL，省略与显式传 null 等价；
    // 而生成类型把它们标成 `T | undefined`，所以这里统一用 undefined 让可选参数被省略
    p_document_id: options.documentId ?? undefined,
    p_subject: options.subject ?? undefined,
    p_doc_type: options.docType ?? undefined,
    p_tag: options.tag ?? undefined,
    p_limit: options.limit ?? 50,
  }) as { data: RawBlockRow[] | null; error: { message: string } | null }

  if (error) throw new Error(`区块检索失败: ${error.message}`)

  return (data ?? []).map((r) => ({
    documentId: r.document_id,
    docTitle: r.doc_title,
    pageNo: r.page_no,
    blockIndex: r.block_index,
    bbox: r.bbox,
    blockType: r.block_type,
    headingLevel: r.heading_level,
    snippet: r.snippet ?? '',
    score: r.score,
    totalHits: Number(r.total_hits),
  }))
}

/** 文献检索: 标题/作者/来源/学科/标签/摘要命中。空关键词 = 按时间浏览全部。 */
export async function searchDocuments(
  query: string,
  options: LibraryFilter & { limit?: number; offset?: number } = {},
): Promise<DocumentHit[]> {
  const { data, error } = await supabase.rpc('search_resource_documents', {
    p_query: query.trim(),
    p_subject: options.subject ?? undefined,
    p_doc_type: options.docType ?? undefined,
    p_tag: options.tag ?? undefined,
    p_limit: options.limit ?? 30,
    p_offset: options.offset ?? 0,
  }) as { data: RawDocRow[] | null; error: { message: string } | null }

  if (error) throw new Error(`文献检索失败: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    authors: r.authors,
    source: r.source,
    pubYear: r.pub_year,
    docType: r.doc_type,
    subject: r.subject,
    tags: r.tags ?? [],
    abstract: r.abstract,
    pdfTotalPages: r.pdf_total_pages,
    parseStatus: r.parse_status,
    createdAt: r.created_at,
    snippet: r.snippet ?? '',
    totalHits: Number(r.total_hits),
  }))
}
