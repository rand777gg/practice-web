import { useState, useEffect, useRef, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ---- Types ----

interface PdfBlock {
  page_idx: number
  bbox: [number, number, number, number]
  text?: string
  type?: string
}

interface MdSection {
  text: string
  page: number
  bbox: [number, number, number, number] | null
}

interface Props {
  pdfUrl: string
  jsonData?: string
  markdown: string
  children?: React.ReactNode  // toolbar actions slot
}

// ---- Block parsing ----

function parseBlocks(jsonData: string): PdfBlock[] {
  const result: PdfBlock[] = []
  try {
    const data = JSON.parse(jsonData)
    if (!Array.isArray(data)) return result
    function walk(items: Record<string, unknown>[], _level: number) {
      for (const item of items) {
        const idx = (item.page_idx ?? item.page_index) as number | undefined
        if (idx !== undefined && item.bbox) {
          result.push({
            page_idx: idx,
            bbox: item.bbox as [number, number, number, number],
            text: item.text as string | undefined,
            type: (item.category || item.type) as string | undefined,
          })
        }
        if (Array.isArray(item.children)) walk(item.children as Record<string, unknown>[], _level + 1)
      }
    }
    walk(data, 0)
  } catch { /* ignore */ }
  return result
}

// ---- Text matching ----

function normalize(s: string) {
  return s.replace(/[#*\s\n\r\t`~|>\\[\]()]+/g, ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase()
}

function lcsSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  if (shorter.length === 0) return 0
  let maxLen = 0
  const window = Math.min(shorter.length, 30)
  for (let i = 0; i < shorter.length; i++) {
    if (shorter.length - i <= maxLen) break
    for (let len = window; len > maxLen; len--) {
      const sub = shorter.substring(i, i + len)
      if (sub.length < 4) continue
      if (longer.includes(sub)) { maxLen = sub.length; break }
    }
  }
  return maxLen / Math.max(shorter.length, 1)
}

function matchMarkdownToPdf(md: string, blocks: PdfBlock[]): MdSection[] {
  const paragraphs = md.split(/\n\n+/).filter(p => p.trim())
  const textBlocks = blocks.filter(b => b.text && b.text.trim().length > 1)
  if (textBlocks.length === 0) {
    return paragraphs.map(p => ({ text: p, page: 1, bbox: null }))
  }
  return paragraphs.map((para) => {
    const norm = normalize(para)
    if (norm.length < 4) {
      const fb = textBlocks[0]
      return { text: para, page: fb.page_idx + 1, bbox: fb.bbox }
    }
    let best: PdfBlock | null = null; let bestScore = 0
    const topBlocks = textBlocks.filter(b => b.type !== 'table-body' && b.type !== 'table-row')
    for (const b of topBlocks) {
      const s = lcsSimilarity(norm, normalize(b.text!))
      if (s > bestScore) { bestScore = s; best = b }
    }
    if (bestScore < 0.2) {
      for (const b of textBlocks) {
        const s = lcsSimilarity(norm, normalize(b.text!))
        if (s > bestScore) { bestScore = s; best = b }
      }
    }
    if (!best || bestScore < 0.1) {
      const ratio = paragraphs.indexOf(para) / Math.max(paragraphs.length, 1)
      const estPage = Math.floor(ratio * (blocks.length > 0 ? Math.max(...blocks.map(b => b.page_idx)) + 1 : 1))
      return { text: para, page: estPage + 1, bbox: null }
    }
    return { text: para, page: best.page_idx + 1, bbox: best.bbox }
  })
}

// ---- Component ----

export function PdfMarkdownViewer({ pdfUrl, jsonData, markdown, children }: Props) {
  const mdRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const pageImgRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [renderedPages, setRenderedPages] = useState<{ p: number; w: number; h: number; src: string }[]>([])
  const [containerW, setContainerW] = useState(700)
  const [activeMdIdx, setActiveMdIdx] = useState<number | null>(null)
  const [activeBbox, setActiveBbox] = useState<[number, number, number, number] | null>(null)

  const blocks = jsonData ? parseBlocks(jsonData) : []
  const isNormalized = blocks.length > 0 && blocks.every(b => b.bbox.every(v => v <= 1000))

  const sections = (() => {
    if (!jsonData || blocks.length === 0) return markdown.split(/\n\n+/).filter(p => p.trim()).map(p => ({ text: p, page: 1, bbox: null as [number,number,number,number] | null }))
    return matchMarkdownToPdf(markdown, blocks)
  })()
  const matched = sections.filter(s => s.bbox).length

  const RENDER_SCALE = 2.0

  // Render all PDF pages as images
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const scale = RENDER_SCALE
      const pages: { p: number; w: number; h: number; src: string }[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return
        const page = await pdf.getPage(i)
        const vp = page.getViewport({ scale })
        const cvs = document.createElement('canvas')
        cvs.width = vp.width
        cvs.height = vp.height
        const ctx = cvs.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        pages.push({ p: i, w: vp.width, h: vp.height, src: cvs.toDataURL() })
        page.cleanup()
      }
      pdf.destroy()
      if (!cancelled) setRenderedPages(pages)
    })()
    return () => { cancelled = true }
  }, [pdfUrl])

  // ResizeObserver
  useEffect(() => {
    const el = pdfContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // MD click → highlight MD, scroll PDF to page
  const handleMdClick = useCallback((sec: MdSection, idx: number) => {
    setActiveMdIdx(idx)
    if (sec.bbox) {
      setActiveBbox(sec.bbox)
      const pageEl = pageImgRefs.current.get(sec.page)
      if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // PDF block click → highlight bbox, scroll MD to matching section
  const handlePdfBlockClick = useCallback((block: PdfBlock) => {
    setActiveBbox(block.bbox)
    const blockNorm = normalize(block.text || '')
    let bestIdx = -1; let bestSim = 0
    for (let i = 0; i < sections.length; i++) {
      if (!sections[i].bbox) continue
      const sim = lcsSimilarity(blockNorm, normalize(sections[i].text))
      if (sim > bestSim && sim > 0.05) { bestSim = sim; bestIdx = i }
    }
    if (bestIdx < 0) {
      bestIdx = sections.findIndex(
        s => s.bbox && Math.abs(s.bbox![0] - block.bbox[0]) < 2 && Math.abs(s.bbox![1] - block.bbox[1]) < 2
      )
    }
    if (bestIdx >= 0) {
      setActiveMdIdx(bestIdx)
      const el = mdRef.current?.querySelector(`[data-md-idx="${bestIdx}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [sections])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 py-2 px-1 shrink-0 text-[10px] text-muted-foreground flex-wrap">
        <span>共 {renderedPages.length} 页</span>
        <span className="text-muted-foreground/60">|</span>
        <span>段落 {sections.length}</span>
        <span className={matched > 0 ? 'text-green-600' : 'text-amber-600'}>
          匹配 {matched}
        </span>
        {jsonData && (
          <span className="text-muted-foreground/60">
            | {blocks.length} 块 · {isNormalized ? '归一化' : '绝对坐标'}
          </span>
        )}
        <span className="flex-1" />
        {children}
      </div>

      {/* Split view */}
      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        {/* Left: All PDF pages */}
        <div ref={pdfContainerRef} className="overflow-auto border-r p-2 space-y-3">
          {renderedPages.map(rp => {
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
                <img src={rp.src} alt={`Page ${rp.p}`} className="w-full h-full rounded border" />
                {pageBlocks.map((b, i) => {
                  const [x0, y0, x1, y1] = b.bbox
                  const isActive = activeBbox &&
                    Math.abs(activeBbox[0] - x0) < 2 && Math.abs(activeBbox[1] - y0) < 2
                  let left: number, top: number, w: number, h: number
                  if (isNormalized) {
                    left = (x0 / 1000) * cssW
                    top = (y0 / 1000) * cssH
                    w = Math.max(((x1 - x0) / 1000) * cssW, 2)
                    h = Math.max(((y1 - y0) / 1000) * cssH, 2)
                  } else {
                    const s = RENDER_SCALE * pageScale
                    left = x0 * s; top = y0 * s
                    w = Math.max((x1 - x0) * s, 2); h = Math.max((y1 - y0) * s, 2)
                  }
                  return (
                    <div key={i}
                      className={`absolute border transition-colors cursor-pointer ${
                        isActive ? 'border-blue-500 bg-blue-500/25 z-10 ring-1 ring-blue-400'
                        : 'border-transparent hover:border-amber-400/60 hover:bg-amber-400/15'
                      }`}
                      style={{ left, top, width: w, height: h }}
                      title={(b.text || '').slice(0, 120)}
                      onClick={() => handlePdfBlockClick(b)}
                    />
                  )
                })}
                <span className="absolute bottom-1 right-2 text-[9px] text-muted-foreground/40 bg-background/70 px-1 rounded">
                  {rp.p}
                </span>
              </div>
            )
          })}
        </div>

        {/* Right: Markdown */}
        <ScrollArea className="p-3">
          <div ref={mdRef} className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
            {sections.map((sec, i) => (
              <span
                key={i}
                data-md-idx={i}
                className={`block cursor-pointer rounded px-1 py-0.5 transition-colors ${
                  sec.bbox
                    ? 'hover:bg-amber-100 dark:hover:bg-amber-900/20 border-l-2 border-l-amber-300/50'
                    : 'text-muted-foreground/50 border-l-2 border-l-transparent'
                } ${
                  activeMdIdx === i
                    ? '!bg-blue-100 dark:!bg-blue-900/40 ring-1 ring-blue-400 !border-l-blue-500'
                    : ''
                }`}
                onClick={() => handleMdClick(sec, i)}
                title={sec.bbox ? `第 ${sec.page} 页 — 点击定位` : `估算第 ${sec.page} 页`}
              >
                {sec.text}
              </span>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
