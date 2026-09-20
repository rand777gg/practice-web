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
import { autoIndex } from '@/lib/rag'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUModelVersion, getMinerUToken } from '@/lib/ai/config'
import { blocksFromParse, type ResourceBlock } from '@/lib/resource-blocks'
import { renderAndUploadPdfPages, countPdfPages, type PageUrl } from '@/lib/pdf-page-renderer'
import {
  MINERU_PAGE_LIMIT, parsePageNumbers, planParts, rangeForSlice, selectedPageCount,
  type PageSlice,
} from '@/lib/page-slices'

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

export async function replaceResourceBlocks(id: string, blocks: ResourceBlock[], baseIndex = 0): Promise<void> {
  const CHUNK = 400
  for (let i = 0; i < blocks.length; i += CHUNK) {
    const rows = blocks.slice(i, i + CHUNK).map((b) => ({
      document_id: id,
      block_index: baseIndex + b.blockIndex,
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

export async function clearResourceBlocks(id: string): Promise<void> {
  const { error } = await supabase.from('resource_blocks').delete().eq('document_id', id)
  if (error) throw new Error(`清理旧区块失败: ${error.message}`)
}

/**
 * 某一卷写入前, 已有多少个区块排在它前面。
 * 用「页码小于本卷起始页的区块数」来算, 而不是跨卷累加变量 —— 重试时会跳过已成功的卷,
 * 累加变量对跳过的卷不前进, 下一卷就会从 0 开始编号, 撞上 (document_id, block_index) 唯一索引。
 */
async function countBlocksBefore(documentId: string, pageFrom: number): Promise<number> {
  const { count, error } = await supabase
    .from('resource_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .lt('page_no', pageFrom)
  if (error) throw new Error(`统计已有区块失败: ${error.message}`)
  return count ?? 0
}

// ── 分卷 ──

export interface ResourcePart {
  id: string
  document_id: string
  part_index: number
  page_from: number
  page_to: number
  page_urls: string | null
  markdown: string
  parse_mode: string
  parse_status: string
  parse_error: string | null
  created_at: string
  updated_at: string
}

const PART_COLUMNS = [
  'id', 'document_id', 'part_index', 'page_from', 'page_to', 'page_urls',
  'markdown', 'parse_mode', 'parse_status', 'parse_error', 'created_at', 'updated_at',
].join(', ')

/** 不传 documentId 就是全部(管理页要一次拿到所有分卷状态) */
export async function listResourceParts(documentId?: string): Promise<ResourcePart[]> {
  let query = supabase.from('resource_parts').select(PART_COLUMNS).order('part_index', { ascending: true })
  if (documentId) query = query.eq('document_id', documentId)
  const { data, error } = await query
  if (error) throw new Error(`加载分卷失败: ${error.message}`)
  return (data ?? []) as unknown as ResourcePart[]
}

export function partPageUrls(part: ResourcePart): PageUrl[] {
  if (!part.page_urls) return []
  try {
    const parsed = JSON.parse(part.page_urls) as PageUrl[]
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.src) : []
  } catch {
    return []
  }
}

/** 各卷页图按卷序拼起来就是全篇页图, 页码本来就是原文页码, 不用再编号 */
export function documentPagesFromParts(parts: ResourcePart[]): PageUrl[] {
  return parts.flatMap((p) => partPageUrls(p))
}

export function documentMarkdownFromParts(parts: ResourcePart[], fallback = ''): string {
  const joined = parts.map((p) => p.markdown).filter(Boolean).join('\n\n')
  return joined || fallback
}

async function replaceParts(documentId: string, slices: PageSlice[], mode: ParseMode): Promise<ResourcePart[]> {
  const { error: delErr } = await supabase.from('resource_parts').delete().eq('document_id', documentId)
  if (delErr) throw new Error(`清理旧分卷失败: ${delErr.message}`)
  if (slices.length === 0) return []

  const rows = slices.map((s, i) => ({
    document_id: documentId,
    part_index: i,
    page_from: s.from,
    page_to: s.to,
    parse_mode: mode,
    parse_status: 'pending',
  }))
  const { data, error } = await supabase.from('resource_parts').insert(rows).select(PART_COLUMNS)
  if (error) throw new Error(`建立分卷失败: ${error.message}`)
  return (data ?? []) as unknown as ResourcePart[]
}

async function patchPart(partId: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const { error } = await supabase
    .from('resource_parts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', partId)
  if (error) throw new Error(`更新分卷失败: ${error.message}`)
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

  // 单卷最多 199 页, vlm 解析一本 200 页的书可能跑十几分钟, 所以给到 30 分钟
  for (let i = 0; i < 900; i++) {
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
 * 解析 + 建区块。
 * 单独一个函数是为了让 jsonData 在这里就走出作用域: 199 页的 layout.json 有十几 MB,
 * 如果和后面的页图渲染(要跑几分钟, pdfjs 自己还要吃内存)挤在一起, 很容易把标签页拖垮。
 */
async function parseIntoBlocks(
  pdfUrl: string,
  options: ParseOptions,
  useRange: string | undefined,
  pageNumbers: number[],
  label: string,
): Promise<{ blocks: ResourceBlock[]; markdown: string }> {
  const producer = options.producer
  producer?.({ step: `${label}正在提交解析任务${useRange ? ` (第 ${useRange} 页)` : ''}...` })
  const { markdown, jsonData } = await parseWithMinerU(pdfUrl, { ...options, pageRanges: useRange })

  producer?.({ step: `${label}正在建立目录与定位区块...` })
  const blocks = blocksFromParse(jsonData, markdown, pageNumbers)
  if (blocks.length === 0) throw new Error('解析结果为空, 未取得任何正文区块')
  return { blocks, markdown }
}

async function runPart(
  documentId: string,
  pdfUrl: string,
  part: ResourcePart,
  slice: PageSlice,
  options: ParseOptions,
  // 本卷要发给 MinerU 的页码范围; undefined 表示这一卷就等于整篇, 不传能拿到完整版面信息。
  // 注意不能自己在这里判断"从第 1 页开始就不传": 多卷文档的第一卷也是从第 1 页开始,
  // 那样会让 MinerU 拿到整本书而报超过页数上限。
  useRange: string | undefined,
  label: string,
): Promise<{ blocks: number; pages: number; markdown: string }> {
  const producer = options.producer
  const pageNumbers = parsePageNumbers(useRange, slice.to)

  await patchPart(part.id, { parse_mode: options.mode, parse_status: 'parsing', parse_error: null })

  try {
    const { blocks, markdown } = await parseIntoBlocks(pdfUrl, options, useRange, pageNumbers, label)

    producer?.({ step: `${label}正在渲染 PDF 页面并上传 R2...` })
    const pages = await renderAndUploadPdfPages(
      pdfUrl,
      `${documentPrefix(documentId)}/parts/${part.part_index}/pages`,
      useRange,
      (done, total) => producer?.({ step: `${label}渲染页面并上传 R2... ${done}/${total}`, done, total }),
    )
    const goodPages = pages.filter((p) => p.src)

    await replaceResourceBlocks(documentId, blocks, await countBlocksBefore(documentId, slice.from))
    await patchPart(part.id, {
      page_urls: goodPages.length ? JSON.stringify(goodPages) : null,
      markdown,
      parse_status: 'ready',
      parse_error: null,
    })

    return { blocks: blocks.length, pages: goodPages.length, markdown }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // 原先是 .catch(() => {}) 全吞: 会话过期时连 patchPart 也 401, 于是这一卷永远停在
    // parsing, 界面只会一直转, 看不出任何原因。至少把真实原因打出来。
    try {
      await patchPart(part.id, { parse_status: 'failed', parse_error: message })
    } catch (patchErr) {
      console.error('[resource] 标记分卷失败时又出错, 该卷会停在 parsing:', patchErr)
    }
    throw new Error(`${label}${message}`, { cause: err })
  }
}

/**
 * 录入一篇原始文献: 建行 → 上传 PDF 到 R2 → 按 200 页切卷依次解析 → 落区块。
 * 每一卷成功就立刻落库, 所以某一卷失败时前面几卷的成果不会白费, 重试会跳过已成功的卷。
 */
export async function ingestResource(
  file: File,
  meta: DocumentMetaInput,
  options: ParseOptions,
): Promise<string> {
  const producer = options.producer

  producer?.({ step: '正在检查 PDF 页数...' })
  const totalPages = await countPdfPages(file)
  const slices = planParts(totalPages, options.pageRanges)
  const willParse = selectedPageCount(totalPages, options.pageRanges)
  if (willParse > MINERU_PAGE_LIMIT && slices.length <= 1) {
    throw new Error(
      `这份 PDF 共 ${totalPages} 页, 指定的页码范围覆盖 ${willParse} 页, 超过 MinerU 的 ${MINERU_PAGE_LIMIT} 页上限。` +
      `请把页码范围改小, 或留空让系统自动切卷。`,
    )
  }

  const documentId = await createResourceDocument(meta)

  try {
    producer?.({ step: '正在上传 PDF 到 R2...' })
    const pdfKey = `${documentPrefix(documentId)}/source.pdf`
    const pdfUrl = await putToR2(pdfKey, file, 'application/pdf')

    await updateResourceDocument(documentId, {
      pdf_url: pdfUrl,
      pdf_key: pdfKey,
      parse_mode: options.mode,
      pdf_total_pages: totalPages,
      parse_status: 'parsing',
      parse_error: null,
    })

    const parts = await replaceParts(documentId, slices, options.mode)
    await clearResourceBlocks(documentId)

    let done = 0
    for (let i = 0; i < parts.length; i++) {
      const label = parts.length > 1 ? `[第 ${slices[i].from}-${slices[i].to} 页] ` : ''
      producer?.({ step: `${label}开始解析 (${i + 1}/${parts.length})...` })
      const r = await runPart(documentId, pdfUrl, parts[i], slices[i], options,
        rangeForSlice(slices, i, totalPages, options.pageRanges), label)
      done += r.blocks
      producer?.({ step: `${label}完成: ${r.blocks} 个区块 / ${r.pages} 页` })
    }

    await updateResourceDocument(documentId, { parse_status: 'ready', parse_error: null })
    // 解析完顺手建索引。已发布才真的会建(服务端对未发布文献返回空集),
    // 但这里不做判断: 发布态可能刚刚改过, 让服务端按库里的实际状态决定更省事。
    autoIndex('resource', documentId)
    producer?.({ step: `全部完成: ${parts.length} 卷 / ${done} 个区块 / ${totalPages} 页` })
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

/**
 * 解析失败后重试: 复用已上传的 PDF, 不要求重新选文件。
 * 已成功的卷直接跳过 —— 一本 295 页的书重跑一次要烧两次 MinerU 额度, 没必要。
 */
export async function reparseResource(
  documentId: string,
  options: ParseOptions,
): Promise<void> {
  const doc = await getResourceDocument(documentId)
  if (!doc) throw new Error('文献不存在')
  if (!doc.pdf_url) throw new Error('这篇文献没有 PDF, 需要重新上传')

  const producer = options.producer
  producer?.({ step: '正在检查 PDF 页数...' })
  const totalPages = await countPdfPages(doc.pdf_url)
  const slices = planParts(totalPages, options.pageRanges)
  const existing = await listResourceParts(documentId)

  // 卷数或页码区间变了(比如换成显式页码范围)就重排分卷, 否则沿用
  const sameLayout = existing.length === slices.length
    && existing.every((p, i) => p.page_from === slices[i].from && p.page_to === slices[i].to)
  const parts = sameLayout ? existing : await replaceParts(documentId, slices, options.mode)

  if (!sameLayout) await clearResourceBlocks(documentId)

  try {
    await updateResourceDocument(documentId, {
      parse_mode: options.mode,
      pdf_total_pages: totalPages,
      parse_status: 'parsing',
      parse_error: null,
    })

    let skipped = 0
    for (let i = 0; i < parts.length; i++) {
      const label = parts.length > 1 ? `[第 ${slices[i].from}-${slices[i].to} 页] ` : ''
      if (sameLayout && parts[i].parse_status === 'ready' && parts[i].page_urls) {
        skipped++
        producer?.({ step: `${label}已成功, 跳过` })
        continue
      }
      producer?.({ step: `${label}开始解析 (${i + 1}/${parts.length})...` })
      const r = await runPart(documentId, doc.pdf_url, parts[i], slices[i], options,
        rangeForSlice(slices, i, totalPages, options.pageRanges), label)
      producer?.({ step: `${label}完成: ${r.blocks} 个区块 / ${r.pages} 页` })
    }

    await updateResourceDocument(documentId, { parse_status: 'ready', parse_error: null })
    autoIndex('resource', documentId)
    producer?.({ step: skipped > 0 ? `完成 (跳过 ${skipped} 个已成功的卷)` : '完成' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateResourceDocument(documentId, { parse_status: 'failed', parse_error: message }).catch(() => {})
    throw err
  }
}
