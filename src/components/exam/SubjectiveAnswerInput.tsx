import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, PenLine, Undo2, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  EMPTY_WRITTEN, estimateWordCount, inkPointCount,
  type InkPoint, type InkStroke, type WrittenAnswer,
} from '@/lib/written-answer'

/**
 * 主观题作答输入：手写 / 打字双模。
 *
 * 有手写笔就在画布上写（吃 `pointerType === 'pen'` 的压感，笔迹粗细跟着压力走），
 * 没有就打字。两种可以同时用——打字框留着，手写层单独一块，互不覆盖。
 *
 * 几个刻意的处理：
 *   - 画布 `touch-action: none`，否则触屏上会被滚动和缩放抢走手势；
 *   - 用 `setPointerCapture`，笔尖滑出画布再回来线不会断；
 *   - 笔迹点存**比例**不存像素，换缩放 / 换设备 / 打 A3 都不变形；
 *   - 画布尺寸变化时按比例重绘，不丢笔迹。
 */
export function SubjectiveAnswerInput({
  value,
  onChange,
  minHeightMm = 40,
  placeholder = '在此作答…',
  wordHint,
  className,
}: {
  value: WrittenAnswer
  onChange: (next: WrittenAnswer) => void
  /** 书写区最小高度（mm），跟真卡上的手写框对齐 */
  minHeightMm?: number
  placeholder?: string
  /** 字数提示，如「160–200 词」 */
  wordHint?: string
  className?: string
}) {
  const [mode, setMode] = useState<'pen' | 'type'>('type')
  const [penAvailable, setPenAvailable] = useState(false)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef<InkStroke | null>(null)
  const [tick, setTick] = useState(0)

  // 有触控笔才默认切到手写，否则打字
  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: fine)') : null
    if (!mq) return
    const onPointerType = (e: PointerEvent) => { if (e.pointerType === 'pen') setPenAvailable(true) }
    window.addEventListener('pointerdown', onPointerType)
    return () => window.removeEventListener('pointerdown', onPointerType)
  }, [])

  /** 笔迹按当前画布尺寸重绘 */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const surface = surfaceRef.current
    if (!canvas || !surface) return
    const rect = surface.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#111827'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const drawStroke = (stroke: InkStroke) => {
      const pts = stroke.points
      if (!pts.length) return
      const base = Math.max(1, stroke.baseWidth * rect.height)
      if (pts.length === 1) {
        ctx.beginPath()
        ctx.arc(pts[0].x * rect.width, pts[0].y * rect.height, base / 2, 0, Math.PI * 2)
        ctx.fillStyle = ctx.strokeStyle as string
        ctx.fill()
        return
      }
      // 逐段画：笔宽跟着压感走，触控笔才有轻重变化（鼠标 / 手指 p 恒为 0.5）
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        ctx.lineWidth = base * (0.55 + ((a.p + b.p) / 2) * 0.9)
        ctx.beginPath()
        ctx.moveTo(a.x * rect.width, a.y * rect.height)
        ctx.lineTo(b.x * rect.width, b.y * rect.height)
        ctx.stroke()
      }
    }
    for (const s of value.ink) drawStroke(s)
    if (drawingRef.current) drawStroke(drawingRef.current)
  }, [value.ink])

  useEffect(() => {
    redraw()
    const surface = surfaceRef.current
    if (!surface) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(surface)
    return () => observer.disconnect()
  }, [redraw, tick])

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint | null => {
    const surface = surfaceRef.current
    if (!surface) return null
    const rect = surface.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      // 笔有压感，鼠标 / 手指给 0.5（不压不出粗细变化，但也不至于细成一根线）
      p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pen') return
    e.preventDefault()
    const p = pointFrom(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.pointerType === 'pen') setPenAvailable(true)
    drawingRef.current = { points: [p], baseWidth: 0.028 }
    redraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pen' || !drawingRef.current) return
    e.preventDefault()
    const p = pointFrom(e)
    if (!p) return
    drawingRef.current.points.push(p)
    redraw()
  }

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pen' || !drawingRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const stroke = drawingRef.current
    drawingRef.current = null
    if (stroke.points.length === 0) return
    onChange({ ...value, ink: [...value.ink, stroke] })
    setTick((t) => t + 1)
  }

  const words = estimateWordCount(value.text)
  const inkPoints = inkPointCount(value)

  return (
    <div className={cn('rounded-md border', className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setMode('type')}
          className={cn(
            'flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors',
            mode === 'type' ? 'border-primary/60 bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Keyboard className="h-3 w-3" />
          打字
        </button>
        <button
          type="button"
          onClick={() => setMode('pen')}
          className={cn(
            'flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors',
            mode === 'pen' ? 'border-primary/60 bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <PenLine className="h-3 w-3" />
          手写
          {penAvailable && <span className="rounded bg-emerald-100 px-1 text-[9px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">已识别触控笔</span>}
        </button>

        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {wordHint && <span className={cn('tabular-nums', words > 0 && 'text-foreground')}>{words} 词 / 建议 {wordHint}</span>}
          {inkPoints > 0 && <span className="tabular-nums">{value.ink.length} 笔</span>}
          {value.ink.length > 0 && (
            <>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onChange({ ...value, ink: value.ink.slice(0, -1) })}>
                <Undo2 className="mr-0.5 h-3 w-3" />
                撤销
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onChange({ ...value, ink: [] })}>
                <Eraser className="mr-0.5 h-3 w-3" />
                清笔迹
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 打字框：一直留着，手写模式下也能补文字 */}
      <textarea
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={placeholder}
        spellCheck={false}
        style={{ minHeight: `${Math.max(12, minHeightMm * 0.5)}mm` }}
        className={cn(
          'block w-full resize-y bg-white px-3 py-2 text-sm leading-7 text-neutral-900 outline-none dark:bg-neutral-950 dark:text-neutral-100',
          mode === 'pen' && 'hidden',
        )}
      />

      {/* 手写层：横线底 + 画布 */}
      {mode === 'pen' && (
        <div
          ref={surfaceRef}
          style={{ height: `${minHeightMm}mm` }}
          className="relative w-full touch-none bg-white dark:bg-neutral-950"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 9mm, rgba(120,120,120,0.35) 9mm, rgba(120,120,120,0.35) calc(9mm + 1px))',
            }}
          />
          <canvas
            ref={canvasRef}
            className="relative h-full w-full cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
          {value.ink.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              用触控笔或手指在此书写
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export { EMPTY_WRITTEN }
