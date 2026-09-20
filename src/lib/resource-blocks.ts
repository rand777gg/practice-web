/**
 * MinerU 解析产物 → 资料库区块。
 *
 * 区块是 PDF ↔ Markdown 双向定位的唯一锚点: 一个区块在 Markdown 里是一段文字,
 * 在 PDF 上是 bbox 那个框, 在目录里(如果它是标题)是一条目录项。
 * 三者共用 blockIndex, 所以"点目录跳 PDF"和"点 PDF 回目录"走的是同一张映射表。
 */

export interface ResourceBlock {
  blockIndex: number
  pageNo: number
  bbox: number[] | null
  blockType: string
  headingLevel: number
  text: string
}

export interface TocEntry {
  blockIndex: number
  level: number
  title: string
  pageNo: number
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
  content?: string
  text_level?: number
  page_idx?: number
  page_index?: number
  category?: string
  img_caption?: { content?: string }[]
  image_caption?: { content?: string }[]
  table_caption?: { content?: string }[]
}

interface RawPage {
  preproc_blocks?: RawBlock[]
  para_blocks?: RawBlock[]
  blocks?: RawBlock[]
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

const CONTAINER_TYPES = new Set(['table', 'figure'])

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

function flattenTree(items: RawBlock[], pageNo: number, depth: number, out: ResourceBlock[]): void {
  for (const item of items) {
    const bbox = item.bbox
    if (!Array.isArray(bbox) || bbox.length < 4) continue

    const type = item.type || 'text'
    const children = item.blocks ?? []
    const isHeading = type === 'title' || type === 'heading'

    if (children.length > 0 && !CONTAINER_TYPES.has(type)) {
      // 每下一层都算深一层: 标题层级来自嵌套深度, 这跟 AI 解析页那个已验证的解析器保持一致
      flattenTree(children, pageNo, depth + 1, out)
      continue
    }

    const text = deepText(item).trim()
    if (!text) continue

    out.push({
      blockIndex: out.length,
      pageNo,
      bbox: bbox.slice(0, 4).map(Number),
      blockType: type,
      headingLevel: isHeading ? clampLevel(depth + 1) : 0,
      text,
    })
  }
}

function flattenContentList(items: RawBlock[], out: ResourceBlock[], pages?: number[]): void {
  for (const item of items) {
    const pageIdx = item.page_idx ?? item.page_index
    const type = item.category || item.type || 'text'
    const bbox = item.bbox

    if (pageIdx !== undefined && Array.isArray(bbox) && bbox.length >= 4) {
      const text = deepText(item).trim()
      if (text) {
        const explicit = Number(item.text_level) || 0
        const heading = explicit > 0 || type === 'title'
        out.push({
          blockIndex: out.length,
          pageNo: pageAt(pages, pageIdx),
          bbox: bbox.slice(0, 4).map(Number),
          blockType: type,
          headingLevel: heading ? clampLevel(explicit || 1) : 0,
          text,
        })
      }
    }

    if (Array.isArray(item.children)) flattenContentList(item.children, out, pages)
    if (Array.isArray(item.blocks)) flattenContentList(item.blocks, out, pages)
  }
}

// ── 无坐标兜底: 轻量模式没有 layout.json, 只按阅读顺序把段落摊到已渲染页上 ──

export function blocksFromMarkdown(
  markdown: string,
  pageNumbers: number[],
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

export function blocksFromLayout(rawJson: unknown, pages?: number[]): ResourceBlock[] {
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
    flattenContentList(data as RawBlock[], out, pages)
    refineHeadingLevels(out)
    return out
  }

  const root = data as { pdf_info?: RawPage[] } | null
  if (root?.pdf_info && Array.isArray(root.pdf_info)) {
    root.pdf_info.forEach((page, i) => {
      // 注意不能用 ?? 挑: 空的 preproc_blocks 不是 nullish, 会让整页变成 0 个块
      const blocks = [page.preproc_blocks, page.para_blocks, page.blocks]
        .find((list) => Array.isArray(list) && list.length > 0) ?? []
      flattenTree(blocks, pageAt(pages, i), 0, out)
    })
  }
  refineHeadingLevels(out)
  return out
}

/**
 * 优先用坐标数据, 拿不到就退化成按页摊分的段落。
 * pageNumbers 是本次解析覆盖的原文页码(按顺序), 分卷时由页码区间算出来。
 */
export function blocksFromParse(
  jsonData: string | null | undefined,
  markdown: string,
  pageNumbers: number[],
): ResourceBlock[] {
  if (jsonData) {
    const blocks = blocksFromLayout(jsonData, pageNumbers)
    if (blocks.length > 0) return blocks
  }
  return blocksFromMarkdown(markdown, pageNumbers)
}

export function buildToc(blocks: ResourceBlock[]): TocEntry[] {
  const toc: TocEntry[] = []
  for (const b of blocks) {
    if (b.headingLevel <= 0) continue
    toc.push({ blockIndex: b.blockIndex, level: b.headingLevel, title: b.text, pageNo: b.pageNo })
  }
  return toc
}

export interface TocSection {
  /** 目录条目的 blockIndex —— 唯一, 所以下拉框用它当值 */
  key: number
  level: number
  title: string
  pageFrom: number
  pageTo: number
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
    return { key: entry.blockIndex, level: entry.level, title: entry.title, pageFrom: from, pageTo: to }
  })
}
