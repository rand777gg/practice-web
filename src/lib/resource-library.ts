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
import { MinerUClient, fetchZipAndExtractFiles, type ZipAssets } from '@/lib/ai/mineru'
import { getMinerUModelVersion, getMinerUToken } from '@/lib/ai/config'
import type { MinerUBatchFileResult, MinerUBatchStatus, MinerUPrecisionOptions } from '@/lib/ai/types'
import { blocksFromParse, layoutPageCount, sectionsFromToc, type ResourceBlock, type TocEntry, type TocSection } from '@/lib/resource-blocks'
import { tocFromDraft } from '@/lib/resource-toc'
import { loadManualToc } from '@/lib/resource-toc-store'
import { renderAndUploadPdfPages, countPdfPages, type PageUrl } from '@/lib/pdf-page-renderer'
import { uploadBlobToR2 } from '@/lib/r2-upload'
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
  /** 'auto' = 目录按 heading_level 现推; 'manual' = 管理员改过, 以 resource_toc_entries 为准 */
  toc_source: string
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
  'parse_status', 'parse_error', 'is_published', 'toc_source', 'uploaded_by', 'created_at', 'updated_at',
].join(', ')

// ── R2 ──

async function putToR2(
  key: string,
  body: Blob | File,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return uploadBlobToR2(body, key, contentType, onProgress)
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

export function loadResourceBlocks(documentId: string): Promise<ResourceBlock[]> {
  return loadDocumentBlocks(documentId)
}

/**
 * 解析结果现推的那份目录 —— 只查标题行, 不拉正文。
 * 编辑器"人工目录还不存在"时的初值, 以及阅读页/出题范围没人工目录时的回退都走它。
 */
export async function loadAutoToc(documentId: string): Promise<TocEntry[]> {
  const { data, error } = await supabase
    .from('resource_blocks')
    .select('block_index, page_no, heading_level, text')
    .eq('document_id', documentId)
    .gt('heading_level', 0)
    .order('block_index', { ascending: true })
    .limit(1000)
  if (error) throw new Error(`加载目录失败: ${error.message}`)
  return (data ?? []).map((r) => ({
    key: r.block_index as number,
    blockIndex: r.block_index as number,
    level: r.heading_level as number,
    title: r.text as string,
    pageNo: r.page_no as number,
  })).filter((e) => e.title.trim().length > 0)
}

/**
 * 这篇文献现在该用哪份目录 —— 人工的优先, 没有人工的就返回 null 交给调用方现推。
 *
 * 判据是"表里有没有行", 而不是 resource_documents.toc_source 这个开关:
 * 开关只是记录管理员的意图(以及管理页那个"手工"标记), 而"表里有行"才是目录真的存在。
 * 万一出现开关说 manual、表里却是空的(改到一半、或将来某条写入路径漏了), 按开关走会让
 * 阅读页目录栏整栏变空、/create 一个章节都选不出来 —— 静默退化成"这篇没有目录"。
 */
export async function loadDocumentToc(documentId: string): Promise<TocEntry[] | null> {
  const manual = await loadManualToc(documentId).catch(() => [])
  return manual.length > 0 ? tocFromDraft(manual) : null
}

/**
 * 一篇文献的章节目录(带页码区间), 给"限定章节出题"当选项。
 *
 * 只取标题行而不是整篇区块: 一本 295 页的书有近两千个区块, 为了一个下拉框把全文拉下来
 * 太浪费; 标题行通常只有几十条, 而且 PostgREST 的 1000 行上限对它没有威胁。
 */
export async function loadDocumentSections(documentId: string): Promise<TocSection[]> {
  const doc = await getResourceDocument(documentId)
  const manual = await loadDocumentToc(documentId)
  const toc = manual ?? await loadAutoToc(documentId)
  return sectionsFromToc(toc, doc?.pdf_total_pages ?? 0)
}

/**
 * 取一篇文献某段页码区间里的区块。
 *
 * 按**页码区间**取而不是 `block_index in (...)` 取, 是为了避开 URL 长度: 一本 295 页的书
 * 有一千七百多个块, 把它们塞进 in(...) 会把请求行撑爆; 页码范围最多两个数字。
 * 需要精确到段时, 由调用方在拿回来的结果上按 blockIndex 过滤。
 */
export async function loadDocumentBlocks(
  documentId: string,
  range?: { from: number; to: number },
): Promise<ResourceBlock[]> {
  const out: ResourceBlock[] = []
  for (let offset = 0; ; offset += BLOCK_PAGE_SIZE) {
    let query = supabase
      .from('resource_blocks')
      .select('block_index, page_no, bbox, block_type, heading_level, text, image_url, table_html, code_language')
      .eq('document_id', documentId)
      .order('block_index', { ascending: true })
    if (range) query = query.gte('page_no', range.from).lte('page_no', range.to)

    const { data, error } = await query.range(offset, offset + BLOCK_PAGE_SIZE - 1)
    if (error) throw new Error(`加载区块失败: ${error.message}`)
    const rows = (data ?? []) as unknown as {
      block_index: number; page_no: number; bbox: number[] | null
      block_type: string; heading_level: number; text: string
      image_url: string | null; table_html: string | null; code_language: string | null
    }[]
    for (const r of rows) {
      out.push({
        blockIndex: r.block_index,
        pageNo: r.page_no,
        bbox: r.bbox,
        blockType: r.block_type,
        headingLevel: r.heading_level,
        text: r.text,
        imageUrl: r.image_url,
        tableHtml: r.table_html,
        codeLanguage: r.code_language,
      })
    }
    if (rows.length < BLOCK_PAGE_SIZE) break
  }
  return out
}

// ── 目录编辑器要用的两个轻量查询 ──

/**
 * 只取 block_index 的集合, 用来判断人工目录里哪些映射已经失效。
 * 不复用 loadDocumentBlocks: 那个会连 text/bbox 一起拉, 一本 295 页的书六千多个块,
 * 为了拿一组序号去拉好几 MB 正文不值得。
 */
export async function loadBlockIndexes(documentId: string): Promise<Set<number>> {
  const out = new Set<number>()
  for (let offset = 0; ; offset += BLOCK_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('resource_blocks')
      .select('block_index')
      .eq('document_id', documentId)
      .order('block_index', { ascending: true })
      .range(offset, offset + BLOCK_PAGE_SIZE - 1)
    if (error) throw new Error(`加载区块编号失败: ${error.message}`)
    const rows = (data ?? []) as unknown as { block_index: number }[]
    for (const r of rows) out.add(r.block_index)
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
      image_url: b.imageUrl ?? null,
      table_html: b.tableHtml ?? null,
      code_language: b.codeLanguage ?? null,
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
  /**
   * 强制重解析: 已成功的卷也重跑。
   *
   * 默认的 reparseResource 是"重试"语义 —— 跳过 parse_status=ready 且已有页图的卷,
   * 所以对一本已经解析好的书点「重新解析」等于什么都没做。
   * 解析器升级后要把旧产物刷掉(比如区块里缺 image_url / table_html)时会需要真重跑。
   */
  force?: boolean
}

/** 并发跑几卷。每卷自己会开一个 pdfjs 文档并同时渲染多页图, 所以这里只能给到 2。 */
const VOLUME_CONCURRENCY = 2

/** 批量解析轮询: 3 秒一次, 最多 30 分钟(vlm 解析一本 199 页的书可能跑十几分钟)。 */
const BATCH_POLL_TRIES = 600
const BATCH_POLL_INTERVAL_MS = 3000
/** 连续多少次状态查询失败就放弃这批, 剩下的交给单任务。 */
const BATCH_POLL_ERROR_LIMIT = 10

/**
 * 区块入库的临界区。
 *
 * block_index 是「本卷之前已经有多少个区块」现数出来的, 两卷并发时可能同时数到同一个数字,
 * 撞上 (document_id, block_index) 唯一索引。所以只把「数 + 插」这一段串起来 —— 真正慢的解析
 * 和页图渲染照旧并发。
 */
let blockWriteChain: Promise<unknown> = Promise.resolve()

function withBlockWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = blockWriteChain.then(fn, fn)
  blockWriteChain = run.catch(() => {})
  return run
}

async function mapLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      await fn(items[i], i)
    }
  }))
}

async function parseWithMinerU(
  pdfUrl: string,
  options: ParseOptions,
): Promise<ZipAssets> {
  const mineru = new MinerUClient()
  const onProgress = (msg: string) => options.producer?.({ step: msg })

  if (options.mode === 'lightweight') {
    const { markdown } = await mineru.parseUrlLightweight(
      pdfUrl,
      { pageRanges: options.pageRanges },
      onProgress,
    )
    // 轻量模式不返回 zip, 没有图片可传
    return { markdown, images: [] }
  }

  const token = getMinerUToken()
  // 空 token 不是错误: 不带 X-MinerU-Token 时由 mineru-proxy 补上平台那把 secret

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
 * 图片传 R2, 并把 markdown 里的 images/xxx.jpg 换成 R2 地址。
 *
 * 为什么要在落库前改写: MinerU 的 markdown 引的是产物内的相对路径, 那些文件从没上传过,
 * 于是整篇视图里每个图片位置都是 404 —— 正文本身是对的, 只是引用悬空。
 * 单张失败不影响整卷: 那条引用保持原文, 至少能看出少的是哪张图。
 */
async function uploadPartImages(
  documentId: string,
  partIndex: number,
  assets: ZipAssets,
  producer?: (p: ParseProgress) => void,
  label = '',
): Promise<{ markdown: string; imageUrls: Record<string, string> }> {
  const imageUrls: Record<string, string> = {}
  const total = assets.images.length
  if (total === 0) return { markdown: assets.markdown, imageUrls }

  producer?.({ step: `${label}正在上传解析出的图片 (${total} 张)...`, done: 0, total })
  const folder = `${documentPrefix(documentId)}/parts/${partIndex}/images`
  let done = 0

  await mapLimited(assets.images, 4, async (img) => {
    // 只用文件名: 产物里的 images/ 是平的, 带上目录前缀只是白搭一层
    const file = img.name.split('/').pop() || img.name
    try {
      imageUrls[img.name] = await putToR2(`${folder}/${file}`, img.blob, img.blob.type || 'image/jpeg')
    } catch (err) {
      console.warn('[resource] 图片上传失败, 正文里这条引用会保持原样:', img.name, err)
    }
    done++
    producer?.({ step: `${label}上传图片... ${done}/${total}`, done, total })
  })

  return { markdown: rewriteImageRefs(assets.markdown, imageUrls), imageUrls }
}

function rewriteImageRefs(markdown: string, imageUrls: Record<string, string>): string {
  if (Object.keys(imageUrls).length === 0) return markdown
  return markdown.replace(
    /(!\[[^\]]*\]\(\s*<?)([^)\s>]+)(>?\s*\))/g,
    (all, head: string, src: string, tail: string) =>
      imageUrls[src] ? `${head}${imageUrls[src]}${tail}` : all,
  )
}

/**
 * 解析产物 → 区块。
 * 单独一步是为了让 jsonData 尽快走出作用域: 199 页的 layout.json 有十几 MB,
 * 和后面的页图渲染(pdfjs 自己还要吃内存)挤在一起很容易把标签页拖垮。
 */
function blocksOf(
  parsed: { markdown: string; jsonData?: string },
  pageNumbers: number[],
  imageUrls?: Record<string, string>,
): ResourceBlock[] {
  const blocks = blocksFromParse(parsed.jsonData, parsed.markdown, pageNumbers, imageUrls)
  if (blocks.length === 0) throw new Error('解析结果为空, 未取得任何正文区块')
  return blocks
}

/** 一卷解析成功后: 传图片 → 建区块 → 渲染页图传 R2 → 落库。 */
async function finishPart(
  documentId: string,
  pdfUrl: string,
  part: ResourcePart,
  slice: PageSlice,
  parsed: ZipAssets,
  useRange: string | undefined,
  label: string,
  producer?: (p: ParseProgress) => void,
): Promise<{ blocks: number; pages: number }> {
  const { markdown, imageUrls } = await uploadPartImages(documentId, part.part_index, parsed, producer, label)

  producer?.({ step: `${label}正在建立目录与定位区块...` })
  const blocks = blocksOf({ markdown, jsonData: parsed.jsonData }, parsePageNumbers(useRange, slice.to), imageUrls)

  producer?.({ step: `${label}正在渲染 PDF 页面并上传 R2...` })
  const pages = await renderAndUploadPdfPages(
    pdfUrl,
    `${documentPrefix(documentId)}/parts/${part.part_index}/pages`,
    useRange,
    (done, total) => producer?.({ step: `${label}渲染页面并上传 R2... ${done}/${total}`, done, total }),
  )
  const goodPages = pages.filter((p) => p.src)

  await withBlockWriteLock(async () => {
    await replaceResourceBlocks(documentId, blocks, await countBlocksBefore(documentId, slice.from))
  })
  await patchPart(part.id, {
    page_urls: goodPages.length ? JSON.stringify(goodPages) : null,
    markdown,
    parse_status: 'ready',
    parse_error: null,
  })

  return { blocks: blocks.length, pages: goodPages.length }
}

/**
 * 把一卷标成失败, 返回带卷标签的错误信息。
 * 原先是 .catch(() => {}) 全吞: 会话过期时连 patchPart 也 401, 于是这一卷永远停在
 * parsing, 界面只会一直转, 看不出任何原因。至少把真实原因打出来。
 */
async function failPart(partId: string, label: string, err: unknown): Promise<string> {
  const message = err instanceof Error ? err.message : String(err)
  try {
    await patchPart(partId, { parse_status: 'failed', parse_error: message })
  } catch (patchErr) {
    console.error('[resource] 标记分卷失败时又出错, 该卷会停在 parsing:', patchErr)
  }
  return `${label}${message}`
}

/** 单任务流水线: 提交一个 task → 轮询 → 建区块 + 渲染页图 → 落库 */
async function runPart(
  documentId: string,
  pdfUrl: string,
  part: ResourcePart,
  slice: PageSlice,
  options: ParseOptions,
  useRange: string | undefined,
  label: string,
): Promise<{ blocks: number; pages: number }> {
  const producer = options.producer
  await patchPart(part.id, { parse_mode: options.mode, parse_status: 'parsing', parse_error: null })

  try {
    producer?.({ step: `${label}正在提交解析任务${useRange ? ` (第 ${useRange} 页)` : ''}...` })
    const parsed = await parseWithMinerU(pdfUrl, { ...options, pageRanges: useRange })
    return await finishPart(documentId, pdfUrl, part, slice, parsed, useRange, label, producer)
  } catch (err) {
    throw new Error(await failPart(part.id, label, err), { cause: err })
  }
}

interface VolumeJob {
  /** 分卷序号, 同时当批量任务的 data_id 用 —— 接口只认这个, 认不出同 URL 的不同卷 */
  index: number
  part: ResourcePart
  slice: PageSlice
  useRange: string | undefined
  label: string
  /** 本卷应该解析出多少页, 用来校验批量返回的结果 */
  expectedPages: number
}

interface VolumeOutcome {
  failures: string[]
  blocks: number
  pages: number
}

function volumeJob(
  slices: PageSlice[],
  index: number,
  part: ResourcePart,
  totalPages: number,
  explicitRanges?: string,
): VolumeJob {
  const slice = slices[index]
  // 本卷要发给 MinerU 的页码范围; undefined 表示这一卷就等于整篇, 不传能拿到完整版面信息。
  // 注意不能自己在这里判断"从第 1 页开始就不传": 多卷文档的第一卷也是从第 1 页开始,
  // 那样会让 MinerU 拿到整本书而报超过页数上限。
  const useRange = rangeForSlice(slices, index, totalPages, explicitRanges)
  return {
    index,
    part,
    slice,
    useRange,
    label: slices.length > 1 ? `[第 ${slice.from}-${slice.to} 页] ` : '',
    expectedPages: parsePageNumbers(useRange, slice.to).length,
  }
}

const volumeDataId = (index: number) => `v${index}`

/**
 * 多卷一次性提交给 MinerU 批量接口, 服务端同时解析, 总耗时约等于最慢的那一卷。
 *
 * 返回 null 表示这批根本没提交出去, 调用方直接走单任务并发池; 已经提交出去、但个别卷失败或者
 * 迟迟不收敛的, 放进 retry 让并发池重来一次 —— 单卷失败不该把整批成果一起扔掉。
 */
async function runPartsBatch(
  documentId: string,
  pdfUrl: string,
  jobs: VolumeJob[],
  options: ParseOptions,
): Promise<{ outcome: VolumeOutcome; retry: VolumeJob[] } | null> {
  const producer = options.producer
  // 空 token 是正常状态: 不带 X-MinerU-Token 时由 mineru-proxy 补上平台那把 secret
  const token = getMinerUToken()

  const mineru = new MinerUClient()
  const parseOptions: MinerUPrecisionOptions = {
    token,
    modelVersion: getMinerUModelVersion(),
    language: 'ch',
    enableFormula: true,
    enableTable: true,
  }

  producer?.({ step: `正在创建批量解析任务 (${jobs.length} 卷并行)...` })
  let batchId: string
  try {
    batchId = await mineru.createBatchTask(
      jobs.map((j) => ({ url: pdfUrl, dataId: volumeDataId(j.index), pageRanges: j.useRange })),
      parseOptions,
    )
  } catch (err) {
    console.warn('[resource] 批量解析任务创建失败, 退回单任务并发池:', err)
    return null
  }

  await Promise.all(jobs.map((j) =>
    patchPart(j.part.id, { parse_mode: options.mode, parse_status: 'parsing', parse_error: null })))

  const byDataId = new Map(jobs.map((j) => [volumeDataId(j.index), j]))
  const settled = new Map<number, MinerUBatchFileResult>()
  const isTerminal = (state: string) => state === 'done' || state === 'failed'
  let pollErrors = 0

  for (let i = 0; i < BATCH_POLL_TRIES; i++) {
    await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS))

    let status: MinerUBatchStatus
    try {
      status = await mineru.pollBatch(batchId, token)
      pollErrors = 0
    } catch (err) {
      // 单次查询失败当网络抖动忽略; 连续失败说明这批查不动了, 剩下的交给并发池
      if (++pollErrors >= BATCH_POLL_ERROR_LIMIT) {
        console.warn('[resource] 批量状态查询连续失败, 剩余分卷改用单任务:', err)
        break
      }
      continue
    }

    for (const f of status.files) {
      const job = f.dataId ? byDataId.get(f.dataId) : undefined
      if (job) settled.set(job.index, f)
    }

    const done = [...settled.values()].filter((f) => f.state === 'done').length
    const failed = [...settled.values()].filter((f) => f.state === 'failed').length
    producer?.({
      step: `批量解析中... 完成 ${done}/${jobs.length}${failed > 0 ? `, 失败 ${failed}` : ''}`,
      done,
      total: jobs.length,
    })
    if (settled.size === jobs.length && [...settled.values()].every((f) => isTerminal(f.state))) break
  }

  const outcome: VolumeOutcome = { failures: [], blocks: 0, pages: 0 }
  const retry: VolumeJob[] = []

  for (const job of jobs) {
    const result = settled.get(job.index)
    if (!result || !isTerminal(result.state)) {
      retry.push(job)
      continue
    }
    if (result.state === 'failed' || !result.fullZipUrl) {
      outcome.failures.push(await failPart(job.part.id, job.label, new Error(result.errMsg || '批量解析失败')))
      continue
    }

    try {
      producer?.({ step: `${job.label}正在提取解析结果...` })
      const parsed = await fetchZipAndExtractFiles(result.fullZipUrl)

      // 本卷只要了 N 页, 返回的却多于 N 页, 说明拿到的是整篇(多卷共用同一个 URL, 可能命中
      // 服务端按 URL 的缓存)。页码映射会整体错位且全程不报错, 所以退回单任务重解析一次。
      const gotPages = layoutPageCount(parsed.jsonData)
      if (gotPages > job.expectedPages) {
        console.warn(`[resource] ${job.label}批量返回 ${gotPages} 页 > 请求的 ${job.expectedPages} 页, 改用单任务重解析`)
        retry.push(job)
        continue
      }

      const r = await finishPart(documentId, pdfUrl, job.part, job.slice, parsed, job.useRange, job.label, producer)
      outcome.blocks += r.blocks
      outcome.pages += r.pages
      producer?.({ step: `${job.label}完成: ${r.blocks} 个区块 / ${r.pages} 页` })
    } catch (err) {
      outcome.failures.push(await failPart(job.part.id, job.label, err))
    }
  }

  return { outcome, retry }
}

/**
 * 跑完所有待解析的分卷。
 * 多卷优先走 MinerU 批量接口(服务端并行), 单卷、或者批量没提交出去, 就走单任务并发池。
 * 卷级失败只记进 failures 不中断 —— 一卷挂了不该把其它卷已经烧掉的额度一起废掉。
 */
async function runVolumeJobs(
  documentId: string,
  pdfUrl: string,
  jobs: VolumeJob[],
  options: ParseOptions,
): Promise<VolumeOutcome> {
  const outcome: VolumeOutcome = { failures: [], blocks: 0, pages: 0 }
  let pending = jobs

  if (jobs.length > 1 && options.mode === 'precision') {
    const batch = await runPartsBatch(documentId, pdfUrl, jobs, options)
    if (batch) {
      outcome.failures.push(...batch.outcome.failures)
      outcome.blocks += batch.outcome.blocks
      outcome.pages += batch.outcome.pages
      pending = batch.retry
      if (pending.length > 0) options.producer?.({ step: `${pending.length} 卷改用单任务重解析...` })
    }
  }

  // 强制重解析改成串行: 区块是先清空再重建的, 而 block_index 由"本卷之前有多少个区块"现数出来,
  // 并发跑两卷会同时数到同一个数字, 撞 (document_id, block_index) 唯一索引。
  await mapLimited(pending, options.force ? 1 : VOLUME_CONCURRENCY, async (job, i) => {
    options.producer?.({ step: `${job.label}开始解析 (${i + 1}/${pending.length})...` })
    try {
      const r = await runPart(documentId, pdfUrl, job.part, job.slice, options, job.useRange, job.label)
      outcome.blocks += r.blocks
      outcome.pages += r.pages
      options.producer?.({ step: `${job.label}完成: ${r.blocks} 个区块 / ${r.pages} 页` })
    } catch (err) {
      outcome.failures.push(err instanceof Error ? err.message : String(err))
    }
  })

  return outcome
}

/**
 * 录入一篇原始文献: 建行 → 上传 PDF 到 R2 → 按 200 页切卷解析 → 落区块。
 * 多卷走 MinerU 批量接口并行解析; 每一卷成功就立刻落库, 所以某一卷失败时其它卷的成果不会白费,
 * 重试会跳过已成功的卷。
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
    const pdfUrl = await putToR2(pdfKey, file, 'application/pdf', (loaded, total) => {
      producer?.({ step: `正在上传 PDF 到 R2... ${Math.round((loaded / total) * 100)}%`, done: loaded, total })
    })

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

    const jobs = parts.map((part, i) => volumeJob(slices, i, part, totalPages, options.pageRanges))
    const outcome = await runVolumeJobs(documentId, pdfUrl, jobs, options)
    if (outcome.failures.length > 0) throw new Error(outcome.failures.join(' | '))

    await updateResourceDocument(documentId, { parse_status: 'ready', parse_error: null })
    // 解析完顺手建索引。已发布才真的会建(服务端对未发布文献返回空集),
    // 但这里不做判断: 发布态可能刚刚改过, 让服务端按库里的实际状态决定更省事。
    autoIndex('resource', documentId)
    producer?.({ step: `全部完成: ${parts.length} 卷 / ${outcome.blocks} 个区块 / ${totalPages} 页` })
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

  // 强制重解析必须先把旧区块清掉: block_index 是按"本卷之前有多少个区块"现数出来的,
  // 同一段页码范围再插一遍就会和旧区块混在一起, 要么重复要么撞唯一索引。
  if (!sameLayout || options.force) await clearResourceBlocks(documentId)

  try {
    await updateResourceDocument(documentId, {
      parse_mode: options.mode,
      pdf_total_pages: totalPages,
      parse_status: 'parsing',
      parse_error: null,
    })

    let skipped = 0
    const jobs: VolumeJob[] = []
    for (let i = 0; i < parts.length; i++) {
      const label = parts.length > 1 ? `[第 ${slices[i].from}-${slices[i].to} 页] ` : ''
      // force 时不看卷的状态, 每个卷都要重新提交一次 MinerU 任务
      if (!options.force && sameLayout && parts[i].parse_status === 'ready' && parts[i].page_urls) {
        skipped++
        producer?.({ step: `${label}已成功, 跳过` })
        continue
      }
      jobs.push(volumeJob(slices, i, parts[i], totalPages, options.pageRanges))
    }

    const outcome = await runVolumeJobs(documentId, doc.pdf_url, jobs, options)
    if (outcome.failures.length > 0) throw new Error(outcome.failures.join(' | '))

    await updateResourceDocument(documentId, { parse_status: 'ready', parse_error: null })
    autoIndex('resource', documentId)
    producer?.({ step: skipped > 0 ? `完成 (跳过 ${skipped} 个已成功的卷)` : '完成' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateResourceDocument(documentId, { parse_status: 'failed', parse_error: message }).catch(() => {})
    throw err
  }
}
