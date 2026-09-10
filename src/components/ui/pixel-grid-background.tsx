import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type PixelGridVariant = 'interactive' | 'wave' | 'noise'

type PixelGridBackgroundProps = {
  variant?: PixelGridVariant
  cell?: number
  gap?: number
  intensity?: number
  className?: string
}

const BUCKETS = 16
const HOVER_RADIUS = 170
const OFFSCREEN = -1e4

const mask = 'linear-gradient(to bottom, #000 55%, transparent 100%)'

export function PixelGridBackground({
  variant = 'interactive',
  cell = 10,
  gap = 9,
  intensity = 0.5,
  className,
}: PixelGridBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const step = cell + gap
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const buckets: number[][] = Array.from({ length: BUCKETS + 1 }, () => [])

    let width = 1
    let height = 1
    let dpr = 1
    let cols = 0
    let rows = 0
    let seeds = new Float32Array(0)
    let heat = new Float32Array(0)
    let fill = '#000'
    let pointerX = OFFSCREEN
    let pointerY = OFFSCREEN
    let smoothX = OFFSCREEN
    let smoothY = OFFSCREEN
    let time = 0
    let last = 0
    let raf = 0
    let onScreen = true

    const refreshColor = () => {
      const color = window.getComputedStyle(canvas).color
      if (color) fill = color
    }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const nextCols = Math.ceil(width / step)
      const nextRows = Math.ceil(height / step)
      if (nextCols === cols && nextRows === rows) return
      cols = nextCols
      rows = nextRows
      seeds = new Float32Array(cols * rows)
      heat = new Float32Array(cols * rows)
      for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random()
    }

    const paint = (t: number, dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = fill
      for (const bucket of buckets) bucket.length = 0

      if (variant === 'interactive') {
        smoothX += (pointerX - smoothX) * 0.22
        smoothY += (pointerY - smoothY) * 0.22
        const decay = Math.pow(0.02, dt)
        for (let i = 0; i < heat.length; i += 1) heat[i] *= decay
        const c0 = Math.max(0, Math.floor((smoothX - HOVER_RADIUS) / step))
        const c1 = Math.min(cols - 1, Math.floor((smoothX + HOVER_RADIUS) / step))
        const r0 = Math.max(0, Math.floor((smoothY - HOVER_RADIUS) / step))
        const r1 = Math.min(rows - 1, Math.floor((smoothY + HOVER_RADIUS) / step))
        for (let r = r0; r <= r1; r += 1) {
          for (let c = c0; c <= c1; c += 1) {
            const dx = c * step + cell / 2 - smoothX
            const dy = r * step + cell / 2 - smoothY
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist >= HOVER_RADIUS) continue
            const f = 1 - dist / HOVER_RADIUS
            const k = f * f * (3 - 2 * f)
            const i = r * cols + c
            if (k > heat[i]) heat[i] = k
          }
        }
      }

      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const i = r * cols + c
          let alpha: number
          let scale = 1
          if (variant === 'interactive') {
            const glow = heat[i]
            alpha = 0.1 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.8 + seeds[i] * 12.566)) + glow * 0.9
            scale = 1 + glow * 0.4
          } else if (variant === 'wave') {
            const a = 0.5 + 0.5 * Math.sin((c + r) * 0.32 - t * 1.5)
            const b = 0.5 + 0.5 * Math.sin((c - r) * 0.21 - t * 0.9)
            const n = a * 0.65 + b * 0.35
            alpha = 0.06 + 0.95 * n * n * n
          } else {
            const a = 0.5 + 0.5 * Math.sin(t * 1.6 * (0.5 + seeds[i]) + seeds[i] * 6.283)
            const b = 0.5 + 0.5 * Math.sin(t * 0.45 + seeds[i] * 12.566)
            const n = a * 0.6 + b * 0.4
            alpha = 0.04 + 0.9 * n * n
          }
          if (alpha <= 0.004) continue
          const bucket = Math.min(BUCKETS, Math.max(1, Math.round(alpha * BUCKETS)))
          const size = cell * scale
          const offset = (size - cell) / 2
          buckets[bucket].push(c * step - offset, r * step - offset, size, size)
        }
      }

      for (let b = 1; b <= BUCKETS; b += 1) {
        const list = buckets[b]
        if (list.length === 0) continue
        ctx.globalAlpha = Math.min(1, (b / BUCKETS) * intensity)
        ctx.beginPath()
        for (let k = 0; k < list.length; k += 4) {
          ctx.rect(list[k], list[k + 1], list[k + 2], list[k + 3])
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const stop = () => {
      if (!raf) return
      cancelAnimationFrame(raf)
      raf = 0
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      time += dt
      paint(time, dt)
    }

    const start = () => {
      if (raf || reduced) return
      last = 0
      raf = requestAnimationFrame(frame)
    }

    const sync = () => {
      if (!onScreen || document.hidden) {
        stop()
        return
      }
      start()
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerX = event.clientX - rect.left
      pointerY = event.clientY - rect.top
    }

    const onPointerLeave = () => {
      pointerX = OFFSCREEN
      pointerY = OFFSCREEN
    }

    resize()
    refreshColor()
    if (reduced) paint(0, 0)

    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) paint(0, 0)
    })
    ro.observe(host)

    const io = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true
      sync()
    })
    io.observe(host)

    const mo = new MutationObserver(() => {
      refreshColor()
      if (reduced) paint(0, 0)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    document.addEventListener('visibilitychange', sync)
    if (variant === 'interactive' && !reduced) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', onPointerLeave)
    }

    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [variant, cell, gap, intensity])

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn('pointer-events-none overflow-hidden', className)}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      />
    </div>
  )
}
