import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
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

const MARGIN = 20
const MIN_W = 820
const MAX_W = 1180
const DEFAULT_W = 1040
const STAGE_W = 320
const STAGE_H = 40
const CHILD_H = 30
const CHILD_W_MAX = 264
const CHILD_W_MIN = 188
const CHILD_GAP = 6
/** 阶段胶囊到第一排子节点之间留给连线的竖直空间 */
const FAN_H = 26
const BAND_GAP = 46
/** 竖排「母线」离子节点列内边缘的距离 */
const BUS_OFFSET = 16
const TOP_PAD = 6
const BOTTOM_PAD = 10

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

/** 默认连线与已完成连线: 浅色下走深灰虚线, 深色下提高一档亮度才看得清 */
const LINE = 'text-foreground/30 dark:text-foreground/40'
const LINE_DONE = 'text-emerald-600/45 dark:text-emerald-400/50'
/** 指向当前节点的路径高亮, 其余淡出 */
const LINE_HOT = 'text-primary'
const LINE_MUTED = 'text-foreground/10 dark:text-foreground/15'

function childWidth(width: number) {
  const room = Math.floor((width - MARGIN * 2 - STAGE_W) / 2) - 44
  return Math.max(CHILD_W_MIN, Math.min(CHILD_W_MAX, room))
}

export function RoadmapCanvas({ stages, onSelectStage, onSelectQuestion, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const arrowId = `rm-arrow-${uid}`
  const arrowDoneId = `rm-arrow-done-${uid}`
  const arrowHotId = `rm-arrow-hot-${uid}`
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)
  /** 指针停在哪个节点上: 该节点到主干的路径点亮, 其余淡出 */
  const [hover, setHover] = useState<{ stageId: string; questionId?: string } | null>(null)

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
      const tallest = Math.max(left.length, right.length)
      const bandH = STAGE_H + (tallest > 0 ? FAN_H + tallest * (CHILD_H + CHILD_GAP) - CHILD_GAP : 0)

      rows.push({ stage, index, y: stageY, left, right })
      if (index < stages.length - 1) {
        spine.push({ x: cx, y1: stageY + STAGE_H, y2: stageY + bandH + BAND_GAP })
      }
      y = stageY + bandH + BAND_GAP
    })

    return { rows, spine, height: Math.max(STAGE_H, y - BAND_GAP) + BOTTOM_PAD }
  }, [stages, width, cx, childW])

  const questionCount = stages.reduce((n, s) => n + s.questions.length, 0)

  if (stages.length === 0) {
    return (
      <p className={cn('rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground', className)}>
        还没有阶段，先在编辑页编排阶段与题目。
      </p>
    )
  }

  const busX = (side: 'left' | 'right') =>
    side === 'left' ? MARGIN + childW + BUS_OFFSET : width - MARGIN - childW - BUS_OFFSET

  const busPath = (list: PlacedQuestion[], side: 'left' | 'right', hubY: number) => {
    if (list.length === 0) return null
    const x = busX(side)
    const hubX = side === 'left' ? cx - STAGE_W / 2 : cx + STAGE_W / 2
    const lastY = list[list.length - 1].y + CHILD_H / 2
    return `M ${hubX} ${hubY} H ${x} V ${lastY}`
  }

  const stubPath = (q: PlacedQuestion, side: 'left' | 'right') => {
    const x = busX(side)
    const edge = side === 'left' ? q.x + childW : q.x
    const y = q.y + CHILD_H / 2
    return `M ${x} ${y} H ${edge}`
  }

  const stageHot = (stageId: string) => hover?.stageId === stageId
  const questionHot = (questionId: string) => hover?.questionId === questionId
  const stageFaded = (stageId: string) => hover !== null && !stageHot(stageId)

  const busClass = (done: boolean, stageId: string) =>
    hover ? (stageHot(stageId) ? LINE_HOT : LINE_MUTED) : done ? LINE_DONE : LINE

  const stubClass = (q: PlacedQuestion) => {
    if (!hover) return q.passed ? LINE_DONE : LINE
    if (questionHot(q.id)) return LINE_HOT
    if (stageHot(q.stageId)) return q.passed ? LINE_DONE : LINE
    return LINE_MUTED
  }

  const arrowFor = (q: PlacedQuestion) => {
    if (hover && questionHot(q.id)) return `url(#${arrowHotId})`
    return `url(#${q.passed ? arrowDoneId : arrowId})`
  }

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-7 rounded border-2 border-amber-500/50 bg-amber-100/80 dark:border-amber-400/40 dark:bg-amber-400/10" />
          阶段
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-7 rounded border border-foreground/20 bg-card" />
          题目
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-7 rounded border-2 border-emerald-500/60 bg-emerald-500/10" />
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
            <defs>
              <marker id={arrowId} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0.5,1 L7,4 L0.5,7 Z" className={cn('text-foreground/40', 'dark:text-foreground/50')} fill="currentColor" />
              </marker>
              <marker id={arrowDoneId} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0.5,1 L7,4 L0.5,7 Z" className={cn('text-emerald-600/60', 'dark:text-emerald-400/60')} fill="currentColor" />
              </marker>
              <marker id={arrowHotId} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0.5,1 L7,4 L0.5,7 Z" className="text-primary" fill="currentColor" />
              </marker>
            </defs>

            <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeDasharray="3 4">
              {layout.spine.map((seg, i) => (
                <path
                  key={`spine-${i}`}
                  d={`M ${seg.x} ${seg.y1} L ${seg.x} ${seg.y2}`}
                  markerEnd={`url(#${arrowId})`}
                  className={hover ? LINE_MUTED : LINE}
                />
              ))}

              {layout.rows.map((row) => {
                const hubY = row.y + STAGE_H / 2
                const line = busClass(row.stage.done, row.stage.id)
                const leftBus = busPath(row.left, 'left', hubY)
                const rightBus = busPath(row.right, 'right', hubY)
                return (
                  <Fragment key={`bus-${row.stage.id}`}>
                    {leftBus && <path d={leftBus} className={line} />}
                    {rightBus && <path d={rightBus} className={line} />}
                  </Fragment>
                )
              })}

              {layout.rows.flatMap((row) => [
                ...row.left.map((q) => (
                  <path
                    key={`stub-l-${q.id}`}
                    d={stubPath(q, 'left')}
                    markerEnd={arrowFor(q)}
                    className={stubClass(q)}
                  />
                )),
                ...row.right.map((q) => (
                  <path
                    key={`stub-r-${q.id}`}
                    d={stubPath(q, 'right')}
                    markerEnd={arrowFor(q)}
                    className={stubClass(q)}
                  />
                )),
              ])}
            </g>
          </svg>

          {layout.rows.map((row) => (
            <button
              key={row.stage.id}
              type="button"
              title={row.stage.label}
              onClick={() => onSelectStage?.(row.stage.id)}
              onMouseEnter={() => setHover({ stageId: row.stage.id })}
              onMouseLeave={() => setHover(null)}
              style={{ left: cx - STAGE_W / 2, top: row.y, width: STAGE_W, height: STAGE_H }}
              className={cn(
                'group absolute z-10 flex items-center gap-2 rounded-md border-2 px-2.5 text-left transition-all duration-200',
                'hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                stageFaded(row.stage.id) && 'opacity-45',
                row.stage.done
                  ? 'border-emerald-500/60 bg-emerald-500/10 hover:border-emerald-500'
                  : 'border-amber-500/50 bg-amber-100/80 hover:border-amber-500 dark:border-amber-400/50 dark:bg-amber-400/15',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                  row.stage.done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-400/90 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100',
                )}
              >
                {row.stage.done ? <Check className="h-3 w-3" /> : row.index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{row.stage.label}</span>
              {row.stage.meta && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{row.stage.meta}</span>
              )}
            </button>
          ))}

          {layout.rows.flatMap((row) =>
            [...row.left, ...row.right].map((q) => (
              <button
                key={`${q.stageId}-${q.id}`}
                type="button"
                title={q.label}
                onClick={() => onSelectQuestion?.(q.stageId, q.id)}
                onMouseEnter={() => setHover({ stageId: q.stageId, questionId: q.id })}
                onMouseLeave={() => setHover(null)}
                style={{ left: q.x, top: q.y, width: childW, height: CHILD_H }}
                className={cn(
                  'group absolute z-10 flex items-center gap-1.5 rounded-md border px-2 text-left text-[11px] transition-all duration-200',
                  'hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  stageFaded(q.stageId) && 'opacity-45',
                  q.passed
                    ? 'border-emerald-500/50 bg-emerald-500/[0.07] text-foreground/80 hover:border-emerald-500 dark:bg-emerald-500/10'
                    : 'border-foreground/20 bg-card hover:border-primary/60 dark:border-foreground/25',
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-medium leading-none',
                    q.passed
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-foreground/25 text-muted-foreground',
                  )}
                >
                  {q.passed ? <Check className="h-2.5 w-2.5" /> : q.index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{q.label}</span>
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  )
}
