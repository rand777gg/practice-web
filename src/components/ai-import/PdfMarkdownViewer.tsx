import { useState, useEffect, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { segmentMarkdownForPages } from '@/lib/ai/markdown-match'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ---- Types ----

interface BlockNode {
  page_idx: number
  bbox: [number, number, number, number]
  text: string
  type: string
}

interface MdSection {
  text: string
  page: number
  bbox: [number, number, number, number] | null
  blockIndex: number
}

interface PageUrl {
  p: number
  w: number
  h: number
  src: string
}

interface Props {
  pdfUrl: string | null
  jsonData?: string | Record<string, unknown>
  markdown: string
  pageRanges?: string
  pageUrls?: PageUrl[]
  rendering?: boolean
  selectionMode?: 'off' | 'single' | 'range'
  selectedSections?: Set<number>
  onToggleSection?: (index: number) => void
  onRangeSelect?: (from: number, to: number) => void
  rangeAnchor?: number | null
  children?: React.ReactNode
}

function parsePageRanges(ranges: string | undefined, totalPages: number): Set<number> {
  if (!ranges || !ranges.trim()) {
    return new Set(Array.from({ length: totalPages }, (_, i) => i + 1))
  }
  const pages = new Set<number>()
  for (const part of ranges.split(',')) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number)
      for (let i = Math.max(1, start); i <= Math.min(totalPages, end || start); i++) {
        pages.add(i)
      }
    } else {
      const n = Number(trimmed)
      if (n >= 1 && n <= totalPages) pages.add(n)
    }
  }
  return pages.size > 0 ? pages : new Set(Array.from({ length: totalPages }, (_, i) => i + 1))
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
        const text = (item.text as string) || ''
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
    console.warn('PdfMarkdownViewer: JSON tree parse failed', e)
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

// ---- Component ----

export function PdfMarkdownViewer({ pdfUrl, jsonData, markdown, pageRanges, pageUrls, rendering, selectionMode, selectedSections, onToggleSection, onRangeSelect, rangeAnchor, children }: Props) {
  const mdRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const pageImgRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [renderedPages, setRenderedPages] = useState<{ p: number; w: number; h: number; src: string }[]>(pageUrls || [])
  const [containerW, setContainerW] = useState(700)
  const [activeMdIdx, setActiveMdIdx] = useState<number | null>(null)
  const [activeBbox, setActiveBbox] = useState<[number, number, number, number] | null>(null)
  const [flashIdx, setFlashIdx] = useState<number | null>(null)

  const hasPreRendered = !!(pageUrls && pageUrls.length > 0)

  // Sync progressive pageUrls stream into renderedPages (page-by-page upload)
  useEffect(() => {
    if (pageUrls && pageUrls.length > 0) {
      setRenderedPages(pageUrls)
    }
  }, [pageUrls])

  // Skip pdfjs when: pre-rendered pages exist, or pages are currently being rendered
  const skipPdfjs = hasPreRendered || rendering

  const { sections, blocks } = jsonData
    ? parseLayoutTree(jsonData, pageRanges)
    : { sections: [] as MdSection[], blocks: [] as BlockNode[] }

  // Fallback (no layout.json — lightweight MinerU parse): no block coordinates exist,
  // but we still distribute paragraphs in reading order across the rendered page
  // count instead of stamping everything "page 1".
  const fallbackSections: MdSection[] = !jsonData
    ? segmentMarkdownForPages(markdown, renderedPages.length).map(s => ({
        ...s,
        blockIndex: -1,
      }))
    : []

  const displaySections = sections.length > 0 ? sections : fallbackSections
  const matched = sections.filter(s => s.bbox).length

  // Render scale must match the actual image render scale for bbox overlay positioning.
  // Pre-rendered R2 images are always rendered at 2.0; pdfjs path uses adaptive scale.
  const renderScale = hasPreRendered ? 2.0 : Math.min(2.0, Math.max(1.0, window.innerWidth / 700))

  // Lazy-loading: render pages on demand with IntersectionObserver
  const [loadedCount, setLoadedCount] = useState(5)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const validPages = renderedPages.filter(rp => rp.src)
  const visiblePages = validPages.slice(0, loadedCount)
  const hasMore = loadedCount < validPages.length

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadedCount(prev => Math.min(prev + 3, validPages.length))
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, validPages.length])

  useEffect(() => {
    let cancelled = false
    setLoadedCount(5)
    if (skipPdfjs) return
    setRenderedPages([])
    if (!pdfUrl) return

    const renderInBatches = async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const scale = renderScale
      const includedPages = parsePageRanges(pageRanges, pdf.numPages)
      const sortedPages = Array.from(includedPages).sort((a, b) => a - b)
      const pages: { p: number; w: number; h: number; src: string }[] = []

      for (let i = 0; i < sortedPages.length; i++) {
        if (cancelled) return
        const p = sortedPages[i]
        const page = await pdf.getPage(p)
        const vp = page.getViewport({ scale })
        const cvs = document.createElement('canvas')
        cvs.width = vp.width
        cvs.height = vp.height
        const ctx = cvs.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        pages.push({ p, w: vp.width, h: vp.height, src: cvs.toDataURL() })
        page.cleanup()

        // Yield to UI every 3 pages to avoid blocking
        if (i % 3 === 2) {
          setRenderedPages([...pages])
          await new Promise(r => setTimeout(r, 0))
        }
      }
      pdf.destroy()
      if (!cancelled) setRenderedPages(pages)
    }

    renderInBatches()
    return () => { cancelled = true }
  }, [pdfUrl, renderScale, skipPdfjs])

  useEffect(() => {
    const el = pdfContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleMdClick = useCallback((sec: MdSection, idx: number) => {
    setActiveMdIdx(idx)
    if (sec.bbox) {
      setActiveBbox(sec.bbox)
      const pageEl = pageImgRefs.current.get(sec.page)
      if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handlePdfBlockClick = useCallback((blockIndex: number, bbox: [number, number, number, number]) => {
    setActiveBbox(bbox)
    const secIdx = sections.findIndex(s => s.blockIndex === blockIndex)
    if (secIdx >= 0) {
      setActiveMdIdx(secIdx)
      setFlashIdx(secIdx)
      const el = mdRef.current?.querySelector(`[data-md-idx="${secIdx}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [sections])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 py-2 px-1 shrink-0 text-[10px] text-muted-foreground flex-wrap">
        <span>共 {validPages.length} 页</span>
        <span className="text-muted-foreground/60">|</span>
        <span>段落 {displaySections.length}</span>
        <span className={matched > 0 ? 'text-green-600' : 'text-amber-600'}>
          定位 {matched}
        </span>
        {blocks.length > 0 && (
          <span className="text-muted-foreground/60">| {blocks.length} 块</span>
        )}
        <span className="flex-1" />
        {children}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
        <div ref={pdfContainerRef} className="overflow-auto lg:border-r p-2 space-y-3">
          {validPages.length === 0 ? (
            <div className="space-y-3 p-2">
              <Skeleton className="h-[50vh] w-full rounded" />
              {rendering && (
                <p className="text-xs text-muted-foreground text-center">正在渲染 PDF 页面并上传到 R2...</p>
              )}
            </div>
          ) : (
            visiblePages.map(rp => {
              const cssW = containerW
              const cssH = rp.h * (containerW / rp.w)
              const pageBlocks = blocks.filter(b => b.page_idx === rp.p - 1)
              const pageScale = containerW / rp.w
              return (
                <div
                  key={rp.p}
                  ref={el => { if (el) pageImgRefs.current.set(rp.p, el) }}
                  className="relative mx-auto"
                  style={{ width: cssW, height: cssH }}
                >
                  <img src={rp.src} alt={`Page ${rp.p}`} className="w-full h-full rounded border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  {pageBlocks.map((b, bi) => {
                    const [x0, y0, x1, y1] = b.bbox
                    const isActive = activeBbox &&
                      Math.abs(activeBbox[0] - x0) < 2 && Math.abs(activeBbox[1] - y0) < 2
                    const s = renderScale * pageScale
                    const left = x0 * s
                    const top = y0 * s
                    const w = Math.max((x1 - x0) * s, 2)
                    const h = Math.max((y1 - y0) * s, 2)
                    const fullBlockIndex = blocks.indexOf(b)
                    return (
                      <div key={bi}
                        className={`absolute border transition-colors cursor-pointer ${
                          isActive ? 'border-blue-500 bg-blue-500/25 z-10 ring-1 ring-blue-400'
                          : 'border-transparent hover:border-amber-400/60 hover:bg-amber-400/15'
                        }`}
                        style={{ left, top, width: w, height: h }}
                        title={b.text.slice(0, 120)}
                        onClick={() => handlePdfBlockClick(fullBlockIndex, b.bbox)}
                      />
                    )
                  })}
                  <span className="absolute bottom-1 right-2 text-[9px] text-muted-foreground/40 bg-background/70 px-1 rounded">
                    {rp.p}
                  </span>
                </div>
              )
            })
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
          {rendering && validPages.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">正在渲染剩余页面...</p>
          )}
        </div>

        <ScrollArea className="p-3">
          <div ref={mdRef} className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
              {displaySections.map((sec, i) => {
                const isSelected = selectedSections ? selectedSections.has(i) : false
                const isAnchor = selectionMode === 'range' && rangeAnchor === i
                const selActive = selectionMode && selectionMode !== 'off'
                return (
                <span
                  key={i}
                  data-md-idx={i}
                  onAnimationEnd={(e) => { if (e.animationName === 'flash') setFlashIdx(null) }}
                  className={`block cursor-pointer rounded px-1 py-0.5 transition-colors ${
                    flashIdx === i ? 'animate-flash' : ''
                  } ${
                    sec.bbox
                      ? 'hover:bg-amber-100 dark:hover:bg-amber-900/20 border-l-2 border-l-amber-300/50'
                      : 'text-muted-foreground/50 border-l-2 border-l-transparent'
                  } ${
                    activeMdIdx === i && !selActive && flashIdx !== i
                      ? '!bg-blue-100 dark:!bg-blue-900/40 ring-1 ring-blue-400 !border-l-blue-500'
                      : ''
                  } ${
                    isSelected && selActive
                      ? '!bg-green-50 dark:!bg-green-900/20 !border-l-green-500'
                      : ''
                  } ${
                    isAnchor
                      ? '!bg-orange-50 dark:!bg-orange-900/20 !border-l-orange-500'
                      : ''
                  }`}
                  onClick={() => {
                    handleMdClick(sec, i)
                    if (selectionMode === 'single' && onToggleSection) {
                      onToggleSection(i)
                    } else if (selectionMode === 'range' && onRangeSelect) {
                      if (rangeAnchor === null) {
                        onToggleSection?.(i)
                      } else {
                        onRangeSelect(Math.min(rangeAnchor!, i), Math.max(rangeAnchor!, i))
                      }
                    }
                  }}
                  title={
                    selActive
                      ? selectionMode === 'range' && rangeAnchor === null ? `第 ${sec.page} 页 — 点击设为起点` : `第 ${sec.page} 页`
                      : sec.bbox ? `第 ${sec.page} 页 — 点击定位` : `估算第 ${sec.page} 页`
                  }
                >
                  {selActive && (
                    <span className={`inline-block w-3.5 h-3.5 mr-1 rounded border text-[9px] leading-none text-center align-middle ${
                      isAnchor ? 'bg-orange-500 border-orange-500 text-white' :
                      isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/30'
                    }`}>
                      {isAnchor ? '▶' : isSelected ? '✓' : ''}
                    </span>
                  )}
                  {sec.text}
                </span>
                )
              })}
            </div>
        </ScrollArea>
      </div>
    </div>
  )
}
