import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`

interface LayoutBlock {
  page_idx: number
  bbox: [number, number, number, number]
  text?: string
  category?: string
  type?: string
}

interface Props {
  pdfUrl: string
  jsonData?: string
  activePage?: number
  activeBbox?: [number, number, number, number] | null
  onPageChange?: (page: number) => void
  onBlockClick?: (block: LayoutBlock) => void
}

export function PdfViewer({ pdfUrl, jsonData, activePage, activeBbox, onPageChange, onBlockClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const blocks = jsonData ? parseLayoutBlocks(jsonData) : []

  // Sync activePage
  useEffect(() => {
    if (activePage && activePage >= 1 && activePage <= totalPages) {
      setCurrentPage(activePage)
    }
  }, [activePage, totalPages])

  // Render current page
  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return
        const page = await pdf.getPage(currentPage)
        const scale = 1.2
        const vp = page.getViewport({ scale })
        const cvs = canvasRef.current
        if (!cvs || cancelled) { page.cleanup(); pdf.destroy(); return }

        cvs.width = vp.width
        cvs.height = vp.height
        setPageSize({ width: vp.width, height: vp.height })

        const ctx = cvs.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        page.cleanup()
        pdf.destroy()
      } catch {
        // silent fail, iframe fallback already handled above
      }
      if (!cancelled) setLoading(false)
    }
    setLoading(true)
    render()
    return () => { cancelled = true }
  }, [pdfUrl, currentPage])

  // Load PDF metadata
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (!cancelled) setTotalPages(pdf.numPages)
        pdf.destroy()
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  const goPage = useCallback((p: number) => {
    const next = Math.max(1, Math.min(p, totalPages))
    setCurrentPage(next)
    onPageChange?.(next)
  }, [totalPages, onPageChange])

  if (totalPages === 0 && !loading) {
    return <iframe src={pdfUrl} className="w-full h-full min-h-[400px] rounded-lg border" title="PDF" />
  }

  // Layout.json blocks use absolute PDF coordinates (points), convert to display
  const pageBlocks = blocks.filter(b => b.page_idx === currentPage - 1)
  const displayWidth = Math.min(pageSize?.width || 700, 700)
  const displayScale = pageSize ? displayWidth / pageSize.width : 1

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2">
        <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)}>
          ‹ 上一页
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">{currentPage} / {totalPages || '?'}</span>
        <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage >= totalPages} onClick={() => goPage(currentPage + 1)}>
          下一页 ›
        </button>
      </div>
      <div ref={containerRef} className="relative mx-auto" style={{ width: displayWidth, height: (pageSize?.height || 0) * displayScale }}>
        <canvas ref={canvasRef} className="w-full h-full rounded border" />
        {/* bbox overlay — layout.json coords are absolute PDF points */}
        {pageSize && pageBlocks.map((block, i) => {
          const [x0, y0, x1, y1] = block.bbox
          const isActive = activeBbox &&
            Math.abs(activeBbox[0] - x0) < 5 && Math.abs(activeBbox[1] - y0) < 5
          // PDF y: bottom→top, CSS y: top→bottom
          const cssTop = (pageSize.height - y1) * displayScale
          const cssH = Math.max((y1 - y0) * displayScale, 2)
          const cssLeft = x0 * displayScale
          const cssW = Math.max((x1 - x0) * displayScale, 2)

          return (
            <div
              key={i}
              className={`absolute border transition-colors cursor-pointer ${
                isActive
                  ? 'border-blue-500 bg-blue-500/25 z-10 ring-1 ring-blue-400'
                  : 'border-transparent hover:border-amber-400/60 hover:bg-amber-400/15'
              }`}
              style={{ left: cssLeft, top: cssTop, width: cssW, height: cssH }}
              title={(block.text || block.category || 'Block').slice(0, 120)}
              onClick={() => onBlockClick?.(block)}
            />
          )
        })}
      </div>
    </div>
  )
}

// Parse layout.json or content_list.json (handles both formats)
function parseLayoutBlocks(jsonData: string): LayoutBlock[] {
  const result: LayoutBlock[] = []
  try {
    const data = JSON.parse(jsonData)
    if (!Array.isArray(data)) return result
    function walk(items: Record<string, unknown>[], level: number) {
      for (const item of items) {
        if ((item.page_idx !== undefined || item.page_index !== undefined) && item.bbox) {
          const pageIdx = (item.page_idx ?? item.page_index) as number
          const bbox = item.bbox as [number, number, number, number]
          // Only include blocks with meaningful text content
          result.push({
            page_idx: pageIdx,
            bbox,
            text: item.text as string | undefined,
            category: item.category as string | undefined,
            type: item.type as string | undefined,
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
