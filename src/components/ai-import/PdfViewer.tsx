import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`

interface PdfBlock {
  page_idx: number
  bbox: [number, number, number, number]
  text?: string
  type?: string
  level?: number
}

interface Props {
  pdfUrl: string
  jsonData?: string
  activePage?: number
  activeBbox?: [number, number, number, number] | null
  onPageChange?: (page: number) => void
  onBlockClick?: (block: PdfBlock) => void
}

interface RenderedPage {
  pageNum: number
  width: number
  height: number
  url: string
}

export function PdfViewer({ pdfUrl, jsonData, activePage, activeBbox, onPageChange, onBlockClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const renderingRef = useRef(false)

  const blocks = jsonData ? parseBlocksDeep(jsonData) : []

  // Load PDF metadata and pre-render all pages as images (lighter than canvas)
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setHasError(false)
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return
        setTotalPages(pdf.numPages)

        const scale = 1.5
        const pages: RenderedPage[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale })
          const oc = document.createElement('canvas')
          oc.width = vp.width
          oc.height = vp.height
          const ctx = oc.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport: vp }).promise
          pages.push({ pageNum: i, width: vp.width, height: vp.height, url: oc.toDataURL() })
          page.cleanup()
        }
        pdf.destroy()
        if (!cancelled) setRenderedPages(pages)
      } catch {
        if (!cancelled) setHasError(true)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Auto-scroll to active page
  useEffect(() => {
    if (!activePage || activePage < 1) return
    const el = pageRefs.current.get(activePage)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activePage, renderedPages])

  const setPageRef = useCallback((pageNum: number) => (el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el)
    else pageRefs.current.delete(pageNum)
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-[400px] text-sm text-muted-foreground">加载 PDF 中...</div>
  }

  if (hasError || renderedPages.length === 0) {
    return (
      <iframe src={pdfUrl} className="w-full h-full min-h-[400px] rounded-lg border" title="PDF" />
    )
  }

  return (
    <div ref={containerRef} className="overflow-auto max-h-[calc(100vh-280px)] space-y-3 pr-1">
      {renderedPages.map((rp) => {
        const displayWidth = Math.min(rp.width / 1.5, 700)
        const scale = displayWidth / rp.width
        const pageBlocks = blocks.filter(b => b.page_idx === rp.pageNum - 1)

        return (
          <div
            key={rp.pageNum}
            ref={setPageRef(rp.pageNum)}
            className="relative mx-auto"
            style={{ width: displayWidth, height: rp.height * scale }}
          >
            <img
              src={rp.url}
              alt={`Page ${rp.pageNum}`}
              className="w-full h-full rounded border"
              style={{ width: displayWidth, height: rp.height * scale }}
            />
            {/* bbox overlay */}
            {pageBlocks.map((block, i) => {
              const [x0, y0, x1, y1] = block.bbox
              const isActiveBbox = activeBbox &&
                Math.abs(activeBbox[0] - x0) < 2 && Math.abs(activeBbox[1] - y0) < 2
              const containerH = rp.height * scale
              const sx = displayWidth / 1000
              const sy = containerH / 1000
              const cssTop = containerH - y1 * sy
              const cssH = Math.max((y1 - y0) * sy, 1)

              return (
                <div
                  key={i}
                  className={`absolute border transition-colors cursor-pointer ${
                    isActiveBbox
                      ? 'border-blue-500 bg-blue-500/30 z-10 ring-1 ring-blue-400'
                      : 'border-transparent hover:border-amber-400/60 hover:bg-amber-400/15'
                  }`}
                  style={{ left: x0 * sx, top: cssTop, width: (x1 - x0) * sx, height: cssH }}
                  title={block.text?.slice(0, 120) || `Block ${i}`}
                  onClick={() => onBlockClick?.(block)}
                />
              )
            })}
            {/* Page number label */}
            <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 bg-background/80 px-1.5 py-0.5 rounded">
              {rp.pageNum} / {totalPages}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Recursive block parser — flattens content_list.json tree
function parseBlocksDeep(jsonData: string): PdfBlock[] {
  const result: PdfBlock[] = []
  try {
    const data = JSON.parse(jsonData)
    if (!Array.isArray(data)) return result
    function walk(items: Record<string, unknown>[], level: number) {
      for (const item of items) {
        if (item.page_idx !== undefined && item.bbox) {
          result.push({
            page_idx: item.page_idx as number,
            bbox: item.bbox as [number, number, number, number],
            text: item.text as string | undefined,
            type: item.type as string | undefined,
            level,
          })
        }
        if (Array.isArray(item.children)) {
          walk(item.children as Record<string, unknown>[], level + 1)
        }
      }
    }
    walk(data, 0)
  } catch { /* ignore */ }
  return result
}
