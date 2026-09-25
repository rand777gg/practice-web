/**
 * 资料库与检索索引的持久化层 —— 8 张表: 文献、分卷、区块、人工目录、知识点范围、知识点依据、
 * 检索块、AI 导入历史。
 *
 * 只做表的读写与「行 → 领域对象」。MinerU 解析流水线(resource-library)、索引同步(rag)、
 * 目录/依据的事务型 RPC 那些编排留在各自的 lib 里 —— 它们是本层的调用方。
 *
 * 领域类型在这里写死而不是去引 lib 里的同名类型: 本层是数据边界, 该由它声明「从库里读出来的东西
 * 长什么样」; 反过来引会让这个边界跟着 lib 一起漂移。纯计算模块里的类型(区块/目录/范围/依据)
 * 照旧复用 —— 它们本来就不碰数据库。
 */
import type { ParsedQuestion } from '@/lib/ai/types'
import type { PageUrl } from '@/lib/pdf-page-renderer'
import type { KpResourceRef } from '@/lib/kp-resource-refs'
import type { RagSource } from '@/lib/rag'
import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'
import type { ResourceKpScope, ResourceKpScopeDraft } from '@/lib/resource-kp-scopes'
import type { TocDraftEntry } from '@/lib/resource-toc'
import { db, fetchAll, fetchInChunks, run, runCount, runList, type Insert, type QueryOptions, type Update } from './db'
import { AppError } from './errors'
import { assertColumns } from './columns'

// ── 文献 ──

/**
 * 文献的列集。
 *
 * 列表不下发 markdown: 一本 295 页的书正文有好几 MB, 管理页与文献库只认元数据。
 * JSON 型内容(pdf_page_urls)在这张表里是 TEXT 而不是 JSONB(见迁移里的列定义), 所以读出来
 * 仍是字符串、写进去仍是 JSON.stringify —— 解析它的助手(pageUrlsOf)留在 lib/resource-library。
 */
export type ResourceDocumentSource = {
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
  toc_source: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceDocumentDetailSource = ResourceDocumentSource & { markdown: string }

export const RESOURCE_DOCUMENT_COLUMNS = assertColumns<ResourceDocumentDetailSource>()(
  'id, title, authors, source, pub_year, doc_type, subject, tags, abstract, doi, language, pdf_url, pdf_key, pdf_total_pages, pdf_page_urls, parse_mode, parse_status, parse_error, is_published, toc_source, uploaded_by, created_at, updated_at, markdown',
)

export const RESOURCE_DOCUMENT_LIST_COLUMNS = assertColumns<ResourceDocumentSource>()(
  'id, title, authors, source, pub_year, doc_type, subject, tags, abstract, doi, language, pdf_url, pdf_key, pdf_total_pages, pdf_page_urls, parse_mode, parse_status, parse_error, is_published, toc_source, uploaded_by, created_at, updated_at',
)

export type ResourceDocumentTitleSource = Pick<ResourceDocumentSource, 'id' | 'title'>

const RESOURCE_DOCUMENT_TITLE_COLUMNS = assertColumns<ResourceDocumentTitleSource>()('id, title')
const RESOURCE_DOCUMENT_ID_COLUMNS = assertColumns<{ id: string }>()('id')

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
  toc_source: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceDocumentDetail = ResourceDocument & { markdown: string }

/** 只需要认人的场合(知识点范围补标题、小Q 的参数卡片、章节选择) */
export interface ResourceDocumentTitle {
  id: string
  title: string
}

/** 新建时的元数据; 其余列交给库里的默认值(parse_status 等由解析流水线后续改写) */
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

export type ResourceDocumentPatch = Update<'resource_documents'>

export function toResourceDocument(row: ResourceDocumentSource): ResourceDocument {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors,
    source: row.source,
    pub_year: row.pub_year,
    doc_type: row.doc_type,
    subject: row.subject,
    tags: row.tags,
    abstract: row.abstract,
    doi: row.doi,
    language: row.language,
    pdf_url: row.pdf_url,
    pdf_key: row.pdf_key,
    pdf_total_pages: row.pdf_total_pages,
    pdf_page_urls: row.pdf_page_urls,
    parse_mode: row.parse_mode,
    parse_status: row.parse_status,
    parse_error: row.parse_error,
    is_published: row.is_published,
    toc_source: row.toc_source,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function toResourceDocumentDetail(row: ResourceDocumentDetailSource): ResourceDocumentDetail {
  return { ...toResourceDocument(row), markdown: row.markdown }
}

/** 文献库与管理页: 全表按录入时间倒序 */
export async function listResourceDocuments(options: QueryOptions = {}): Promise<ResourceDocument[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db.from('resource_documents').select(RESOURCE_DOCUMENT_LIST_COLUMNS).order('created_at', { ascending: false })
      return (options.signal ? base.abortSignal(options.signal) : base).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceDocuments' },
  )
  return rows.map(toResourceDocument)
}

/** 阅读页/解析页要的整篇: 元数据 + markdown */
export async function fetchResourceDocument(id: string, options: QueryOptions = {}): Promise<ResourceDocumentDetail | null> {
  const base = db.from('resource_documents').select(RESOURCE_DOCUMENT_COLUMNS).eq('id', id)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'resources.fetchResourceDocument' },
  )
  return row ? toResourceDocumentDetail(row) : null
}

/** 按 id 批量取标题 —— 知识点范围反查时要连着文献标题一起给 */
export async function fetchDocumentTitles(ids: string[], options: QueryOptions = {}): Promise<ResourceDocumentTitle[]> {
  return fetchInChunks(
    ids,
    (chunk) => {
      const base = db.from('resource_documents').select(RESOURCE_DOCUMENT_TITLE_COLUMNS).in('id', chunk)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'resources.fetchDocumentTitles' },
  )
}

/** 小Q 的参数卡片只列已发布的文献 */
export async function listPublishedDocuments(options: QueryOptions = {}): Promise<ResourceDocumentTitle[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('resource_documents')
        .select(RESOURCE_DOCUMENT_TITLE_COLUMNS)
        .eq('is_published', true)
        .order('created_at', { ascending: true })
      return (options.signal ? base.abortSignal(options.signal) : base).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listPublishedDocuments' },
  )
  return rows.map((row) => ({ id: row.id, title: row.title }))
}

/** 先建行拿到 id, 才能让 R2 key 带 id 前缀(PDF 与页图都用它) */
export async function createResourceDocument(input: DocumentMetaInput, options: QueryOptions = {}): Promise<string> {
  const base = db
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
    .select(RESOURCE_DOCUMENT_ID_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'resources.createResourceDocument' },
  )
  if (!row) throw new AppError({ kind: 'not_found', message: 'resources.createResourceDocument: 创建后没有返回行' })
  return row.id
}

/** updated_at 在这张表上没有触发器, 由本层统一带上, 免得每条写入路径各自记得 */
export async function updateResourceDocument(
  id: string,
  patch: ResourceDocumentPatch,
  options: QueryOptions = {},
): Promise<void> {
  const base = db
    .from('resource_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.updateResourceDocument' },
  )
}

/** 只删行: R2 上的原件与页图由 lib/resource-library 的 deleteDocumentAssets 负责 */
export async function deleteResourceDocument(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('resource_documents').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.deleteResourceDocument' },
  )
}

// ── 分卷 ──

export type ResourcePartSource = {
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

export const RESOURCE_PART_COLUMNS = assertColumns<ResourcePartSource>()(
  'id, document_id, part_index, page_from, page_to, page_urls, markdown, parse_mode, parse_status, parse_error, created_at, updated_at',
)

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

export type ResourcePartInsert = Omit<Insert<'resource_parts'>, 'document_id'>
export type ResourcePartPatch = Update<'resource_parts'>

export function toResourcePart(row: ResourcePartSource): ResourcePart {
  return {
    id: row.id,
    document_id: row.document_id,
    part_index: row.part_index,
    page_from: row.page_from,
    page_to: row.page_to,
    page_urls: row.page_urls,
    markdown: row.markdown,
    parse_mode: row.parse_mode,
    parse_status: row.parse_status,
    parse_error: row.parse_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** 不传 documentId 就是全部(管理页要一次拿到所有分卷状态) */
export async function listResourceParts(documentId?: string, options: QueryOptions = {}): Promise<ResourcePart[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db.from('resource_parts').select(RESOURCE_PART_COLUMNS).order('part_index', { ascending: true })
      const scoped = documentId ? base.eq('document_id', documentId) : base
      return (options.signal ? scoped.abortSignal(options.signal) : scoped).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceParts' },
  )
  return rows.map(toResourcePart)
}

/**
 * 一卷一套行: 先删旧再插新。
 *
 * 分卷是解析的输入参数(页码区间), 重排分卷只有这一个入口 —— 逐条改会把旧卷的解析产物接到
 * 新的页码上, 而两边都不报错。
 */
export async function replaceResourceParts(
  documentId: string,
  parts: ResourcePartInsert[],
  options: QueryOptions = {},
): Promise<ResourcePart[]> {
  const del = db.from('resource_parts').delete().eq('document_id', documentId)
  await run(
    () => (options.signal ? del.abortSignal(options.signal) : del),
    { ...options, context: options.context ?? 'resources.replaceResourceParts.delete' },
  )
  if (parts.length === 0) return []

  const insert = db
    .from('resource_parts')
    .insert(parts.map((part) => ({ ...part, document_id: documentId })))
    .select(RESOURCE_PART_COLUMNS)
  const rows = await runList(
    () => (options.signal ? insert.abortSignal(options.signal) : insert),
    { ...options, context: options.context ?? 'resources.replaceResourceParts.insert' },
  )
  return rows.map(toResourcePart)
}

/** updated_at 同文献: 这张表也没有触发器 */
export async function updateResourcePart(
  partId: string,
  patch: ResourcePartPatch,
  options: QueryOptions = {},
): Promise<void> {
  const base = db
    .from('resource_parts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', partId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.updateResourcePart' },
  )
}

// ── 区块 ──

export type ResourceBlockSource = {
  block_index: number
  page_no: number
  bbox: number[] | null
  block_type: string
  heading_level: number
  text: string
  image_url: string | null
  table_html: string | null
  code_language: string | null
}

export type ResourceBlockHeadingSource = Pick<ResourceBlockSource, 'block_index' | 'page_no' | 'heading_level' | 'text'>

export const RESOURCE_BLOCK_COLUMNS = assertColumns<ResourceBlockSource>()(
  'block_index, page_no, bbox, block_type, heading_level, text, image_url, table_html, code_language',
)

const RESOURCE_BLOCK_HEADING_COLUMNS = assertColumns<ResourceBlockHeadingSource>()('block_index, page_no, heading_level, text')
const RESOURCE_BLOCK_INDEX_COLUMNS = assertColumns<Pick<ResourceBlockSource, 'block_index'>>()('block_index')
const RESOURCE_BLOCK_ID_COLUMNS = assertColumns<{ id: number }>()('id')

export function toResourceBlock(row: ResourceBlockSource): ResourceBlock {
  return {
    blockIndex: row.block_index,
    pageNo: row.page_no,
    bbox: row.bbox,
    blockType: row.block_type,
    headingLevel: row.heading_level,
    text: row.text,
    imageUrl: row.image_url,
    tableHtml: row.table_html,
    codeLanguage: row.code_language,
  }
}

export function toTocEntry(row: ResourceBlockHeadingSource): TocEntry {
  return {
    key: row.block_index,
    blockIndex: row.block_index,
    level: row.heading_level,
    title: row.text,
    pageNo: row.page_no,
  }
}

/**
 * 一篇文献的区块; 传 range 就只取这一段页码。
 *
 * 按**页码区间**收窄而不是 `block_index in (...)`: 一本 295 页的书有一千七百多个块,
 * 把它们塞进 in(...) 会把请求行撑爆, 而页码范围最多两个数字。
 */
export async function listResourceBlocks(
  documentId: string,
  range?: { from: number; to: number },
  options: QueryOptions = {},
): Promise<ResourceBlock[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('resource_blocks')
        .select(RESOURCE_BLOCK_COLUMNS)
        .eq('document_id', documentId)
        .order('block_index', { ascending: true })
      const scoped = range ? base.gte('page_no', range.from).lte('page_no', range.to) : base
      return (options.signal ? scoped.abortSignal(options.signal) : scoped).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceBlocks' },
  )
  return rows.map(toResourceBlock)
}

/**
 * 标题行 —— 目录现推与"限定章节出题"的选项都走它。
 *
 * 必须翻页取全: PostgREST 单次上限 1000 行, 而一本 544 页的书有一千多个标题, 截断之后后半本
 * 书的节会全部缺失(缺了还不报错, 只是整章内容被算到别的节头上)。空标题行在这里就去掉 ——
 * 它不是目录项, 两个调用方本来也各自滤一遍。
 */
export async function listResourceBlockHeadings(documentId: string, options: QueryOptions = {}): Promise<TocEntry[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('resource_blocks')
        .select(RESOURCE_BLOCK_HEADING_COLUMNS)
        .eq('document_id', documentId)
        .gt('heading_level', 0)
        .order('block_index', { ascending: true })
      return (options.signal ? base.abortSignal(options.signal) : base).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceBlockHeadings' },
  )
  return rows.map(toTocEntry).filter((entry) => entry.title.trim().length > 0)
}

/** 只要序号: 判断人工目录里哪些映射已经失效时用, 不为此拉整篇正文 */
export async function listResourceBlockIndexes(documentId: string, options: QueryOptions = {}): Promise<number[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('resource_blocks')
        .select(RESOURCE_BLOCK_INDEX_COLUMNS)
        .eq('document_id', documentId)
        .order('block_index', { ascending: true })
      return (options.signal ? base.abortSignal(options.signal) : base).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceBlockIndexes' },
  )
  return rows.map((row) => row.block_index)
}

/** 分批插入: 一本 295 页的书有六千多个块, 一个请求装不下 */
const BLOCK_INSERT_CHUNK = 400

export async function replaceResourceBlocks(
  documentId: string,
  blocks: ResourceBlock[],
  baseIndex = 0,
  options: QueryOptions = {},
): Promise<void> {
  for (let i = 0; i < blocks.length; i += BLOCK_INSERT_CHUNK) {
    const rows = blocks.slice(i, i + BLOCK_INSERT_CHUNK).map((block) => ({
      document_id: documentId,
      block_index: baseIndex + block.blockIndex,
      page_no: block.pageNo,
      bbox: block.bbox,
      block_type: block.blockType,
      heading_level: block.headingLevel,
      text: block.text,
      image_url: block.imageUrl ?? null,
      table_html: block.tableHtml ?? null,
      code_language: block.codeLanguage ?? null,
    }))
    const base = db.from('resource_blocks').insert(rows)
    await run(
      () => (options.signal ? base.abortSignal(options.signal) : base),
      { ...options, context: options.context ?? `resources.replaceResourceBlocks[${i}]` },
    )
  }
}

export async function deleteResourceBlocks(documentId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('resource_blocks').delete().eq('document_id', documentId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.deleteResourceBlocks' },
  )
}

/**
 * 某一卷写入前, 已有多少个区块排在它前面。
 *
 * 用「页码小于本卷起始页的区块数」现数, 而不是跨卷累加变量: 重试会跳过已成功的卷,
 * 累加变量对跳过的卷不前进, 下一卷就会从 0 开始编号, 撞 (document_id, block_index) 唯一索引。
 */
export async function countResourceBlocksBefore(
  documentId: string,
  pageFrom: number,
  options: QueryOptions = {},
): Promise<number> {
  const base = db
    .from('resource_blocks')
    .select(RESOURCE_BLOCK_ID_COLUMNS, { count: 'exact', head: true })
    .eq('document_id', documentId)
    .lt('page_no', pageFrom)
  const query = options.signal ? base.abortSignal(options.signal) : base
  const { count } = await runCount(() => query, { ...options, context: options.context ?? 'resources.countResourceBlocksBefore' })
  return count
}

// ── 人工目录 ──

export type ResourceTocEntrySource = {
  id: number
  level: number
  title: string
  block_index: number | null
  page_no: number
}

export const RESOURCE_TOC_ENTRY_COLUMNS = assertColumns<ResourceTocEntrySource>()('id, level, title, block_index, page_no')

/**
 * 人工目录(空数组 = 这篇没有人工版, 调用方按 heading_level 现推)。
 *
 * 读走这里、写走 RPC save_resource_toc / reset_resource_toc: 删旧 + 插新 + 翻 toc_source 必须在
 * 同一个事务里, 拆成两个请求的话中间一失败, 管理员刚编完的整份目录就没了。
 */
export async function listResourceTocEntries(documentId: string, options: QueryOptions = {}): Promise<TocDraftEntry[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('resource_toc_entries')
        .select(RESOURCE_TOC_ENTRY_COLUMNS)
        .eq('document_id', documentId)
        .order('sort_order', { ascending: true })
      return (options.signal ? base.abortSignal(options.signal) : base).range(from, to)
    },
    { ...options, context: options.context ?? 'resources.listResourceTocEntries' },
  )
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    title: row.title,
    blockIndex: row.block_index,
    pageNo: row.page_no,
  }))
}

// ── 知识点范围 ──

export type ResourceKpScopeSource = {
  id: string
  document_id: string
  subject: string
  kp: string
  block_from: number
  block_to: number
  page_from: number
  page_to: number
  toc_title: string
  toc_level: number
  note: string
  created_at: string
}

export const RESOURCE_KP_SCOPE_COLUMNS = assertColumns<ResourceKpScopeSource>()(
  'id, document_id, subject, kp, block_from, block_to, page_from, page_to, toc_title, toc_level, note, created_at',
)

/** 行 → 对象; documentTitle 由调用方按 document_id 补(单篇列表里留空串) */
export function toResourceKpScope(row: ResourceKpScopeSource, documentTitle = ''): ResourceKpScope {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle,
    subject: row.subject,
    kp: row.kp,
    blockFrom: row.block_from,
    blockTo: row.block_to,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    tocTitle: row.toc_title,
    tocLevel: row.toc_level,
    note: row.note,
    createdAt: row.created_at,
  }
}

/**
 * 从知识点那一侧反查时要连着文献标题一起取回("第 74-90 页"单独看没有意义)。
 * 查不到的按"已下线"处理 —— 文献删了不该让这一行从解读里消失。
 */
async function withDocumentTitles(rows: ResourceKpScopeSource[], options: QueryOptions): Promise<ResourceKpScope[]> {
  if (rows.length === 0) return []
  const docs = await fetchDocumentTitles([...new Set(rows.map((row) => row.document_id))], options)
  const titles = new Map(docs.map((doc) => [doc.id, doc.title]))
  return rows.map((row) => toResourceKpScope(row, titles.get(row.document_id) ?? '（文献已下线）'))
}

/** 这一篇里圈出来的范围(阅读页那一栏; 全体登录用户都能读) */
export async function listDocumentScopes(documentId: string, options: QueryOptions = {}): Promise<ResourceKpScope[]> {
  if (!documentId) return []
  const base = db
    .from('resource_kp_scopes')
    .select(RESOURCE_KP_SCOPE_COLUMNS)
    .eq('document_id', documentId)
    .order('block_from', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listDocumentScopes' },
  )
  return rows.map((row) => toResourceKpScope(row))
}

/** 这个知识点的材料都在哪几篇哪几段 —— 知识点解读、专题、路线图都走这一条 */
export async function listScopesForKp(subject: string, kp: string, options: QueryOptions = {}): Promise<ResourceKpScope[]> {
  if (!subject || !kp) return []
  const base = db
    .from('resource_kp_scopes')
    .select(RESOURCE_KP_SCOPE_COLUMNS)
    .eq('subject', subject)
    .eq('kp', kp)
    .order('page_from', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listScopesForKp' },
  )
  return withDocumentTitles(rows, options)
}

/** 一个学科下所有知识点的范围(专题页按学科列材料时用) */
export async function listSubjectScopes(
  subject: string,
  limit = 200,
  options: QueryOptions = {},
): Promise<ResourceKpScope[]> {
  if (!subject) return []
  const base = db
    .from('resource_kp_scopes')
    .select(RESOURCE_KP_SCOPE_COLUMNS)
    .eq('subject', subject)
    .order('kp', { ascending: true })
    .order('page_from', { ascending: true })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listSubjectScopes' },
  )
  return withDocumentTitles(rows, options)
}

/**
 * 指定的这几个知识点的范围(学习路线的某个阶段用)。
 *
 * 只按 kp 名捞一次再在本地按 (学科, kp) 收口 —— 知识点名理论上可能重名于两个学科, 而
 * `or=(subject,kp).in.(...)` 这种行值过滤在 PostgREST 上写出来没人看得懂。
 */
export async function listScopesForSubjectKps(
  pairs: { subject: string; kp: string }[],
  limit = 200,
  options: QueryOptions = {},
): Promise<ResourceKpScope[]> {
  const kps = [...new Set(pairs.map((pair) => pair.kp).filter(Boolean))]
  if (kps.length === 0) return []
  const base = db
    .from('resource_kp_scopes')
    .select(RESOURCE_KP_SCOPE_COLUMNS)
    .in('kp', kps)
    .order('page_from', { ascending: true })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listScopesForSubjectKps' },
  )
  const wanted = new Set(pairs.map((pair) => `${pair.subject}\u0000${pair.kp}`))
  return withDocumentTitles(rows.filter((row) => wanted.has(`${row.subject}\u0000${row.kp}`)), options)
}

export async function createKpScope(draft: ResourceKpScopeDraft, options: QueryOptions = {}): Promise<void> {
  // created_by 只是留痕: 取不到就写 null, 没权限的写入照样会被 RLS 拦下
  const { data } = await db.auth.getUser()
  const base = db.from('resource_kp_scopes').insert({
    document_id: draft.documentId,
    subject: draft.subject,
    kp: draft.kp,
    block_from: draft.blockFrom,
    block_to: draft.blockTo,
    page_from: draft.pageFrom,
    page_to: draft.pageTo,
    toc_title: draft.tocTitle,
    toc_level: draft.tocLevel,
    note: draft.note,
    created_by: data.user?.id ?? null,
  })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.createKpScope' },
  )
}

export async function deleteKpScope(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('resource_kp_scopes').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.deleteKpScope' },
  )
}

// ── 知识点依据 ──

export type KpResourceRefSource = {
  id: string
  subject: string
  kp: string
  document_id: string | null
  block_index: number | null
  page_from: number
  page_to: number
  blocks: number[]
  doc_title: string
  label: string
  snippet: string
  note: string
  sort_order: number
}

export const KP_RESOURCE_REF_COLUMNS = assertColumns<KpResourceRefSource>()(
  'id, subject, kp, document_id, block_index, page_from, page_to, blocks, doc_title, label, snippet, note, sort_order',
)

export function toKpResourceRef(row: KpResourceRefSource): KpResourceRef {
  return {
    id: row.id,
    subject: row.subject,
    kp: row.kp,
    documentId: row.document_id,
    blockIndex: row.block_index,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    blocks: row.blocks,
    docTitle: row.doc_title,
    label: row.label,
    snippet: row.snippet,
    note: row.note,
    sortOrder: row.sort_order,
  }
}

/**
 * 某条解读的全部依据。
 *
 * 写走 RPC save_kp_resource_refs: 那是一条有序清单, 删旧插新要在一个事务里, 分条增删改还要处理
 * id; 快照(页码/文献标题/摘录)也由服务端从 resource_blocks 补齐, 前端不传。
 */
export async function listKpRefs(subject: string, kp: string, options: QueryOptions = {}): Promise<KpResourceRef[]> {
  if (!subject || !kp) return []
  const base = db
    .from('kp_resource_refs')
    .select(KP_RESOURCE_REF_COLUMNS)
    .eq('subject', subject)
    .eq('kp', kp)
    .order('sort_order', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listKpRefs' },
  )
  return rows.map(toKpResourceRef)
}

/** 某篇文献被哪些解读引为依据 —— 阅读页的块标记用这条反查 */
export async function listDocumentRefs(documentId: string, options: QueryOptions = {}): Promise<KpResourceRef[]> {
  if (!documentId) return []
  const base = db
    .from('kp_resource_refs')
    .select(KP_RESOURCE_REF_COLUMNS)
    .eq('document_id', documentId)
    .order('sort_order', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.listDocumentRefs' },
  )
  return rows.map(toKpResourceRef)
}

// ── 检索块 ──

export type RagChunkSource = {
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

export const RAG_CHUNK_COLUMNS = assertColumns<RagChunkSource>()(
  'id, source, source_id, chunk_index, label, sub_label, content, page_no, block_index, anchor, embedded_at, created_at',
)

const RAG_CHUNK_ID_COLUMNS = assertColumns<{ id: number }>()('id')

export interface RagChunk {
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

export interface RagChunkFilters {
  source?: RagSource | null
  keyword?: string
  limit?: number
  offset?: number
}

export interface RagChunkPage {
  rows: RagChunk[]
  /** 命中总数(不受分页影响): 管理页要显示"共 N 块" */
  total: number
}

export interface ResourceChunkCounts {
  chunks: number
  embedded: number
}

export function toRagChunk(row: RagChunkSource): RagChunk {
  return {
    id: row.id,
    source: row.source as RagSource,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    label: row.label,
    subLabel: row.sub_label,
    content: row.content,
    pageNo: row.page_no,
    blockIndex: row.block_index,
    anchor: row.anchor,
    embedded: row.embedded_at !== null,
    createdAt: row.created_at,
  }
}

/** 浏览索引里的块。关键词按 content 子串匹配 —— 这是给人核对的工具, 不走向量 */
export async function listRagChunks(filters: RagChunkFilters = {}, options: QueryOptions = {}): Promise<RagChunkPage> {
  const limit = filters.limit ?? 20
  const offset = filters.offset ?? 0
  const keyword = filters.keyword?.trim() ?? ''

  const base = db.from('rag_chunks').select(RAG_CHUNK_COLUMNS, { count: 'exact' })
  const bySource = filters.source ? base.eq('source', filters.source) : base
  const byKeyword = keyword ? bySource.ilike('content', `%${keyword}%`) : bySource
  const query = (options.signal ? byKeyword.abortSignal(options.signal) : byKeyword)
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  const { rows, count } = await runCount(() => query, { ...options, context: options.context ?? 'resources.listRagChunks' })
  return { rows: rows.map(toRagChunk), total: count }
}

/**
 * 一份材料在检索索引里的块数与已向量化块数。
 * 0 块 = 检索恒为空, 页面上必须先让人看见这一点(所以这里只计数, 不把块拉回来)。
 */
export async function countResourceChunks(documentId: string, options: QueryOptions = {}): Promise<ResourceChunkCounts> {
  const countOf = (onlyEmbedded: boolean) => {
    const base = db
      .from('rag_chunks')
      .select(RAG_CHUNK_ID_COLUMNS, { count: 'exact', head: true })
      .eq('source', 'resource')
      .eq('source_id', documentId)
    const scoped = onlyEmbedded ? base.not('embedded_at', 'is', null) : base
    const query = options.signal ? scoped.abortSignal(options.signal) : scoped
    return runCount(() => query, { ...options, context: options.context ?? 'resources.countResourceChunks' })
  }

  const [all, embedded] = await Promise.all([countOf(false), countOf(true)])
  return { chunks: all.count, embedded: embedded.count }
}

// ── AI 导入历史 ──

export type ParseHistorySource = {
  id: number
  file_name: string
  display_name: string | null
  markdown: string
  json_data: string | null
  questions_json: string | null
  status_json: string | null
  page_ranges: string | null
  pdf_total_pages: number | null
  pdf_page_urls: string | null
  mode: string
  created_at: string
  subject: string | null
  category: string | null
  key_points: string | null
}

export const PARSE_HISTORY_COLUMNS = assertColumns<ParseHistorySource>()(
  'id, file_name, display_name, markdown, json_data, questions_json, status_json, page_ranges, pdf_total_pages, pdf_page_urls, mode, created_at, subject, category, key_points',
)

const PARSE_HISTORY_ID_COLUMNS = assertColumns<{ id: number }>()('id')

/**
 * 历史记录的一行。questions_json / status_json / pdf_page_urls 在库里是 TEXT(存的是 JSON 文本,
 * 不是 JSONB), json_data 是 MinerU 的原始 JSON —— 都是几 MB 级别, 原样给出去, 由用它的解析器与
 * 渲染器自己 parse。
 */
export interface ParseHistoryEntry {
  id: number
  file_name: string
  display_name: string | null
  markdown: string
  json_data: string | null
  questions_json: string | null
  status_json: string | null
  page_ranges: string | null
  pdf_total_pages: number | null
  pdf_page_urls: string | null
  mode: string
  created_at: string
  subject: string | null
  category: string | null
  key_points: string | null
}

export interface ParseHistoryInput {
  userId: string
  fileName: string
  markdown: string
  mode: string
  pageRanges?: string | null
  pdfTotalPages?: number | null
  /** MinerU 原始 JSON: 只有解析器自己要, 原样存不解析 */
  jsonData?: string | null
  questions?: ParsedQuestion[] | null
  /** 解析进度快照(轻量与精准解析各自的状态对象) */
  status?: Record<string, unknown> | null
  extraFormats?: string[] | null
  subject?: string | null
  category?: string | null
  keyPoints?: string | null
}

export type ParseHistoryPatch = Update<'parse_history'>

export function toParseHistoryEntry(row: ParseHistorySource): ParseHistoryEntry {
  return {
    id: row.id,
    file_name: row.file_name,
    display_name: row.display_name,
    markdown: row.markdown,
    json_data: row.json_data,
    questions_json: row.questions_json,
    status_json: row.status_json,
    page_ranges: row.page_ranges,
    pdf_total_pages: row.pdf_total_pages,
    pdf_page_urls: row.pdf_page_urls,
    mode: row.mode,
    created_at: row.created_at,
    subject: row.subject,
    category: row.category,
    key_points: row.key_points,
  }
}

/** 导入历史列表, 新 → 旧; 一次 50 条, 滚到底再取下一页 */
export async function listParseHistory(
  userId: string,
  options: QueryOptions & { limit?: number; offset?: number } = {},
): Promise<ParseHistoryEntry[]> {
  const { limit = 50, offset = 0, ...query } = options
  const base = db
    .from('parse_history')
    .select(PARSE_HISTORY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  const rows = await runList(
    () => (query.signal ? base.abortSignal(query.signal) : base),
    { ...query, context: query.context ?? 'resources.listParseHistory' },
  )
  return rows.map(toParseHistoryEntry)
}

export async function createParseHistory(input: ParseHistoryInput, options: QueryOptions = {}): Promise<number> {
  const base = db
    .from('parse_history')
    .insert({
      user_id: input.userId,
      file_name: input.fileName,
      markdown: input.markdown,
      json_data: input.jsonData || null,
      questions_json: input.questions ? JSON.stringify(input.questions) : null,
      mode: input.mode,
      status_json: input.status ? JSON.stringify(input.status) : null,
      page_ranges: input.pageRanges || null,
      extra_formats: input.extraFormats?.length ? JSON.stringify(input.extraFormats) : null,
      pdf_total_pages: input.pdfTotalPages || null,
      subject: input.subject || null,
      category: input.category || null,
      key_points: input.keyPoints || null,
    })
    .select(PARSE_HISTORY_ID_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'resources.createParseHistory' },
  )
  if (!row) throw new AppError({ kind: 'not_found', message: 'resources.createParseHistory: 创建后没有返回行' })
  return row.id
}

/** 元数据列(文件名、显示名、学科、分类、知识点、页码范围) */
export async function updateParseHistory(id: number, patch: ParseHistoryPatch, options: QueryOptions = {}): Promise<void> {
  const base = db.from('parse_history').update(patch).eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.updateParseHistory' },
  )
}

/** 解析出的题目整份覆盖 —— 这一列是 JSON 文本, 序列化留在本层 */
export async function saveParseHistoryQuestions(
  id: number,
  questions: ParsedQuestion[],
  options: QueryOptions = {},
): Promise<void> {
  await updateParseHistory(id, { questions_json: questions.length > 0 ? JSON.stringify(questions) : null }, options)
}

/** 解析进度快照, 切走再回来时要还原到当时那一步 */
export async function saveParseHistoryStatus(
  id: number,
  status: Record<string, unknown> | null,
  options: QueryOptions = {},
): Promise<void> {
  await updateParseHistory(id, { status_json: status ? JSON.stringify(status) : null }, options)
}

/** 页图逐个渲染, 每渲好一页就存一次 —— 浏览器关掉不该丢掉已经渲完的页 */
export async function saveParseHistoryPageUrls(id: number, urls: PageUrl[], options: QueryOptions = {}): Promise<void> {
  await updateParseHistory(id, { pdf_page_urls: urls.length > 0 ? JSON.stringify(urls) : null }, options)
}

/** 连同页图缓存一起删; R2 上的 pdf-cache/<id>/ 由调用方清 */
export async function deleteParseHistory(ids: number[], options: QueryOptions = {}): Promise<void> {
  if (ids.length === 0) return
  const base = db.from('parse_history').delete().in('id', ids)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'resources.deleteParseHistory' },
  )
}
