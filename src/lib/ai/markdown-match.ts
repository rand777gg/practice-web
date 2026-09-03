// Upgraded Markdown↔PDF matching kernel, ported from the
// rand777gg/mineru-layout-viewer project (MIT) so practice-web shares the same
// improved alignment behaviour.
//
// Contrast with the structural path in PdfMarkdownViewer.parseLayoutTree:
//   - parseLayoutTree  : rebuilds Markdown *from* layout.json blocks (1:1 by index,
//                        used when coordinates exist and for AI extraction).
//   - this module       : reading-order, text-similarity matcher for when you have an
//                        *independent* Markdown string (e.g. MinerU full.md) and a set
//                        of PdfBlocks, plus a fallback segmenter for coordinate-less
//                        Markdown.

// ── Text normalization ──

export function normalize(s: string): string {
  return s
    .replace(/^\s*[-*+•]\s+/gm, ' ')
    .replace(/^\s*\d{1,4}[.)、]\s+/gm, ' ')
    .replace(/[#*_`~|>\\[\](){}!]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim()
    .toLowerCase()
}

// ── Similarity core ──

function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const build = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      map.set(g, (map.get(g) || 0) + 1)
    }
    return map
  }
  const sa = build(a)
  const sb = build(b)
  let inter = 0
  let total = 0
  for (const [g, ca] of sa) {
    const cb = sb.get(g)
    inter += cb ? Math.min(ca, cb) : 0
  }
  for (const ca of sa.values()) total += ca
  for (const cb of sb.values()) total += cb
  return total === 0 ? 0 : (2 * inter) / total
}

function substringRatio(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  if (shorter.length === 0) return 0
  let maxLen = 0
  const window = Math.min(shorter.length, 40)
  for (let i = 0; i < shorter.length; i++) {
    if (shorter.length - i <= maxLen) break
    for (let len = window; len > maxLen; len--) {
      const sub = shorter.substring(i, i + len)
      if (sub.length < 4) continue
      if (longer.includes(sub)) {
        maxLen = sub.length
        break
      }
    }
  }
  return maxLen / Math.max(shorter.length, 1)
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length)
  const dice = bigramDice(a, b)
  const sub = substringRatio(a, b)
  const fused = dice * 0.7 + sub * lenRatio * 0.3
  return Math.max(fused, sub * 0.55)
}

// ── Reading-order Markdown ↔ PdfBlock matcher ──
//
// Walk Markdown paragraphs top→bottom while advancing a rolling block window that
// can only move forward across pages/blocks (monotonic). Keeps repeated lines
// (答案：A, table headers, captions) pinned to the page they actually belong to.

export interface LocalPdfBlock {
  page_idx: number
  bbox: [number, number, number, number]
  text?: string
  type?: string
}

export interface LocalMdMatch {
  text: string
  page: number // 1-based
  bbox: [number, number, number, number] | null
}

const PARAGRAPH_RE = /\n\s*\n+/
const MIN_SIM = 0.28
const MAX_FORWARD_PAGES = 4
const WEAK_TYPES = new Set(['image', 'figure', 'table', 'table-body', 'table-row'])

export function matchMarkdownToBlocks(markdown: string, blocks: LocalPdfBlock[]): LocalMdMatch[] {
  const paragraphs = markdown
    .split(PARAGRAPH_RE)
    .map((p) => p.replace(/\n+/g, ' ').trim())
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0) return []
  if (blocks.length === 0) {
    return paragraphs.map((p) => ({ text: p, page: 1, bbox: null }))
  }

  const byPage = new Map<number, LocalPdfBlock[]>()
  for (const b of blocks) {
    let arr = byPage.get(b.page_idx)
    if (!arr) {
      arr = []
      byPage.set(b.page_idx, arr)
    }
    arr.push(b)
  }
  const pageList = Array.from(byPage.keys()).sort((x, y) => x - y)
  const firstPage = pageList[0]

  const nb = new Map<LocalPdfBlock, string>()
  const norm = (b: LocalPdfBlock): string => {
    let n = nb.get(b)
    if (n === undefined) {
      n = normalize(b.text || '')
      nb.set(b, n)
    }
    return n
  }
  const isWeak = (b: LocalPdfBlock): boolean => !!b.type && WEAK_TYPES.has(b.type)

  const sections: LocalMdMatch[] = []
  let curPage = 0
  const curBlock = new Map<number, number>()

  const candidates = (): LocalPdfBlock[] => {
    const out: LocalPdfBlock[] = []
    for (let pi = curPage; pi < Math.min(pageList.length, curPage + MAX_FORWARD_PAGES); pi++) {
      const arr = byPage.get(pageList[pi]) || []
      const from = curBlock.get(pageList[pi]) || 0
      for (let i = from; i < arr.length; i++) out.push(arr[i])
    }
    return out
  }

  const commit = (matched: LocalPdfBlock) => {
    for (let pi = curPage; pi < pageList.length; pi++) {
      const page = pageList[pi]
      const arr = byPage.get(page) || []
      const idx = arr.indexOf(matched)
      if (idx >= 0) {
        curBlock.set(page, idx + 1)
        curPage = pi
        return
      }
      curBlock.set(page, arr.length)
    }
  }

  // Pure scan: returns the best block (and its score) among `list[start..]` for query `query`.
  const scan = (list: LocalPdfBlock[], query: string, weakOk: boolean, start = 0): { block: LocalPdfBlock | null; score: number } => {
    let block: LocalPdfBlock | null = null
    let score = 0
    for (let i = start; i < list.length; i++) {
      const b = list[i]
      const t = norm(b)
      if (t.length < 3) continue
      if (!weakOk && isWeak(b)) continue
      const s = similarity(query, t)
      if (s > score) {
        score = s
        block = b
      }
    }
    return { block, score }
  }

  for (const para of paragraphs) {
    const q = normalize(para)
    if (q.length < 3) {
      sections.push({ text: para, page: firstPage + 1, bbox: null })
      continue
    }

    // Pass 1: text-bearing blocks; pass 2 allows weak container blocks (tables/images).
    let cand = scan(candidates(), q, false)
    if (cand.score < MIN_SIM) {
      const c2 = scan(candidates(), q, true)
      if (c2.score > cand.score) cand = c2
    }
    // Pass 3: nothing within the current window — look one page group ahead.
    if (cand.score < MIN_SIM && curPage < pageList.length - 1) {
      const next = pageList[Math.min(curPage + 1, pageList.length - 1)]
      const arr = byPage.get(next) || []
      const c3 = scan(arr, q, true, curBlock.get(next) || 0)
      if (c3.score > cand.score) cand = c3
    }

    const best = cand.block
    if (best === null || cand.score < MIN_SIM) {
      sections.push({ text: para, page: firstPage + 1, bbox: null })
      continue
    }
    commit(best)
    sections.push({ text: para, page: best.page_idx + 1, bbox: best.bbox })
  }

  return sections
}

// ── Coordinate-less fallback: reading-order segmentation with page estimation ──
//
// Used when no layout.json exists (lightweight MinerU parse). There are no block
// coordinates, but if we know how many pages were rendered we can still distribute
// paragraphs in reading order across those pages instead of stamping everything
// "page 1".

export function segmentMarkdownForPages(markdown: string, pageCount: number): LocalMdMatch[] {
  const paragraphs = markdown
    .split(PARAGRAPH_RE)
    .map((p) => p.replace(/\n+/g, ' ').trim())
    .filter((p) => p.length > 0)

  const total = Math.max(paragraphs.length, 1)
  const pages = Math.max(pageCount, 1)
  return paragraphs.map((p, i) => {
    const page = Math.min(pages, Math.floor((i / total) * pages) + 1)
    return { text: p, page, bbox: null }
  })
}
