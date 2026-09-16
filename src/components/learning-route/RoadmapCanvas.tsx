import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RoadmapQuestion {
  id: string
  label: string
  passed: boolean
}

export interface RoadmapStage {
  id: string
  label: string
  /** 阶段副标题, 如「3/8 题」 */
  meta?: string
  done: boolean
  questions: RoadmapQuestion[]
}

interface Props {
  stages: RoadmapStage[]
  onSelectStage?: (stageId: string) => void
  onSelectQuestion?: (stageId: string, questionId: string) => void
  className?: string
}

const MARGIN = 24
const MIN_W = 860
const MAX_W = 1160
const DEFAULT_W = 1040
const STAGE_W = 268
const STAGE_H = 56
const CHILD_H = 36
const CHILD_W_MAX = 300
const CHILD_W_MIN = 208
const CHILD_GAP = 12
/** 阶段胶囊到第一排子节点之间留给连线的竖直空间 */
const FAN_H = 36
const BAND_GAP = 64
const TOP_PAD = 8
const BOTTOM_PAD = 16

interface PlacedQuestion extends RoadmapQuestion {
  stageId: string
  x: number
  y: number
  index: number
}

interface PlacedStage {
  stage: RoadmapStage
  index: number
  y: number
  left: PlacedQuestion[]
  right: PlacedQuestion[]
}

function childWidth(width: number) {
  const room = Math.floor((width - MARGIN * 2 - STAGE_W) / 2) - 40
  return Math.max(CHILD_W_MIN, Math.min(CHILD_W_MAX, room))
}

export function RoadmapCanvas({ stages, onSelectStage, onSelectQuestion, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    setHostW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number') setHostW(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.max(MIN_W, Math.min(MAX_W, hostW || DEFAULT_W))
  const cx = width / 2
  const childW = childWidth(width)

  const layout = useMemo(() => {
    const rows: PlacedStage[] = []
    const links: { from: { x: number; y: number }; to: PlacedQuestion }[] = []
    const spine: { x: number; y1: number; y2: number }[] = []
    let y = TOP_PAD

    stages.forEach((stage, index) => {
      const stageY = y
      const children = stage.questions
      const split = Math.ceil(children.length / 2)
      // 奇偶阶段左右互换, 避免整张图长期偏向一侧
      const head = index % 2 === 0 ? children.slice(0, split) : children.slice(split)
      const tail = index % 2 === 0 ? children.slice(split) : children.slice(0, split)
      const colTop = stageY + STAGE_H + FAN_H

      const place = (list: RoadmapQuestion[], x: number): PlacedQuestion[] =>
        list.map((q, i) => ({ ...q, stageId: stage.id, x, y: colTop + i * (CHILD_H + CHILD_GAP), index: i }))

      const left = place(head, MARGIN)
      const right = place(tail, width - MARGIN - childW)
      const colH = Math.max(left.length, right.length) * (CHILD_H + CHILD_GAP)
      const bandH = STAGE_H + (children.length > 0 ? FAN_H + colH - CHILD_GAP : 0)

      rows.push({ stage, index, y: stageY, left, right })
      for (const q of [...left, ...right]) {
        links.push({ from: { x: q.x < cx ? cx - STAGE_W / 2 : cx + STAGE_W / 2, y: stageY + STAGE_H / 2 }, to: q })
      }
      if (index < stages.length - 1) {
        spine.push({ x: cx, y1: stageY + STAGE_H, y2: stageY + bandH + BAND_GAP })
      }
      y = stageY + bandH + BAND_GAP
    })

    return { rows, links, spine, height: Math.max(STAGE_H, y - BAND_GAP) + BOTTOM_PAD }
  }, [stages, width, cx, childW])

  const questionCount = stages.reduce((n, s) => n + s.questions.length, 0)

  if (stages.length === 0) {
    return (
      <p className={cn('rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground', className)}>
        还没有阶段，先在编辑页编排阶段与题目。
      </p>
    )
  }

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-md border-2 border-amber-400/70 bg-amber-100/70 dark:border-amber-400/40 dark:bg-amber-400/10" />
          阶段
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border border-border bg-card" />
          题目
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border-2 border-emerald-500/60 bg-emerald-500/10" />
          已通过
        </span>
        <span className="ml-auto">
          {stages.length} 个阶段 · {questionCount} 题
        </span>
      </div>

      <div ref={hostRef} className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
        <div className="relative mx-auto" style={{ width, height: layout.height }}>
          <svg
            className="pointer-events-none absolute inset-0"
            width={width}
            height={layout.height}
            viewBox={`0 0 ${width} ${layout.height}`}
            aria-hidden
          >
            <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="4 6">
              {layout.spine.map((seg, i) => (
                <path key={`spine-${i}`} d={`M ${seg.x} ${seg.y1} L ${seg.x} ${seg.y2}`} className="text-muted-foreground/30" />
              ))}
            </g>
            <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="4 6">
              {layout.links.map(({ from, to }) => {
                const toX = to.x < cx ? to.x + childW : to.x
                const toY = to.y + CHILD_H / 2
                const mid = (from.x + toX) / 2
                return (
                  <path
                    key={`${to.stageId}-${to.id}`}
                    d={`M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${toY}, ${toX} ${toY}`}
                    className={to.passed ? 'text-emerald-500/45' : 'text-muted-foreground/30'}
                  />
                )
              })}
            </g>
          </svg>

          {layout.rows.map((row) => (
            <button
              key={row.stage.id}
              type="button"
              title={row.stage.label}
              onClick={() => onSelectStage?.(row.stage.id)}
              style={{ left: cx - STAGE_W / 2, top: row.y, width: STAGE_W, height: STAGE_H }}
              className={cn(
                'group absolute z-10 flex items-center gap-2.5 rounded-xl border-2 px-3 text-left transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                row.stage.done
                  ? 'border-emerald-500/60 bg-emerald-500/10 hover:border-emerald-500'
                  : 'border-amber-400/70 bg-amber-100/70 hover:border-amber-500 dark:border-amber-400/40 dark:bg-amber-400/10',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                  row.stage.done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-400/80 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100',
                )}
              >
                {row.stage.done ? <Check className="h-3.5 w-3.5" /> : row.index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">{row.stage.label}</span>
                {row.stage.meta && (
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">{row.stage.meta}</span>
                )}
              </span>
            </button>
          ))}

          {[...layout.rows.flatMap((row) => row.left), ...layout.rows.flatMap((row) => row.right)].map((q) => (
            <button
              key={`${q.stageId}-${q.id}`}
              type="button"
              title={q.label}
              onClick={() => onSelectQuestion?.(q.stageId, q.id)}
              style={{ left: q.x, top: q.y, width: childW, height: CHILD_H }}
              className={cn(
                'group absolute z-10 flex items-center gap-2 rounded-lg border px-2.5 text-left text-xs transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                q.passed
                  ? 'border-emerald-500/50 bg-emerald-500/[0.07] hover:border-emerald-500'
                  : 'border-border bg-card hover:border-primary/50',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-medium leading-none',
                  q.passed
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-muted-foreground/40 text-muted-foreground',
                )}
              >
                {q.passed ? <Check className="h-3 w-3" /> : q.index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{q.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
