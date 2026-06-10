import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface Block { page_idx: number; bbox: [number, number, number, number]; text?: string; type?: string }

export function Component() {
  const pdfUrl = sessionStorage.getItem('pdf_test_url')
  const jsonStr = sessionStorage.getItem('pdf_test_json')
  const mdStr = sessionStorage.getItem('pdf_test_md')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [renderScale, setRenderScale] = useState(1.2)
  const [displayW, setDisplayW] = useState(700)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Parse blocks from jsonData
  useEffect(() => {
    if (!jsonStr) return
    try {
      const data = JSON.parse(jsonStr)
      const result: Block[] = []
      function walk(items: any[]) {
        for (const item of items) {
          const idx = (item.page_idx ?? item.page_index) as number | undefined
          if (idx !== undefined && item.bbox) {
            result.push({ page_idx: idx, bbox: item.bbox, text: item.text, type: item.category || item.type })
          }
          if (Array.isArray(item.children)) walk(item.children)
        }
      }
      walk(Array.isArray(data) ? data : [])
      setBlocks(result)
    } catch { /* ignore */ }
  }, [jsonStr])

  // Load PDF metadata
  useEffect(() => {
    if (!pdfUrl) return
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
    if (!pdfUrl) return
    let cancelled = false
    ;(async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const page = await pdf.getPage(currentPage)
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
  }, [pdfUrl, currentPage, renderScale])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDisplayW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageBlocks = blocks.filter(b => b.page_idx === currentPage - 1)
  const cssScale = pageSize ? displayW / pageSize.w : 1
  const pdfScale = pageSize ? (renderScale * cssScale) : 1

  if (!pdfUrl) return <p className="p-8 text-muted-foreground">no data — go back and click 调试定位</p>

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 text-xs">
        <span className="font-medium">定位调试</span>
        <span>页 {currentPage}/{totalPages}</span>
        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setCurrentPage(p => Math.max(1, p-1))}>‹</Button>
        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))}>›</Button>
        <label className="ml-4">缩放</label>
        <Input type="number" value={renderScale} step={0.1} min={0.5} max={3}
          onChange={e => setRenderScale(Number(e.target.value))} className="w-16 h-6 text-xs" />
        <span className="text-muted-foreground">
          Canvas: {pageSize?.w}x{pageSize?.h} | 容器: {displayW}px | pdfScale: {pdfScale.toFixed(4)}
        </span>
      </div>

      {/* Split view */}
      <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
        {/* Left: PDF */}
        <div className="overflow-auto border-r">
          <div ref={containerRef} className="p-2">
            <div className="relative mx-auto" style={{ width: displayW }}>
              <canvas ref={canvasRef} className="w-full rounded border" style={{ height: pageSize ? pageSize.h * cssScale : 600 }} />
              {pageSize && pageBlocks.map((b, i) => {
                const [x0, y0, x1, y1] = b.bbox
                const left = x0 * pdfScale, top = y0 * pdfScale
                const w = Math.max((x1 - x0) * pdfScale, 2), h = Math.max((y1 - y0) * pdfScale, 2)
                return (
                  <div key={i} className="absolute border border-amber-500/70 bg-amber-400/15 cursor-pointer hover:bg-amber-400/40"
                    style={{ left, top, width: w, height: h }}
                    title={`${b.text?.slice(0, 80)} | [${x0},${y0},${x1},${y1}]`} />
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Markdown */}
        <ScrollArea className="p-3">
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">{mdStr}</pre>
        </ScrollArea>
      </div>
    </div>
  )
}
