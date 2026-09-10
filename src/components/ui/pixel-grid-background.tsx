import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type PixelGridVariant = 'interactive' | 'wave' | 'noise'

type PixelGridBackgroundProps = {
  variant?: PixelGridVariant
  cell?: number
  gap?: number
  intensity?: number
  reveal?: boolean
  revealText?: string
  className?: string
}

const BUCKETS = 16
const HOVER_RADIUS = 170
const OFFSCREEN = -1e4
const REVEAL_DURATION = 1.1
const TEXT_STEP = 9
const TEXT_SIZE = 6
const TEXT_OPACITY = 0.88
const TEXT_MAX_DELAY = 0.55
const TEXT_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const mask = 'linear-gradient(to bottom, #000 55%, transparent 100%)'

export function PixelGridBackground({
  variant = 'interactive',
  cell = 10,
  gap = 9,
  intensity = 0.5,
  reveal = false,
  revealText = 'PGuide Dev',
  className,
}: PixelGridBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const revealRef = useRef(0)
  const repaintRef = useRef<() => void>(() => {})

  useEffect(() => {
    revealRef.current = reveal ? 1 : 0
    repaintRef.current()
  }, [reveal])

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
    let phase = revealRef.current
    let time = 0
    let last = 0
    let raf = 0
    let onScreen = true
    let textKey = ''
    let textHomes = new Float32Array(0)
    let textScatter = new Float32Array(0)
    let textDelay = new Float32Array(0)

    const refreshColor = () => {
      const color = window.getComputedStyle(canvas).color
      if (color) fill = color
    }

    const buildText = () => {
      const key = `${Math.ceil(width / TEXT_STEP)}x${Math.ceil(height / TEXT_STEP)}:${revealText}`
      if (key === textKey) return
      textKey = key
      textHomes = new Float32Array(0)
      textScatter = new Float32Array(0)
      textDelay = new Float32Array(0)
      if (!revealText) return

      const cols2 = Math.ceil(width / TEXT_STEP)
      const rows2 = Math.ceil(height / TEXT_STEP)
      const off = document.createElement('canvas')
      off.width = cols2
      off.height = rows2
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (!octx) return

      const fitWidth = (size: number, sample: string) => {
        octx.font = `700 ${size}px ${TEXT_FONT}`
        const measured = octx.measureText(sample).width
        return measured > 0 ? (size * (cols2 * 0.78)) / measured : size
      }

      const words = revealText.split(/\s+/).filter(Boolean)
      let lines = [revealText]
      let fontPx = Math.min(fitWidth(rows2 * 0.9, revealText), rows2 * 0.6)
      if (words.length > 1 && fontPx < rows2 * 0.14) {
        let stacked = (rows2 * 0.72) / words.length
        for (const word of words) stacked = Math.min(stacked, fitWidth(rows2 * 0.9, word))
        if (stacked > fontPx) {
          lines = words
          fontPx = stacked
        }
      }
      fontPx = Math.max(5, fontPx)

      octx.font = `700 ${fontPx}px ${TEXT_FONT}`
      octx.textAlign = 'center'
      octx.textBaseline = 'middle'
      octx.fillStyle = '#fff'
      const lineHeight = fontPx * 1.15
      const firstY = rows2 / 2 - ((lines.length - 1) * lineHeight) / 2
      lines.forEach((line, i) => octx.fillText(line, cols2 / 2, firstY + i * lineHeight))

      const data = octx.getImageData(0, 0, cols2, rows2).data
      const homes: number[] = []
      for (let r = 0; r < rows2; r += 1) {
        for (let c = 0; c < cols2; c += 1) {
          if (data[(r * cols2 + c) * 4 + 3] < 110) continue
          homes.push(c * TEXT_STEP + TEXT_STEP / 2, r * TEXT_STEP + TEXT_STEP / 2)
        }
      }
      const count = homes.length / 2
      if (count === 0) return

      textHomes = new Float32Array(homes)
      textScatter = new Float32Array(count * 2)
      textDelay = new Float32Array(count)
      const centerX = width / 2
      const centerY = height / 2
      const maxDist = Math.max(width, height) * 0.55
      for (let i = 0; i < count; i += 1) {
        const hx = textHomes[i * 2]
        const hy = textHomes[i * 2 + 1]
        const ax = hx - centerX
        const ay = hy - centerY
        const len = Math.sqrt(ax * ax + ay * ay) || 1
        const dist = 100 + Math.random() * maxDist
        textScatter[i * 2] = hx + ((ax / len) + (Math.random() - 0.5) * 0.5) * dist
        textScatter[i * 2 + 1] = hy + ((ay / len) + (Math.random() - 0.5) * 0.5) * dist
        textDelay[i] = Math.random() * 0.25 + 0.3 * (1 - Math.min(1, dist / maxDist))
      }
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
      if (nextCols !== cols || nextRows !== rows) {
        cols = nextCols
        rows = nextRows
        seeds = new Float32Array(cols * rows)
        heat = new Float32Array(cols * rows)
        for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random()
      }
      buildText()
    }

    const paint = (t: number, dt: number) => {
      const target = revealRef.current
      if (reduced) {
        phase = target
      } else if (phase < target) {
        phase = Math.min(target, phase + dt / REVEAL_DURATION)
      } else if (phase > target) {
        phase = Math.max(target, phase - dt / REVEAL_DURATION)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = fill

      const ambientFactor = (1 - Math.min(1, phase * 2.4)) * intensity

      if (variant === 'interactive') {
        const decay = Math.pow(0.02, dt)
        for (let i = 0; i < heat.length; i += 1) heat[i] *= decay
      }

      if (ambientFactor > 0.004) {
        for (const bucket of buckets) bucket.length = 0
        if (variant === 'interactive') {
          smoothX += (pointerX - smoothX) * 0.22
          smoothY += (pointerY - smoothY) * 0.22
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
          ctx.globalAlpha = Math.min(1, (b / BUCKETS) * ambientFactor)
          ctx.beginPath()
          for (let k = 0; k < list.length; k += 4) {
            ctx.rect(list[k], list[k + 1], list[k + 2], list[k + 3])
          }
          ctx.fill()
        }
      }

      if (phase > 0.001 && textDelay.length > 0) {
        const spread = 1 - TEXT_MAX_DELAY
        for (let i = 0; i < textDelay.length; i += 1) {
          const local = Math.min(1, Math.max(0, (phase - textDelay[i]) / spread))
          if (local <= 0) continue
          const eased = 1 - Math.pow(1 - local, 3)
          const hx = textHomes[i * 2]
          const hy = textHomes[i * 2 + 1]
          const x = textScatter[i * 2] + (hx - textScatter[i * 2]) * eased
          const y = textScatter[i * 2 + 1] + (hy - textScatter[i * 2 + 1]) * eased
          const size = TEXT_SIZE * (0.3 + 0.7 * eased)
          const shimmer = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((hx + hy) * 0.02 - t * 2))
          ctx.globalAlpha = TEXT_OPACITY * (local < 1 ? local : shimmer)
          ctx.fillRect(x - size / 2, y - size / 2, size, size)
        }
        ctx.globalAlpha = 1
      }
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

    repaintRef.current = () => paint(time, 0)

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

    let cancelled = false
    document.fonts
      ?.load(`700 32px "JetBrains Mono"`)
      .then(() => {
        if (cancelled) return
        textKey = ''
        buildText()
        repaintRef.current()
      })
      .catch(() => {})

    document.addEventListener('visibilitychange', sync)
    if (variant === 'interactive' && !reduced) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', onPointerLeave)
    }

    start()

    return () => {
      cancelled = true
      stop()
      repaintRef.current = () => {}
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [variant, cell, gap, intensity, revealText])

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
