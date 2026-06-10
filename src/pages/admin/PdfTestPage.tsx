import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export function Component() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const pdfUrl = pdfFile ? URL.createObjectURL(pdfFile) : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
  const [blocks, setBlocks] = useState<any[]>([])
  const [scale, setScale] = useState(1.2)
  const [displayW, setDisplayW] = useState(700)

  // Load JSON
  useEffect(() => {
    if (!jsonFile) return
    jsonFile.text().then(t => {
      const data = JSON.parse(t)
      const result: any[] = []
      function walk(items: any[]) {
        for (const item of items) {
          if (item.page_idx !== undefined && item.bbox) {
            result.push({ page_idx: item.page_idx, bbox: item.bbox, text: item.text?.slice(0,60), type: item.category || item.type })
          }
          if (Array.isArray(item.children)) walk(item.children)
        }
      }
      walk(Array.isArray(data) ? data : [])
      setBlocks(result)
      console.log('[Test] blocks:', result.slice(0,5))
    })
  }, [jsonFile])

  // Render PDF
  useEffect(() => {
    if (!pdfUrl) return
    let cancelled = false
    ;(async () => {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      const page = await pdf.getPage(1)
      const vp = page.getViewport({ scale })
      const cvs = canvasRef.current
      if (!cvs || cancelled) { page.cleanup(); pdf.destroy(); return }
      cvs.width = vp.width
      cvs.height = vp.height
      setPageSize({ w: vp.width, h: vp.height })
      // also log the original PDF size
      const vp1 = page.getViewport({ scale: 1 })
      console.log('[Test] PDF 1x size:', vp1.width, 'x', vp1.height)
      console.log('[Test] Canvas', scale, 'x size:', vp.width, 'x', vp.height)
      const ctx = cvs.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      pdf.destroy()
    })()
    return () => { cancelled = true }
  }, [pdfUrl, scale])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDisplayW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageBlocks = blocks.filter(b => b.page_idx === 0)
  const cssScale = pageSize ? displayW / pageSize.w : 1 // internal canvas px → CSS px
  const rawScale = pageSize ? (displayW / (pageSize.w / scale)) : 1 // PDF pt → CSS px (ignoring render scale)

  return (
    <div className="space-y-4 max-w-5xl mx-auto p-4">
      <h1 className="text-xl font-bold">PDF 定位测试</h1>

      <div className="flex gap-4">
        <div>
          <label className="text-xs">PDF 文件</label>
          <Input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label className="text-xs">layout.json</label>
          <Input type="file" accept=".json" onChange={e => setJsonFile(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label className="text-xs">渲染缩放</label>
          <Input type="number" value={scale} step={0.1} min={0.5} max={3}
            onChange={e => setScale(Number(e.target.value))} className="w-20" />
        </div>
      </div>

      <Card>
        <CardContent className="py-4 text-xs font-mono space-y-1">
          <p>容器宽度: {displayW}px</p>
          {pageSize && (
            <>
              <p>Canvas 内部: {pageSize.w}x{pageSize.h}</p>
              <p>CSS 尺寸: {(pageSize.w * cssScale).toFixed(0)}x{(pageSize.h * cssScale).toFixed(0)}</p>
              <p>displayScale (canvas→CSS): {cssScale.toFixed(4)}</p>
              <p>rawScale (PDF→CSS): {rawScale.toFixed(4)}</p>
              <p>渲染缩放: {scale}x</p>
            </>
          )}
          <p>Blocks: {pageBlocks.length} (page 0)</p>
        </CardContent>
      </Card>

      <div ref={containerRef} className="border rounded-lg overflow-auto bg-muted/30" style={{ height: 'calc(100vh - 360px)' }}>
        <div className="relative mx-auto" style={{ width: displayW, minHeight: pageSize ? pageSize.h * cssScale : 600 }}>
          {pdfUrl && <canvas ref={canvasRef} className="w-full rounded border" style={{ height: pageSize ? pageSize.h * cssScale : 600 }} />}

          {/* CSS-scale (canvas→CSS) bbox */}
          {pageSize && pageBlocks.map((b, i) => {
            const [x0, y0, x1, y1] = b.bbox
            const s = scale * cssScale // PDF pt → CSS px
            const left = x0 * s, top = y0 * s
            const w = Math.max((x1 - x0) * s, 2), h = Math.max((y1 - y0) * s, 2)
            return (
              <div key={i} className="absolute border border-amber-500/60 bg-amber-400/10 cursor-pointer hover:bg-amber-400/30"
                style={{ left, top, width: w, height: h }}
                title={`${b.text} | bbox:[${x0},${y0},${x1},${y1}]`}
                onClick={() => console.log('[Test] clicked', b)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
