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

function flattenContentList(items: RawBlock[], out: ResourceBlock[]): void {
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
          pageNo: pageIdx + 1,
          bbox: bbox.slice(0, 4).map(Number),
          blockType: type,
          headingLevel: heading ? clampLevel(explicit || 1) : 0,
          text,
        })
      }
    }

    if (Array.isArray(item.children)) flattenContentList(item.children, out)
    if (Array.isArray(item.blocks)) flattenContentList(item.blocks, out)
  }
}

// ── 无坐标兜底: 轻量模式没有 layout.json, 只按阅读顺序把段落摊到已渲染页上 ──

export function blocksFromMarkdown(markdown: string, pageCount: number): ResourceBlock[] {
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

  const total = Math.max(chunks.length, 1)
  const pages = Math.max(pageCount, 1)
  const out: ResourceBlock[] = []

  for (const chunk of chunks) {
    const heading = headingOf(chunk)
    out.push({
      blockIndex: out.length,
      pageNo: Math.min(pages, Math.floor((out.length / total) * pages) + 1),
      bbox: null,
      blockType: heading ? 'title' : 'text',
      headingLevel: heading ? heading.level : 0,
      text: heading ? heading.title : chunk,
    })
  }
  return out
}

export function blocksFromLayout(rawJson: unknown): ResourceBlock[] {
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
    flattenContentList(data as RawBlock[], out)
    return out
  }

  const root = data as { pdf_info?: RawPage[] } | null
  if (root?.pdf_info && Array.isArray(root.pdf_info)) {
    root.pdf_info.forEach((page, i) => {
      const blocks = page.preproc_blocks ?? page.para_blocks ?? page.blocks ?? []
      flattenTree(blocks, i + 1, 0, out)
    })
  }
  return out
}

/** 优先用坐标数据, 拿不到就退化成按页摊分的段落 */
export function blocksFromParse(
  jsonData: string | null | undefined,
  markdown: string,
  pageCount: number,
): ResourceBlock[] {
  if (jsonData) {
    const blocks = blocksFromLayout(jsonData)
    if (blocks.length > 0) return blocks
  }
  return blocksFromMarkdown(markdown, pageCount)
}

export function buildToc(blocks: ResourceBlock[]): TocEntry[] {
  const toc: TocEntry[] = []
  for (const b of blocks) {
    if (b.headingLevel <= 0) continue
    toc.push({ blockIndex: b.blockIndex, level: b.headingLevel, title: b.text, pageNo: b.pageNo })
  }
  return toc
}
