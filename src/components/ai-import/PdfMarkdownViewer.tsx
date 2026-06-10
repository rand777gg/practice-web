import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mdRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)

  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
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

  // Parse page from sections for navigation
  const sectionPages = sections.map(s => s.page)

  // PDF metadata
  useEffect(() => {
    let c = false
    ;(async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (c) return
      setTotalPages(pdf.numPages)
      pdf.destroy()
    })()
    return () => { c = true }
  }, [pdfUrl])

  // Render current page
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const page = await pdf.getPage(currentPage)
      const renderScale = 1.2
      const vp = page.getViewport({ scale: renderScale })
      const cvs = canvasRef.current
      if (!cvs || cancelled) { page.cleanup(); pdf.destroy(); return }
      cvs.width = vp.width
      cvs.height = vp.height
      setPageSize({ w: vp.width, h: vp.height })
      const ctx = cvs.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      pdf.destroy()
    })()
    return () => { cancelled = true }
  }, [pdfUrl, currentPage])

  // ResizeObserver
  useEffect(() => {
    const el = pdfContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const goPage = useCallback((p: number) => {
    setCurrentPage(Math.max(1, Math.min(p, totalPages || 1)))
  }, [totalPages])

  const displayScale = pageSize && containerW ? containerW / pageSize.w : 1
  const displayHeight = pageSize ? pageSize.h * displayScale : 0
  const pageBlocks = blocks.filter(b => b.page_idx === currentPage - 1)

  // MD click → navigate PDF
  const handleMdClick = useCallback((sec: MdSection, idx: number) => {
    setActiveMdIdx(idx)
    if (sec.bbox) {
      setActiveBbox(sec.bbox)
      goPage(sec.page)
    }
  }, [goPage])

  // PDF block click → scroll MD
  const handlePdfBlockClick = useCallback((block: PdfBlock) => {
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
      setActiveBbox(sections[bestIdx].bbox)
      setTimeout(() => {
        const el = mdRef.current?.querySelector(`[data-md-idx="${bestIdx}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [sections])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 py-2 px-1 shrink-0 text-[10px] text-muted-foreground flex-wrap">
        <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)}>‹</button>
        <span className="tabular-nums">{currentPage}/{totalPages || '?'}</span>
        <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage >= totalPages} onClick={() => goPage(currentPage + 1)}>›</button>
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
        {/* Left: PDF */}
        <div ref={pdfContainerRef} className="overflow-auto border-r p-1">
          <div className="relative mx-auto" style={{ width: containerW }}>
            <canvas ref={canvasRef} className="w-full rounded border" style={{ height: displayHeight || 600 }} />
            {pageSize && pageBlocks.map((b, i) => {
              const [x0, y0, x1, y1] = b.bbox
              const isActive = activeBbox &&
                Math.abs(activeBbox[0] - x0) < 2 && Math.abs(activeBbox[1] - y0) < 2
              let left: number, top: number, w: number, h: number
              if (isNormalized) {
                // content_list.json: 0-1000, Y from bottom (PDF-style)
                const cw = containerW; const ch = displayHeight
                left = (x0 / 1000) * cw
                top = ch - (y1 / 1000) * ch
                w = Math.max(((x1 - x0) / 1000) * cw, 2)
                h = Math.max(((y1 - y0) / 1000) * ch, 2)
              } else {
                // layout.json: absolute PDF points, Y from top
                const s = 1.2 * displayScale
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
          </div>
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
