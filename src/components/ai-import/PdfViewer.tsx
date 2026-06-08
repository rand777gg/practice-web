import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`

interface PdfBlock {
  page_idx: number
  bbox: [number, number, number, number]
  text?: string
  type?: string
}

interface Props {
  pdfUrl: string
  jsonData?: string
  activePage?: number
  activeBbox?: [number, number, number, number] | null
  onPageChange?: (page: number) => void
  onBlockClick?: (block: PdfBlock) => void
}

export function PdfViewer({ pdfUrl, jsonData, activePage, activeBbox, onPageChange, onBlockClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<{ width: number; height: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())

  const blocks = jsonData ? parseBlocks(jsonData) : []
  const totalPages = Math.max(pages.length, blocks.length > 0 ? Math.max(...blocks.map(b => b.page_idx)) + 1 : 0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return
        const pageInfos: { width: number; height: number }[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          pageInfos.push({ width: vp.width, height: vp.height })
          page.cleanup()
        }
        if (!cancelled) setPages(pageInfos)
      } catch {
        // fallback to iframe
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Render visible pages
  useEffect(() => {
    if (pages.length === 0) return
    let cancelled = false
    async function render() {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const scale = 0.8
      for (const [pageNum, canvas] of canvasRefs.current) {
        if (cancelled) return
        const page = await pdf.getPage(pageNum)
        const vp = page.getViewport({ scale })
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        page.cleanup()
      }
      pdf.destroy()
    }
    render()
    return () => { cancelled = true }
  }, [pages, currentPage])

  useEffect(() => {
    if (activePage !== undefined && activePage >= 1 && activePage <= totalPages) {
      setCurrentPage(activePage)
    }
  }, [activePage, totalPages])

  const setCanvasRef = useCallback((pageNum: number) => (el: HTMLCanvasElement | null) => {
    if (el) canvasRefs.current.set(pageNum, el)
    else canvasRefs.current.delete(pageNum)
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-[500px] text-sm text-muted-foreground">加载 PDF 中...</div>
  }

  if (pages.length === 0) {
    return (
      <iframe src={pdfUrl} className="w-full h-[500px] rounded-lg border" title="PDF" />
    )
  }

  const page = pages[currentPage - 1]
  if (!page) return null
  const displayWidth = Math.min(page.width * 0.8, 600)
  const scale = displayWidth / page.width

  const pageBlocks = blocks.filter(b => b.page_idx === currentPage - 1)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage <= 1} onClick={() => { setCurrentPage(p => p - 1); onPageChange?.(currentPage - 1) }}>
          ‹ 上一页
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">{currentPage} / {pages.length}</span>
        <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-accent disabled:opacity-30"
          disabled={currentPage >= pages.length} onClick={() => { setCurrentPage(p => p + 1); onPageChange?.(currentPage + 1) }}>
          下一页 ›
        </button>
      </div>
      <div className="relative mx-auto" style={{ width: displayWidth, height: page.height * scale }} ref={containerRef}>
        <canvas ref={setCanvasRef(currentPage)} className="absolute inset-0 w-full h-full rounded border" />
        {/* content_list.json bbox is in 0-1000 range; scale to canvas size */}
        {pageBlocks.map((block, i) => {
          const [x0, y0, x1, y1] = block.bbox
          const isActive = activeBbox && activeBbox[0] === x0 && activeBbox[1] === y0
          const sx = displayWidth / 1000
          const sy = (page.height * scale) / 1000
          return (
            <div
              key={i}
              className={`absolute border transition-colors cursor-pointer ${isActive ? 'border-blue-500 bg-blue-500/20' : 'border-transparent hover:border-amber-400/50 hover:bg-amber-400/10'}`}
              style={{ left: x0 * sx, top: y0 * sy, width: (x1 - x0) * sx, height: (y1 - y0) * sy }}
              title={`${block.text?.slice(0, 100) || ''} — 点击定位`}
              onClick={() => onBlockClick?.(block)}
            />
          )
        })}
      </div>
    </div>
  )
}

function parseBlocks(jsonData: string): PdfBlock[] {
  try {
    const data = JSON.parse(jsonData)
    if (Array.isArray(data)) {
      return (data as Record<string, unknown>[]).filter(item =>
        item.page_idx !== undefined && item.bbox
      ).map(item => ({
        page_idx: item.page_idx as number,
        bbox: item.bbox as [number, number, number, number],
        text: item.text as string | undefined,
        type: item.type as string | undefined,
      }))
    }
    return []
  } catch { return [] }
}
