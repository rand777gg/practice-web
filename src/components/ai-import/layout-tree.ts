import { mineruBlockText } from '@/lib/resource-blocks'

export interface BlockNode {
  page_idx: number
  bbox: [number, number, number, number]
  text: string
  type: string
}

export interface MdSection {
  text: string
  page: number
  bbox: [number, number, number, number] | null
  blockIndex: number
}

// ---- Extract text from a layout block ----

function extractText(block: Record<string, unknown>): string {
  const lines = block.lines as Array<Record<string, unknown>> | undefined
  if (lines) {
    const texts: string[] = []
    for (const line of lines) {
      const spans = line.spans as Array<Record<string, unknown>> | undefined
      if (spans) for (const span of spans) {
        if (span.content) texts.push(String(span.content))
      }
    }
    if (texts.length > 0) return texts.join('')
  }
  return (block.text as string) || ''
}

// ---- Build page offset map from pageRanges ----

function buildPageMap(ranges: string | undefined): (i: number) => number {
  if (!ranges?.trim()) return (i) => i + 1
  const map: number[] = []
  for (const part of ranges.split(',')) {
    const t = part.trim()
    if (t.includes('-')) {
      const [start, end] = t.split('-').map(Number)
      for (let p = Math.max(1, start); p <= (end || start); p++) map.push(p)
    } else {
      const n = Number(t)
      if (n >= 1) map.push(n)
    }
  }
  return (i) => i < map.length ? map[i] : i + 1
}

// ---- Parse layout.json tree into sections with direct block references ----

export function parseLayoutTree(rawJson: unknown, pageRanges?: string): { sections: MdSection[]; blocks: BlockNode[] } {
  const sections: MdSection[] = []
  const flatBlocks: BlockNode[] = []

  try {
    const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson as Record<string, unknown>

    if (data.pdf_info && Array.isArray(data.pdf_info)) {
      const pdfInfo = data.pdf_info as Record<string, unknown>[]
      const pageMap = buildPageMap(pageRanges)
      for (let layoutIdx = 0; layoutIdx < pdfInfo.length; layoutIdx++) {
        const fullPage = pageMap(layoutIdx)
        const page = pdfInfo[layoutIdx]
        const pageBlocks = (page.preproc_blocks || page.para_blocks || []) as Record<string, unknown>[]
        walkTree(pageBlocks, fullPage - 1)
      }
    } else if (Array.isArray(data)) {
      walkContentList(data as Record<string, unknown>[])
    }

    function walkTree(items: Record<string, unknown>[], pageIdx: number, _depth = 0) {
      for (const item of items) {
        if (!item.bbox) continue
        const type = (item.type as string) || 'text'
        const text = extractText(item)
        const bbox = item.bbox as [number, number, number, number]
        const children = item.blocks as Record<string, unknown>[] | undefined
        const level = type === 'title' ? _depth + 1 : 0

        if (children && children.length > 0 && type !== 'table' && type !== 'figure') {
          walkTree(children, pageIdx, _depth + 1)
        } else {
          const blockIndex = flatBlocks.length
          flatBlocks.push({
            page_idx: pageIdx,
            bbox: bbox.map(Math.round) as [number, number, number, number],
            text,
            type,
          })
          const md = renderBlockToMd(flatBlocks[blockIndex], level)
          if (md.trim()) {
            sections.push({
              text: md,
              page: pageIdx + 1,
              bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
              blockIndex,
            })
          }
        }
      }
    }

    function walkContentList(items: Record<string, unknown>[]) {
      for (const item of items) {
        const pageIdx = (item.page_idx ?? item.page_index) as number | undefined
        const type = (item.category || item.type || 'text') as string
        // content_list_v2 把正文放在 content 里, 直接读 item.text 会全是空段落
        const text = mineruBlockText(item)
        const bbox = item.bbox as [number, number, number, number] | undefined
        if (pageIdx !== undefined && bbox) {
          const blockIndex = flatBlocks.length
          flatBlocks.push({
            page_idx: pageIdx,
            bbox: bbox.map(Math.round) as [number, number, number, number],
            text,
            type,
          })
          const md = renderBlockToMd(flatBlocks[blockIndex], type === 'title' ? 1 : 0)
          if (md.trim()) {
            sections.push({ text: md, page: pageIdx + 1, bbox, blockIndex })
          }
        }
        if (Array.isArray(item.children)) walkContentList(item.children as Record<string, unknown>[])
        if (Array.isArray(item.blocks)) walkContentList(item.blocks as Record<string, unknown>[])
      }
    }
  } catch (e) {
    console.warn('layout-tree: JSON tree parse failed', e)
  }

  return { sections, blocks: flatBlocks }
}

function renderBlockToMd(node: BlockNode, level: number): string {
  const text = node.text.trim()
  if (!text) return ''
  switch (node.type) {
    case 'title':
    case 'heading':
      return `${'#'.repeat(Math.min(level || 1, 6))} ${text}`
    case 'list_item':
    case 'list-item':
      return `- ${text}`
    case 'formula':
    case 'equation':
    case 'interline_equation':
    case 'equation_interline':
      return `$${text}$`
    case 'image':
    case 'figure':
      return `[图] ${text}`
    case 'code':
      return `\`\`\`\n${text}\n\`\`\``
    default:
      return text
  }
}
