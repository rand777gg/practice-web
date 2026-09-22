/**
 * MinerU 解析产物 → 资料库区块。
 *
 * 区块是 PDF ↔ Markdown 双向定位的唯一锚点: 一个区块在 Markdown 里是一段文字,
 * 在 PDF 上是 bbox 那个框, 在目录里(如果它是标题)是一条目录项。
 * 三者共用 blockIndex, 所以"点目录跳 PDF"和"点 PDF 回目录"走的是同一张映射表。
 */

// 带扩展名: 这个模块要被 scripts/resource-blocks-smoke.mjs 直接跑(和 assistant-commands 同理)
import { CATEGORY_ID_META, isCodeType } from './mineru-types.ts'

export interface ResourceBlock {
  blockIndex: number
  pageNo: number
  bbox: number[] | null
  blockType: string
  headingLevel: number
  text: string
  /** R2 上的图片地址(解析时上传完才知道); 只有图片块有 */
  imageUrl?: string | null
  /** MinerU 给的 <table>...</table> 原文; 只有表格块有。text 是它的纯文本降级 */
  tableHtml?: string | null
  /** 代码语言(middle 的 guess_lang / content_list_v2 的 code_language); 只有代码块有 */
  codeLanguage?: string | null
}

export interface TocEntry {
  /**
   * 目录条目的稳定标识, 只用来做 key/Set 成员。
   *
   * 不能继续拿 blockIndex 兼任: 人工目录允许两条指向同一段(比如「上篇」和「本篇小结」
   * 都挂在同一页的开头), 也允许没有落点的纯分组项, 那样 blockIndex 既不唯一也可能为空,
   * 当 key 会撞。自动目录里 key 就等于 blockIndex。
   */
  key: number
  level: number
  title: string
  pageNo: number
  /** 映射到的正文区块; null = 纯分组项, 正文里没有落点 (只能跳 PDF 页) */
  blockIndex: number | null
}

const MD_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/

function clampLevel(n: number): number {
  return Math.max(1, Math.min(6, n))
}

function headingOf(text: string): { level: number; title: string } | null {
  const m = MD_HEADING_RE.exec(text.trim())
  if (!m) return null
  return { level: m[1].length, title: m[2].trim() }
}

// ── 目录层级 ──
//
// MinerU 的 para_blocks 是平铺的(实测一页 20 个块, 标题与正文平级), 块上的 level 字段
// 也不区分层级(实测全部是 2), bbox 行高又因字形差异不稳(同一级标题 12~21 都有)。
// 真正编码层级的是标题文本里的编号 —— 「第一章」=1 级, 「1.1」=2 级, 「1.1.1」=3 级,
// 这是中文教材/论文的通行写法, 所以用它来还原层级; 没有编号的文档就退化成平铺目录。
const CN_NUM = '[一二三四五六七八九十百零〇\\d]+'
const RE_CHAPTER = new RegExp(`^第${CN_NUM}[章节篇部]`)
const RE_DOTTED = /^(\d+(?:\.\d+)*)(?=[.、\s]|$)/
const RE_PAREN = new RegExp(`^[（(]${CN_NUM}[）)]`)
const RE_CN_LIST = new RegExp(`^${CN_NUM}[、.]`)

function numberedLevel(text: string): number {
  const t = text.trim()
  if (RE_CHAPTER.test(t)) return 1
  const dotted = RE_DOTTED.exec(t)
  if (dotted) return Math.min(dotted[1].split('.').length, 6)
  if (RE_PAREN.test(t)) return 2
  if (RE_CN_LIST.test(t)) return 2
  return 0
}

/** 用标题编号还原层级; 全文都找不到编号线索时保持原样(平铺) */
function refineHeadingLevels(blocks: ResourceBlock[]): void {
  const titled = blocks.filter((b) => b.headingLevel > 0)
  if (titled.length < 2) return

  const numbered = titled.map((b) => numberedLevel(b.text))
  const known = numbered.filter((n) => n > 0)
  if (known.length < 2) return

  // 只出现 2.x 这种二级编号时, 归一化后从 1 级起, 免得目录整体缩进一格
  const base = Math.min(...known)
  titled.forEach((b, i) => {
    if (numbered[i] > 0) b.headingLevel = Math.max(1, numbered[i] - base + 1)
  })
}

// ── layout.json / content_list.json 读取 ──

interface RawBlock {
  type?: string
  bbox?: number[]
  lines?: { spans?: { content?: string }[] }[]
  blocks?: RawBlock[]
  children?: RawBlock[]
  text?: string
  content?: unknown
  text_level?: number
  page_idx?: number
  page_index?: number
  category?: string
  /** model.json 给的是数字类别号, 不是 type 字符串 */
  category_id?: number
  img_path?: string
  image_path?: string
  table_body?: string
  html?: string
  img_caption?: { content?: string }[]
  image_caption?: { content?: string }[]
  table_caption?: { content?: string }[]
  /** 代码语言: middle.json 的代码块叫 guess_lang, content_list_v2 藏在 content.code_language 里 */
  guess_lang?: string
  code_language?: string
  /** layout_dets: model.json 的原始框 */
  layout_dets?: RawBlock[]
  /** model.json 的框是 8 个坐标的多边形, 不是 bbox */
  poly?: number[]
}

interface RawPage {
  preproc_blocks?: RawBlock[]
  para_blocks?: RawBlock[]
  blocks?: RawBlock[]
  /** MinerU 判定"不该抽取"的块: 页眉/页脚/页码/边注/脚注/参考文献… 单独一列, 不混在阅读顺序里 */
  discarded_blocks?: RawBlock[]
  layout_dets?: RawBlock[]
}

function spansText(block: RawBlock): string {
  const out: string[] = []
  for (const line of block.lines ?? []) {
    for (const span of line.spans ?? []) {
      if (span.content) out.push(String(span.content))
    }
  }
  return out.join('')
}

function captionText(block: RawBlock): string {
  const out: string[] = []
  for (const key of ['img_caption', 'image_caption', 'table_caption'] as const) {
    const arr = block[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.content) out.push(String(item.content))
      }
    }
  }
  return out.join(' ')
}

/** 表格 / 图片容器自己没文本, 内容在子块和 caption 里, 一并收上来才能被检索到 */
function deepText(block: RawBlock): string {
  const own = (block.text as string) || spansText(block) || captionText(block)
  const kids: string[] = []
  for (const child of block.blocks ?? []) {
    const t = deepText(child)
    if (t) kids.push(t)
  }
  return [own, ...kids].filter(Boolean).join(' ')
}

const CONTAINER_TYPES = new Set(['table', 'figure', 'image', 'chart'])

/** 图片类容器。它们自己没文字, 加进来才能整块留住而不是只留下图注 */
const IMAGE_TYPES = new Set(['image', 'figure', 'chart'])

const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+?)>?\s*\)/g

/**
 * markdown 里按出现顺序排的图片路径。
 *
 * 为什么不能只从 JSON 里读文件名: 解析产物优先用 layout.json, 而 layout.json 的图片块
 * **不带文件名**(只有 bbox), 文件名只出现在 content_list.json 和 full.md 里。
 * full.md 与区块都是 MinerU 按同一阅读顺序产出的, 所以第 N 个图片块对应第 N 个引用;
 * JSON 里带 img_path 时用 JSON 的, 顺序队列只当兜底。
 */
export function imagesInMarkdown(markdown: string): string[] {
  const out: string[] = []
  for (const m of markdown.matchAll(MD_IMAGE_RE)) {
    const src = m[1]
    if (src && !out.includes(src)) out.push(src)
  }
  return out
}

/** 图片文件名: content_list.json 用 img_path, 个别版本用 image_path */
function imgPathOf(block: RawBlock): string | null {
  const p = block.img_path || block.image_path
  return typeof p === 'string' && p ? p : null
}

const HTML_OPEN_RE = /<(?:table|html|div|span)\b/i
/** 表格 HTML 会原样交给浏览器解析, 所以带脚本的一律不要(产物理论上不该有, 代价只有一行) */
const SCRIPT_RE = /<\s*(?:script|iframe|object|embed)\b/i

/**
 * 表格 HTML。两种产物形态不同: content_list.json 的 table_body 是字符串字段,
 * 而 layout.json 把 <table> 当成一个 table_body 子块的 span 内容塞着 —— 后者正是
 * 之前"表格被压成一行文字"的来源: deepText 把 HTML 当纯文本拼进了 text。
 */
function tableHtmlOf(block: RawBlock): string | null {
  const own = block.table_body || block.html
  if (own && HTML_OPEN_RE.test(own) && !SCRIPT_RE.test(own)) return own
  for (const child of block.blocks ?? []) {
    const t = child.table_body || spansText(child)
    if (t && HTML_OPEN_RE.test(t) && !SCRIPT_RE.test(t)) return t
  }
  return null
}

// ── content_list_v2.json: type + content 结构 ──

/**
 * content 里这些键不是正文: 图片地址、表格类型、语言、层级……
 * 混进 text 会直接变成可检索的噪声(搜 "txt" 命中一堆代码块的语言标记)。
 */
const V2_META_KEYS = new Set([
  'type', 'path', 'html', 'image_source', 'table_type', 'list_type', 'math_type',
  'level', 'table_nest_level', 'item_type', 'code_language', 'guess_lang', 'page_size', 'bbox',
])

/** v2 的正文按 <type>_content 命名, 值是 span 列表(元素形如 {type, content}); 递归收字符串即可 */
function v2CollectText(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    const t = value.trim()
    if (t) out.push(t)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) v2CollectText(v, out)
    return
  }
  if (typeof value !== 'object') return
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (V2_META_KEYS.has(k)) continue
    v2CollectText(v, out)
  }
}

function v2Content(item: RawBlock): Record<string, unknown> {
  return (item.content ?? {}) as Record<string, unknown>
}

function v2Text(item: RawBlock): string {
  const out: string[] = []
  v2CollectText(item.content, out)
  return out.join(' ').trim()
}

/** v2 的图片地址在 content.image_source.path(形如 images/xxx.jpg), 与 v1 的 img_path 同形 */
function v2ImagePath(item: RawBlock): string | null {
  const src = v2Content(item).image_source
  const p = src && typeof src === 'object' ? (src as { path?: unknown }).path : null
  return typeof p === 'string' && p ? p : null
}

/** v2 的表格 HTML 在 content.html */
function v2TableHtml(item: RawBlock): string | null {
  const html = v2Content(item).html
  if (typeof html !== 'string' || !html) return null
  return HTML_OPEN_RE.test(html) && !SCRIPT_RE.test(html) ? html : null
}

function v2CodeLanguage(item: RawBlock): string | null {
  const lang = v2Content(item).code_language
  return typeof lang === 'string' && lang ? lang : null
}

/**
 * 代码/算法的正文只在 <x>_content 里; 题注(code_caption/algorithm_caption)是另一回事。
 * 一起收进 text 的话, 题注会当成代码跟着上色 —— 而这一块是要交给 shiki 渲染的。
 * 只有题注没有正文时(残缺产物)仍然退回全收, 免得整块消失。
 */
function v2CodeBody(item: RawBlock): string {
  const c = v2Content(item)
  const out: string[] = []
  for (const key of ['code_content', 'algorithm_content']) {
    if (c[key] !== undefined) v2CollectText(c[key], out)
  }
  return out.join('\n').trim()
}

/** 表格类取值: v2 的 simple_table / complex_table 是"表格"的取值, 不是别的类型 */
const TABLE_TYPES = new Set(['table', 'simple_table', 'complex_table'])

/**
 * 任意形态的 MinerU 块取纯文本: 早期产物是平铺的 text / lines[].spans[] / caption,
 * content_list_v2 则把正文全塞在 content 里。资料库入库和 AI 解析页预览都要这一份判断, 所以导出。
 */
export function mineruBlockText(block: unknown): string {
  const b = (block ?? {}) as RawBlock
  if (b.content && typeof b.content === 'object') return v2Text(b)
  return deepText(b).trim()
}

/** 一次解析里图片名/地址的分配状态 —— 队列按出现顺序取, 不能重复用同一个名字 */
interface ImageScan {
  /** full.md 里的图片路径, 按顺序 */
  queue: string[]
  next: { i: number }
  /** 相对路径 → R2 地址; 解析阶段才拿得到 */
  urls?: Record<string, string>
}

function takeImage(block: RawBlock, scan: ImageScan, explicit?: string | null): { name: string | null; url: string | null } {
  const name = explicit ?? imgPathOf(block) ?? scan.queue[scan.next.i++] ?? null
  if (!name) return { name: null, url: null }
  const url = scan.urls?.[name] ?? null
  return { name, url }
}

/**
 * MinerU 传 page_ranges 时返回的页码是**相对本卷**的(实测解析 3-5 页 → pdf_info 只有 3 项,
 * page_idx = 0,1,2), 所以要把相对序号映射回原文页码。
 *
 * 用一张「相对序号 → 原文页码」的表而不是一个固定偏移量, 是因为页码范围可以是不连续的
 * (如 "1-30,50"): 固定偏移会让第 50 页报成第 31 页, 页图却渲染在第 50 页,
 * 检索结果点进去就定位到错误的页。不传表时按 1..n 处理(整篇解析)。
 */
export type PageNumbers = number[]

function pageAt(pages: number[] | undefined, relativeIndex: number): number {
  if (!pages || pages.length === 0) return relativeIndex + 1
  return pages[relativeIndex] ?? relativeIndex + 1
}

function flattenTree(
  items: RawBlock[],
  pageNo: number,
  depth: number,
  out: ResourceBlock[],
  scan: ImageScan,
  lang: string | null = null,
): void {
  for (const item of items) {
    const bbox = item.bbox
    if (!Array.isArray(bbox) || bbox.length < 4) continue

    const type = (item.type || 'text').trim().toLowerCase()
    const children = item.blocks ?? []
    const isHeading = type === 'title' || type === 'heading'
    const isImage = IMAGE_TYPES.has(type)
    // 代码语言挂在 code 容器上, 而成块的是它的子块 code_body —— 顺着嵌套带下去
    const nextLang = item.guess_lang || item.code_language || lang

    if (children.length > 0 && !CONTAINER_TYPES.has(type)) {
      // 每下一层都算深一层: 标题层级来自嵌套深度, 这跟 AI 解析页那个已验证的解析器保持一致
      flattenTree(children, pageNo, depth + 1, out, scan, nextLang)
      continue
    }

    const text = deepText(item).trim()
    const image = isImage ? takeImage(item, scan) : { name: null, url: null }
    const tableHtml = TABLE_TYPES.has(type) ? tableHtmlOf(item) : null
    // 没有图注的图片块本来会被丢掉(没有文字), 那正是"图片一张都看不到"的直接原因
    if (!text && !image.name && !tableHtml) continue

    out.push({
      blockIndex: out.length,
      pageNo,
      bbox: bbox.slice(0, 4).map(Number),
      blockType: type,
      headingLevel: isHeading ? clampLevel(depth + 1) : 0,
      text,
      imageUrl: image.url,
      tableHtml,
      codeLanguage: isCodeType(type) ? nextLang : null,
    })
  }
}

/**
 * discarded_blocks: MinerU 判定"不该进阅读顺序"的那些块(页眉/页脚/页码/边注/脚注/参考文献)。
 *
 * 收进来是为了阅读页能显示、也能一键藏起来(它们本来就带 bbox, 是真实存在的块);
 * 但 type 是 text/title 的那些不收 —— MinerU 已经判定它们不该被抽取(重叠、水印、乱码),
 * 硬收进来就是把噪声当正文。
 */
function flattenDiscarded(items: RawBlock[], pageNo: number, out: ResourceBlock[], scan: ImageScan): void {
  const keep = items.filter((b) => {
    const t = (b.type || '').trim().toLowerCase()
    return t !== '' && t !== 'text' && t !== 'title'
  })
  flattenTree(keep, pageNo, 0, out, scan)
}

/**
 * 把装饰块按纵坐标插回本页, 而不是一律甩到页尾: 页眉本就该在页首、脚注在页尾。
 * 只在原序列上做插入, 不会重排主块 —— 双栏页面按 y 排序会把左右栏交错, 那是排版灾难。
 */
function spliceByY(main: ResourceBlock[], extra: ResourceBlock[]): ResourceBlock[] {
  const out = main.slice()
  for (const b of extra) {
    const y = b.bbox?.[1] ?? 0
    let i = out.length
    for (let k = 0; k < out.length; k++) {
      if ((out[k].bbox?.[1] ?? 0) > y) { i = k; break }
    }
    out.splice(i, 0, b)
  }
  return out
}

function flattenContentList(items: RawBlock[], out: ResourceBlock[], scan: ImageScan, pages?: number[]): void {
  for (const item of items) {
    const pageIdx = item.page_idx ?? item.page_index
    const type = (item.category || item.type || 'text').trim().toLowerCase()
    const bbox = item.bbox
    // v1 是平铺的 text / img_path / table_body; v2 把正文全塞在 content 里(paragraph / title / …)
    const v2 = !!item.content && typeof item.content === 'object'

    if (pageIdx !== undefined && Array.isArray(bbox) && bbox.length >= 4) {
      const codeBody = v2 && isCodeType(type) ? v2CodeBody(item) : null
      const text = codeBody ? codeBody : mineruBlockText(item)
      const isImage = IMAGE_TYPES.has(type)
      const image = isImage ? takeImage(item, scan, v2 ? v2ImagePath(item) : null) : { name: null, url: null }
      const tableHtml = TABLE_TYPES.has(type) ? (v2 ? v2TableHtml(item) : tableHtmlOf(item)) : null
      if (text || image.name || tableHtml) {
        const explicit = v2 ? Number(v2Content(item).level) || 0 : Number(item.text_level) || 0
        const heading = explicit > 0 || type === 'title'
        out.push({
          blockIndex: out.length,
          pageNo: pageAt(pages, pageIdx),
          bbox: bbox.slice(0, 4).map(Number),
          blockType: type,
          headingLevel: heading ? clampLevel(explicit || 1) : 0,
          text,
          imageUrl: image.url,
          tableHtml,
          codeLanguage: isCodeType(type) ? (v2CodeLanguage(item) ?? item.code_language ?? null) : null,
        })
      }
    }

    if (Array.isArray(item.children)) flattenContentList(item.children, out, scan, pages)
    if (Array.isArray(item.blocks)) flattenContentList(item.blocks, out, scan, pages)
  }
}

// ── 无坐标兜底: 轻量模式没有 layout.json, 只按阅读顺序把段落摊到已渲染页上 ──

export function blocksFromMarkdown(
  markdown: string,
  pageNumbers: number[],
  imageUrls?: Record<string, string>,
): ResourceBlock[] {
  // 先按空行分段, 再把段首连续的标题行拆出来单独成块。
  // 不加这一步的话, "# 标题\n正文" 这种标题后面没空行的写法会把正文一起并进标题,
  // 目录里就会出现一条被撑长的假标题。
  const chunks: string[] = []
  for (const raw of markdown.split(/\n\s*\n+/)) {
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
    while (lines.length > 0 && headingOf(lines[0])) {
      chunks.push(lines.shift() as string)
    }
    if (lines.length > 0) chunks.push(lines.join(' '))
  }

  const pages = pageNumbers.length > 0 ? pageNumbers : [1]
  const total = Math.max(chunks.length, 1)
  const out: ResourceBlock[] = []

  for (const chunk of chunks) {
    const heading = headingOf(chunk)
    const pageIdx = Math.min(pages.length - 1, Math.floor((out.length / total) * pages.length))
    // 独立成段的图片: 存成图片块, 图片地址在阅读页才渲染得出来。
    // 混在正文里的行内图片不动它, 那种情况正文本身就该按段落处理。
    const solo = chunk.match(/^!\[[^\]]*\]\(\s*<?([^)\s>]+?)>?\s*\)$/)
    if (solo) {
      out.push({
        blockIndex: out.length,
        pageNo: pages[pageIdx],
        bbox: null,
        blockType: 'image',
        headingLevel: 0,
        text: '',
        imageUrl: imageUrls?.[solo[1]] ?? null,
      })
      continue
    }
    out.push({
      blockIndex: out.length,
      pageNo: pages[pageIdx],
      bbox: null,
      blockType: heading ? 'title' : 'text',
      headingLevel: heading ? heading.level : 0,
      text: heading ? heading.title : chunk,
    })
  }
  return out
}

/**
 * model.json 的框: 类型是数字 category_id, 框是 poly(8 个坐标)。转成与别处同形的 type + bbox,
 * 下游(标签、热区、定位)才能用同一条路。类别号对不上就退回 text。
 */
function normalizeDet(det: RawBlock): RawBlock {
  const meta = typeof det.category_id === 'number' ? CATEGORY_ID_META[det.category_id] : undefined
  let bbox = det.bbox
  const poly = det.poly
  if (!bbox && Array.isArray(poly) && poly.length >= 8) {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i + 1 < poly.length; i += 2) {
      xs.push(Number(poly[i]))
      ys.push(Number(poly[i + 1]))
    }
    if (xs.length > 0) bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  // 检测框上的正文另存: 公式在 latex 里(13/14), 表格在 html/latex 里(5), OCR 文本在 text 里(15)
  const extra = det as { latex?: string; html?: string; text?: string }
  const text = det.text || extra.latex || ''
  const html = typeof extra.html === 'string' && HTML_OPEN_RE.test(extra.html) ? extra.html : undefined
  return {
    ...det,
    type: det.type || meta?.name || 'text',
    bbox,
    text,
    table_body: det.table_body || html,
  }
}

export function blocksFromLayout(
  rawJson: unknown,
  pages?: number[],
  opts?: { markdown?: string; imageUrls?: Record<string, string> },
): ResourceBlock[] {
  const out: ResourceBlock[] = []
  let data: unknown = rawJson
  if (typeof rawJson === 'string') {
    try {
      data = JSON.parse(rawJson)
    } catch {
      return out
    }
  }

  if (Array.isArray(data)) {
    flattenContentList(data as RawBlock[], out, { queue: imagesInMarkdown(opts?.markdown ?? ''), next: { i: 0 }, urls: opts?.imageUrls }, pages)
    return renumber(out)
  }

  const root = data as { pdf_info?: RawPage[] } | null
  if (root?.pdf_info && Array.isArray(root.pdf_info)) {
    // 队列只建一次: 图片在 full.md 里的顺序就是区块顺序, 逐页重置会从头重复取名字
    const scan: ImageScan = {
      queue: imagesInMarkdown(opts?.markdown ?? ''),
      next: { i: 0 },
      urls: opts?.imageUrls,
    }
    root.pdf_info.forEach((page, i) => {
      const pageNo = pageAt(pages, i)
      // 注意不能用 ?? 挑: 空的 preproc_blocks 不是 nullish, 会让整页变成 0 个块
      const blocks = [page.preproc_blocks, page.para_blocks, page.blocks]
        .find((list) => Array.isArray(list) && list.length > 0) ?? []
      const start = out.length
      flattenTree(blocks, pageNo, 0, out, scan)

      // model.json: 只有 layout_dets(数字类别 + poly), 主块一个都没有时按它落框
      if (blocks.length === 0 && Array.isArray(page.layout_dets)) {
        flattenTree(page.layout_dets.map(normalizeDet), pageNo, 0, out, scan)
      }

      // 页眉页脚这些是**另给**的一列, 按纵坐标插回本页, 而不是一律甩到页尾
      if (Array.isArray(page.discarded_blocks) && page.discarded_blocks.length > 0) {
        const extra: ResourceBlock[] = []
        flattenDiscarded(page.discarded_blocks, pageNo, extra, scan)
        if (extra.length > 0) {
          const merged = spliceByY(out.slice(start), extra)
          out.length = start
          for (const b of merged) out.push(b)
        }
      }
    })
  }
  return renumber(out)
}

/** 块序号必须是这一篇里的下标: 插回/合并会让构建过程中的临时序号重复, 撞唯一索引 */
function renumber(blocks: ResourceBlock[]): ResourceBlock[] {
  blocks.forEach((b, i) => { b.blockIndex = i })
  refineHeadingLevels(blocks)
  return blocks
}

/**
 * 优先用坐标数据, 拿不到就退化成按页摊分的段落。
 * pageNumbers 是本次解析覆盖的原文页码(按顺序), 分卷时由页码区间算出来。
 * imageUrls 是「产物里的相对路径 → R2 地址」, 图片块靠它拿到能直接渲染的地址。
 */
export function blocksFromParse(
  jsonData: string | null | undefined,
  markdown: string,
  pageNumbers: number[],
  imageUrls?: Record<string, string>,
): ResourceBlock[] {
  if (jsonData) {
    const blocks = blocksFromLayout(jsonData, pageNumbers, { markdown, imageUrls })
    if (blocks.length > 0) return blocks
  }
  return blocksFromMarkdown(markdown, pageNumbers, imageUrls)
}

/**
 * 解析产物里有多少页 —— 只用来校验 MinerU 真的按 page_ranges 解析了本卷。
 *
 * 多卷共用同一个 PDF URL 时, 如果服务端按 URL 命中了缓存把整篇解析结果发回来, 而 pageNumbers
 * 是按本卷算出来的, 页码映射就会整体错位: 目录和 PDF 双向定位会指到别的页, 却完全不报错。
 * 所以宁可多解析一次 JSON 也要能发现这件事。拿不到页结构时返回 0, 表示"校验不了"而不是"零页"。
 */
export function layoutPageCount(jsonData: string | null | undefined): number {
  if (!jsonData) return 0
  let data: unknown
  try {
    data = JSON.parse(jsonData)
  } catch {
    return 0
  }

  if (Array.isArray(data)) {
    const pages = new Set<number>()
    for (const item of data as { page_idx?: number; page_index?: number }[]) {
      const idx = item?.page_idx ?? item?.page_index
      if (typeof idx === 'number') pages.add(idx)
    }
    return pages.size
  }

  const info = (data as { pdf_info?: unknown } | null)?.pdf_info
  return Array.isArray(info) ? info.length : 0
}

export function buildToc(blocks: ResourceBlock[]): TocEntry[] {
  const toc: TocEntry[] = []
  for (const b of blocks) {
    if (b.headingLevel <= 0) continue
    toc.push({
      key: b.blockIndex,
      blockIndex: b.blockIndex,
      level: b.headingLevel,
      title: b.text,
      pageNo: b.pageNo,
    })
  }
  return toc
}

export interface TocSection {
  /** 目录条目的稳定标识 —— 唯一, 所以下拉框用它当值 */
  key: number
  level: number
  title: string
  pageFrom: number
  pageTo: number
  /** 这一节对应的正文首块; 纯分组项为 null, 出题范围仍然按页码区间切 */
  blockIndex: number | null
}

/**
 * 目录条目 → 一节一段的页码区间。最后一节到全书末尾。
 *
 * 为什么范围用页码而不是标题字符串: 同一本书里「小结」「思考题」这类标题会在每一章重复,
 * 拿字符串去匹配块所属的标题路径, 选"小结"会一次命中全书所有章的小结; 而页码区间天然互不
 * 重叠, 与标题重名无关。三个连续标题挤在同一页时会切出零宽区间, 这里夹成单页而不是丢掉。
 */
export function sectionsFromToc(toc: TocEntry[], totalPages: number): TocSection[] {
  const lastPage = totalPages > 0 ? totalPages : (toc[toc.length - 1]?.pageNo ?? 0)
  return toc.map((entry, i) => {
    const next = toc[i + 1]
    const from = Math.max(1, entry.pageNo)
    const to = Math.max(from, next ? next.pageNo - 1 : lastPage)
    return { key: entry.key, level: entry.level, title: entry.title, pageFrom: from, pageTo: to, blockIndex: entry.blockIndex }
  })
}
