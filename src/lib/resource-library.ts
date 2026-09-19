/**
 * 资料库数据层 —— 文献元数据、R2 产物、MinerU 解析流水线。
 *
 * 解析产物分三处落地, 各有分工:
 *   - PDF 原件、预渲染页图  → R2(便宜且不吃 Postgres 体积), 地址存在 documents 行上
 *   - full.md 正文          → documents.markdown, 用于整篇渲染与无坐标兜底
 *   - 区块(带页码 + bbox)   → resource_blocks, 目录、双向定位、检索都靠它
 * 先建行拿到 id 再上传, 是为了让 R2 key 带 id 前缀, 删文献时能按前缀一次清干净。
 */

import { supabase } from '@/lib/supabase'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUModelVersion, getMinerUToken } from '@/lib/ai/config'
import { blocksFromParse, type ResourceBlock } from '@/lib/resource-blocks'
import { renderAndUploadPdfPages, type PageUrl } from '@/lib/pdf-page-renderer'

export const DOC_TYPES = ['教材', '论文', '标准', '真题', '报告', '其他'] as const

export type ParseStatus = 'pending' | 'parsing' | 'ready' | 'failed'
export type ParseMode = 'precision' | 'lightweight'

export interface ResourceDocument {
  id: string
  title: string
  authors: string
  source: string
  pub_year: number | null
  doc_type: string
  subject: string
  tags: string[]
  abstract: string
  doi: string
  language: string
  pdf_url: string
  pdf_key: string
  pdf_total_pages: number | null
  pdf_page_urls: string | null
  parse_mode: string
  parse_status: string
  parse_error: string | null
  is_published: boolean
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceDocumentDetail = ResourceDocument & { markdown: string }

export interface DocumentMetaInput {
  title: string
  authors?: string
  source?: string
  pub_year?: number | null
  doc_type?: string
  subject?: string
  tags?: string[]
  abstract?: string
  doi?: string
  language?: string
}

const LIST_COLUMNS = [
  'id', 'title', 'authors', 'source', 'pub_year', 'doc_type', 'subject', 'tags', 'abstract',
  'doi', 'language', 'pdf_url', 'pdf_key', 'pdf_total_pages', 'pdf_page_urls', 'parse_mode',
  'parse_status', 'parse_error', 'is_published', 'uploaded_by', 'created_at', 'updated_at',
].join(', ')

// ── R2 ──

async function putToR2(key: string, body: Blob | File, contentType: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('r2', {
    body: { action: 'upload-url', key, contentType },
  })
  if (error) throw new Error(`R2 预签名失败: ${error.message}`)
  const { url, publicUrl } = (data ?? {}) as { url?: string; publicUrl?: string }
  if (!url || !publicUrl) throw new Error('R2 未返回上传地址')

  const res = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } })
  if (!res.ok) throw new Error(`R2 上传失败: HTTP ${res.status}`)
  return publicUrl
}

export function documentPrefix(documentId: string): string {
  return `resources/${documentId}`
}

export async function deleteDocumentAssets(documentId: string): Promise<void> {
  await supabase.functions
    .invoke('r2', { body: { action: 'delete', prefix: `${documentPrefix(documentId)}/` } })
    .catch(() => {})
}

// ── 读 ──

export async function listResourceDocuments(): Promise<ResourceDocument[]> {
  const { data, error } = await supabase
    .from('resource_documents')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`加载文献列表失败: ${error.message}`)
  return (data ?? []) as unknown as ResourceDocument[]
}

export async function getResourceDocument(id: string): Promise<ResourceDocumentDetail | null> {
  const { data, error } = await supabase
    .from('resource_documents')
    .select(`${LIST_COLUMNS}, markdown`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`加载文献失败: ${error.message}`)
  return (data ?? null) as unknown as ResourceDocumentDetail | null
}

const BLOCK_PAGE_SIZE = 1000

export async function loadResourceBlocks(documentId: string): Promise<ResourceBlock[]> {
  const out: ResourceBlock[] = []
  for (let from = 0; ; from += BLOCK_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('resource_blocks')
      .select('block_index, page_no, bbox, block_type, heading_level, text')
      .eq('document_id', documentId)
      .order('block_index', { ascending: true })
      .range(from, from + BLOCK_PAGE_SIZE - 1)

    if (error) throw new Error(`加载区块失败: ${error.message}`)
    const rows = (data ?? []) as unknown as {
      block_index: number; page_no: number; bbox: number[] | null
      block_type: string; heading_level: number; text: string
    }[]
    for (const r of rows) {
      out.push({
        blockIndex: r.block_index,
        pageNo: r.page_no,
        bbox: r.bbox,
        blockType: r.block_type,
        headingLevel: r.heading_level,
        text: r.text,
      })
    }
    if (rows.length < BLOCK_PAGE_SIZE) break
  }
  return out
}

export function pageUrlsOf(doc: ResourceDocument): PageUrl[] {
  if (!doc.pdf_page_urls) return []
  try {
    const parsed = JSON.parse(doc.pdf_page_urls) as PageUrl[]
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.src) : []
  } catch {
    return []
  }
}

// ── 写 ──

export async function createResourceDocument(input: DocumentMetaInput): Promise<string> {
  const { data, error } = await supabase
    .from('resource_documents')
    .insert({
      title: input.title.trim(),
      authors: input.authors?.trim() ?? '',
      source: input.source?.trim() ?? '',
      pub_year: input.pub_year ?? null,
      doc_type: input.doc_type ?? '论文',
      subject: input.subject?.trim() ?? '',
      tags: input.tags ?? [],
      abstract: input.abstract?.trim() ?? '',
      doi: input.doi?.trim() ?? '',
      language: input.language ?? 'ch',
      parse_status: 'pending',
    })
    .select('id')
    .single()
  if (error) throw new Error(`创建文献失败: ${error.message}`)
  return (data as { id: string }).id
}

export async function updateResourceDocument(
  id: string,
  patch: Partial<Record<string, unknown>>,
): Promise<void> {
  const { error } = await supabase
    .from('resource_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`更新文献失败: ${error.message}`)
}

export async function deleteResourceDocument(id: string): Promise<void> {
  const { error } = await supabase.from('resource_documents').delete().eq('id', id)
  if (error) throw new Error(`删除文献失败: ${error.message}`)
  await deleteDocumentAssets(id)
}

export async function replaceResourceBlocks(id: string, blocks: ResourceBlock[]): Promise<void> {
  const { error: delErr } = await supabase.from('resource_blocks').delete().eq('document_id', id)
  if (delErr) throw new Error(`清理旧区块失败: ${delErr.message}`)

  const CHUNK = 400
  for (let i = 0; i < blocks.length; i += CHUNK) {
    const rows = blocks.slice(i, i + CHUNK).map((b) => ({
      document_id: id,
      block_index: b.blockIndex,
      page_no: b.pageNo,
      bbox: b.bbox,
      block_type: b.blockType,
      heading_level: b.headingLevel,
      text: b.text,
    }))
    const { error } = await supabase.from('resource_blocks').insert(rows)
    if (error) throw new Error(`区块写入失败(第 ${i} 条起): ${error.message}`)
  }
}

// ── 解析流水线 ──

export interface ParseProgress {
  step: string
  done?: number
  total?: number
}

export interface ParseOptions {
  mode: ParseMode
  pageRanges?: string
  producer?: (p: ParseProgress) => void
}

async function parseWithMinerU(
  pdfUrl: string,
  options: ParseOptions,
): Promise<{ markdown: string; jsonData?: string }> {
  const mineru = new MinerUClient()
  const onProgress = (msg: string) => options.producer?.({ step: msg })

  if (options.mode === 'lightweight') {
    const { markdown } = await mineru.parseUrlLightweight(
      pdfUrl,
      { pageRanges: options.pageRanges },
      onProgress,
    )
    return { markdown }
  }

  const token = getMinerUToken()
  if (!token) throw new Error('精准解析需要 MinerU Token, 请在 AI 设置里填写')

  const task = await mineru.createTask(pdfUrl, {
    token,
    modelVersion: getMinerUModelVersion(),
    language: 'ch',
    enableFormula: true,
    enableTable: true,
    pageRanges: options.pageRanges,
  })

  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await mineru.pollTask(task.taskId, token)
    if (poll.state === 'done' && poll.fullZipUrl) {
      onProgress('正在提取解析结果...')
      const { fetchZipAndExtractFiles } = await import('@/lib/ai/mineru')
      return await fetchZipAndExtractFiles(poll.fullZipUrl)
    }
    if (poll.state === 'failed') throw new Error(`MinerU 精准解析失败: ${poll.errMsg}`)
    if (i % 5 === 0) {
      const p = poll.extractProgress
      options.producer?.({
        step: p ? `精准解析中... ${p.extractedPages}/${p.totalPages} 页` : `精准解析中... ${poll.state}`,
        done: p?.extractedPages,
        total: p?.totalPages,
      })
    }
  }
  throw new Error('MinerU 精准解析超时')
}

/**
 * 录入一篇原始文献: 建行 → 上传 PDF 到 R2 → MinerU 解析 → 预渲染页图 → 落区块。
 * 任何一步失败都会把 parse_status 标成 failed 并把错误留在行上, 方便管理页重试。
 */
export async function ingestResource(
  file: File,
  meta: DocumentMetaInput,
  options: ParseOptions,
): Promise<string> {
  const producer = options.producer
  const documentId = await createResourceDocument(meta)

  try {
    producer?.({ step: '正在上传 PDF 到 R2...' })
    const pdfKey = `${documentPrefix(documentId)}/source.pdf`
    const pdfUrl = await putToR2(pdfKey, file, 'application/pdf')

    await updateResourceDocument(documentId, {
      pdf_url: pdfUrl,
      pdf_key: pdfKey,
      parse_mode: options.mode,
      parse_status: 'parsing',
      parse_error: null,
    })

    producer?.({ step: options.mode === 'precision' ? '正在提交精准解析任务...' : '正在提交解析任务...' })
    const { markdown, jsonData } = await parseWithMinerU(pdfUrl, options)

    producer?.({ step: '正在渲染 PDF 页面并上传 R2...' })
    const pages = await renderAndUploadPdfPages(
      pdfUrl,
      `${documentPrefix(documentId)}/pages`,
      options.pageRanges,
      (done, total) => producer?.({ step: `渲染页面并上传 R2... ${done}/${total}`, done, total }),
    )
    const goodPages = pages.filter((p) => p.src)

    producer?.({ step: '正在建立目录与定位区块...' })
    const blocks = blocksFromParse(jsonData, markdown, goodPages.length)

    if (blocks.length === 0) throw new Error('解析结果为空, 未取得任何正文区块')
    await replaceResourceBlocks(documentId, blocks)

    await updateResourceDocument(documentId, {
      markdown,
      pdf_total_pages: goodPages.length || null,
      pdf_page_urls: goodPages.length ? JSON.stringify(goodPages) : null,
      parse_status: 'ready',
      parse_error: null,
    })

    producer?.({ step: `完成: ${blocks.length} 个区块 / ${goodPages.length} 页` })
    return documentId
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateResourceDocument(documentId, {
      parse_status: 'failed',
      parse_error: message,
    }).catch(() => {})
    throw err
  }
}

/** 解析失败后重试: 复用已上传的 PDF, 不要求重新选文件。 */
export async function reparseResource(
  documentId: string,
  options: ParseOptions,
): Promise<void> {
  const doc = await getResourceDocument(documentId)
  if (!doc) throw new Error('文献不存在')
  if (!doc.pdf_url) throw new Error('这篇文献没有 PDF, 需要重新上传')

  const producer = options.producer
  try {
    await updateResourceDocument(documentId, {
      parse_mode: options.mode,
      parse_status: 'parsing',
      parse_error: null,
    })

    const { markdown, jsonData } = await parseWithMinerU(doc.pdf_url, options)

    producer?.({ step: '正在渲染 PDF 页面并上传 R2...' })
    const pages = await renderAndUploadPdfPages(
      doc.pdf_url,
      `${documentPrefix(documentId)}/pages`,
      options.pageRanges,
      (done, total) => producer?.({ step: `渲染页面并上传 R2... ${done}/${total}`, done, total }),
    )
    const goodPages = pages.filter((p) => p.src)
    const blocks = blocksFromParse(jsonData, markdown, goodPages.length)
    if (blocks.length === 0) throw new Error('解析结果为空, 未取得任何正文区块')

    await replaceResourceBlocks(documentId, blocks)
    await updateResourceDocument(documentId, {
      markdown,
      pdf_total_pages: goodPages.length || null,
      pdf_page_urls: goodPages.length ? JSON.stringify(goodPages) : null,
      parse_status: 'ready',
      parse_error: null,
    })
    producer?.({ step: `完成: ${blocks.length} 个区块 / ${goodPages.length} 页` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateResourceDocument(documentId, { parse_status: 'failed', parse_error: message }).catch(() => {})
    throw err
  }
}
