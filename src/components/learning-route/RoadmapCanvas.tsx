import {
  Fragment, useCallback, useEffect, useId, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import {
  ArrowDown, ArrowUp, Check, Ellipsis, Eraser, LayoutGrid, Palette, Pencil, Plus, Repeat, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RouteNodeStyle } from '@/types/learning-routes'

export interface RoadmapQuestion {
  id: string
  label: string
  passed: boolean
  style?: RouteNodeStyle
}

export interface RoadmapStage {
  id: string
  label: string
  /** 阶段副标题, 如「3/8 题」 */
  meta?: string
  done: boolean
  style?: RouteNodeStyle
  questions: RoadmapQuestion[]
}

export interface RoadmapNodeTarget {
  stageId: string
  questionId?: string
}

/** 编辑模式下的意图回调; 不传 editor 即只读浏览 */
export interface RoadmapEditor {
  onAddStage: (pos: { x: number; y: number }) => void
  onEditStageContent: (stageId: string) => void
  onAddQuestion: (stageId: string) => void
  onRemoveStage: (stageId: string) => void
  onMoveStage: (stageId: string, dir: -1 | 1) => void
  onRemoveQuestion: (stageId: string, questionId: string) => void
  onReplaceQuestion: (stageId: string, questionId: string) => void
  onMoveQuestion: (stageId: string, questionId: string, dir: -1 | 1) => void
  onPatchStyle: (target: RoadmapNodeTarget, patch: RouteNodeStyle) => void
  /** pos 为 null 表示清除手动坐标, 交回自动布局 */
  onMoveNode: (target: RoadmapNodeTarget, pos: { x: number; y: number } | null) => void
  onResetLayout: () => void
}

interface Props {
  stages: RoadmapStage[]
  onSelectStage?: (stageId: string) => void
  onSelectQuestion?: (stageId: string, questionId: string) => void
  editor?: RoadmapEditor
  className?: string
}

const MARGIN = 20
const MIN_W = 820
const MAX_W = 1180
const DEFAULT_W = 1040
/** 手动坐标按这个基准宽度存储, 换宽度时按比例还原 */
const CANON_W = 1180
const STAGE_W = 320
const STAGE_H = 40
const CHILD_H = 30
const CHILD_W_MAX = 264
const CHILD_W_MIN = 188
const CHILD_GAP = 6
const FAN_H = 26
const BAND_GAP = 46
const BUS_OFFSET = 16
const TOP_PAD = 6
const BOTTOM_PAD = 10
const SIZE_FACTOR = { sm: 0.86, md: 1, lg: 1.18 } as const

const LINE = 'text-foreground/30 dark:text-foreground/40'
const LINE_DONE = 'text-emerald-600/45 dark:text-emerald-400/50'
const LINE_HOT = 'text-primary'
const LINE_MUTED = 'text-foreground/10 dark:text-foreground/15'

const ACCENT = ['amber', 'emerald', 'sky', 'violet', 'rose', 'slate'] as const
type Accent = (typeof ACCENT)[number]

const ACCENT_HUB: Record<Accent, string> = {
  amber: 'border-amber-500/50 bg-amber-100/80 dark:border-amber-400/50 dark:bg-amber-400/15',
  emerald: 'border-emerald-500/60 bg-emerald-500/10 dark:border-emerald-400/50 dark:bg-emerald-400/15',
  sky: 'border-sky-500/50 bg-sky-500/10 dark:border-sky-400/45 dark:bg-sky-400/15',
  violet: 'border-violet-500/50 bg-violet-500/10 dark:border-violet-400/45 dark:bg-violet-400/15',
  rose: 'border-rose-500/50 bg-rose-500/10 dark:border-rose-400/45 dark:bg-rose-400/15',
  slate: 'border-slate-500/50 bg-slate-500/10 dark:border-slate-400/40 dark:bg-slate-400/10',
}

const ACCENT_CHILD: Record<Accent, string> = {
  amber: 'border-amber-500/45 bg-amber-100/70 dark:border-amber-400/40 dark:bg-amber-400/10',
  emerald: 'border-emerald-500/50 bg-emerald-500/[0.07] dark:border-emerald-400/45 dark:bg-emerald-400/10',
  sky: 'border-sky-500/45 bg-sky-500/[0.07] dark:border-sky-400/40 dark:bg-sky-400/10',
  violet: 'border-violet-500/45 bg-violet-500/[0.07] dark:border-violet-400/40 dark:bg-violet-400/10',
  rose: 'border-rose-500/45 bg-rose-500/[0.07] dark:border-rose-400/40 dark:bg-rose-400/10',
  slate: 'border-slate-500/45 bg-slate-500/[0.07] dark:border-slate-400/40 dark:bg-slate-400/10',
}

const SWATCH: Record<Accent, string> = {
  amber: 'bg-amber-300',
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-400',
  slate: 'bg-slate-400',
}

const ACCENT_LABEL: Record<Accent, string> = {
  amber: '琥珀', emerald: '翠绿', sky: '天蓝', violet: '紫罗兰', rose: '玫红', slate: '石板',
}

interface PlacedQuestion extends RoadmapQuestion {
  stageId: string
  index: number
  w: number
  h: number
  x: number
  y: number
  manual: boolean
}

interface PlacedStage {
  stage: RoadmapStage
  index: number
  w: number
  h: number
  x: number
  y: number
  manual: boolean
  left: PlacedQuestion[]
  right: PlacedQuestion[]
}

interface DragState {
  target: RoadmapNodeTarget
  originX: number
  originY: number
  dx: number
  dy: number
  moved: boolean
}

type MenuState = { x: number; y: number; target?: RoadmapNodeTarget }

const ZERO = { dx: 0, dy: 0 }

function sizeOf(style: RouteNodeStyle | undefined) {
  return style?.size ?? 'md'
}

function childWidth(width: number) {
  const room = Math.floor((width - MARGIN * 2 - STAGE_W) / 2) - 44
  return Math.max(CHILD_W_MIN, Math.min(CHILD_W_MAX, room))
}

/** 手动坐标按基准宽度等比换算, 换容器宽度时节点保持相对位置 */
function denormalizeX(x: number, width: number) {
  return (x * width) / CANON_W
}

function normalizeX(x: number, width: number) {
  return Math.round((x * CANON_W) / width)
}

/** 两个矩形之间按主轴走一条 S 形虚线 */
function curveBetween(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const from = { x: dx >= 0 ? a.x + a.w : a.x, y: ac.y }
    const to = { x: dx >= 0 ? b.x : b.x + b.w, y: bc.y }
    const mid = (from.x + to.x) / 2
    return `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`
  }
  const from = { x: ac.x, y: dy >= 0 ? a.y + a.h : a.y }
  const to = { x: bc.x, y: dy >= 0 ? b.y : b.y + b.h }
  const mid = (from.y + to.y) / 2
  return `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}`
}

export function RoadmapCanvas({ stages, onSelectStage, onSelectQuestion, editor, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const arrowId = `rm-arrow-${uid}`
  const arrowDoneId = `rm-arrow-done-${uid}`
  const arrowHotId = `rm-arrow-hot-${uid}`
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)
  /** 指针停在哪个节点上: 该节点到主干的路径点亮, 其余淡出 */
  const [hover, setHover] = useState<RoadmapNodeTarget | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [styleFor, setStyleFor] = useState<RoadmapNodeTarget | null>(null)

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
  const baseChildW = childWidth(width)

  const layout = useMemo(() => {
    const rows: PlacedStage[] = []
    let y = TOP_PAD

    stages.forEach((stage, index) => {
      const stageY = y
      const stageFactor = SIZE_FACTOR[sizeOf(stage.style)]
      const hubW = STAGE_W * stageFactor
      const hubH = Math.round(STAGE_H * stageFactor)
      const children = stage.questions
      const childFactor = (q: RoadmapQuestion) => SIZE_FACTOR[sizeOf(q.style)]

      const placed: PlacedQuestion[] = children.map((q) => ({
        ...q,
        stageId: stage.id,
        index: 0,
        w: baseChildW * childFactor(q),
        h: Math.round(CHILD_H * childFactor(q)),
        x: 0,
        y: 0,
        manual: q.style?.x !== undefined && q.style?.y !== undefined,
      }))

      // 先按内容排自动位置, 再让有手动坐标的节点覆盖过去
      const split = Math.ceil(placed.length / 2)
      const head = index % 2 === 0 ? placed.slice(0, split) : placed.slice(split)
      const tail = index % 2 === 0 ? placed.slice(split) : placed.slice(0, split)
      const colTop = stageY + hubH + FAN_H

      const stack = (list: PlacedQuestion[], side: 'left' | 'right') => {
        let cy = colTop
        list.forEach((q, i) => {
          q.index = i
          q.x = side === 'left' ? MARGIN : width - MARGIN - q.w
          q.y = cy
          cy += q.h + CHILD_GAP
        })
        return list.length === 0 ? 0 : cy - CHILD_GAP - colTop
      }
      const leftH = stack(head, 'left')
      const rightH = stack(tail, 'right')

      for (const q of placed) {
        const sx = q.style?.x
        const sy = q.style?.y
        if (sx !== undefined && sy !== undefined) {
          q.x = denormalizeX(sx, width)
          q.y = sy
        }
      }

      const hubManual = stage.style?.x !== undefined && stage.style?.y !== undefined
      const hubX = hubManual ? denormalizeX(stage.style!.x as number, width) : cx - hubW / 2
      const hubY = hubManual ? (stage.style!.y as number) : stageY

      const bandH = hubH + (placed.length > 0 ? FAN_H + Math.max(leftH, rightH) : 0)

      rows.push({
        stage,
        index,
        w: hubW,
        h: hubH,
        x: hubX,
        y: hubY,
        manual: hubManual,
        left: head,
        right: tail,
      })

      y = stageY + bandH + BAND_GAP
    })

    const manualBottom = rows.reduce((max, row) => {
      const kids = [...row.left, ...row.right]
      const bottom = kids.reduce((m, q) => Math.max(m, q.y + q.h), row.y + row.h)
      return Math.max(max, bottom)
    }, 0)

    return {
      rows,
      height: Math.max(STAGE_H, y - BAND_GAP, manualBottom) + BOTTOM_PAD,
    }
  }, [stages, width, cx, baseChildW])

  const questionCount = stages.reduce((n, s) => n + s.questions.length, 0)

  const sameTarget = (a: RoadmapNodeTarget | null, b: RoadmapNodeTarget) =>
    !!a && a.stageId === b.stageId && (a.questionId ?? '') === (b.questionId ?? '')

  /** 拖动偏移: 拖阶段胶囊时整簇跟随 */
  const offsetOf = (stageId: string, questionId?: string) => {
    if (!drag) return ZERO
    if (questionId === undefined) return sameTarget(drag.target, { stageId }) ? { dx: drag.dx, dy: drag.dy } : ZERO
    if (drag.target.questionId === undefined) return drag.target.stageId === stageId ? { dx: drag.dx, dy: drag.dy } : ZERO
    return sameTarget(drag.target, { stageId, questionId }) ? { dx: drag.dx, dy: drag.dy } : ZERO
  }

  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const startDrag = (e: ReactPointerEvent, target: RoadmapNodeTarget) => {
    if (!editor || e.button !== 0) return
    setMenu(null)
    setStyleFor(null)
    const point = toCanvas(e)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ target, originX: point.x, originY: point.y, dx: 0, dy: 0, moved: false })
  }

  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const point = toCanvas(e)
    const dx = point.x - drag.originX
    const dy = point.y - drag.originY
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    setDrag({ ...drag, dx, dy, moved: true })
  }

  const endDrag = (e: ReactPointerEvent) => {
    if (!drag || !editor) { setDrag(null); return }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (!drag.moved) { setDrag(null); return }
    const row = layout.rows.find((r) => r.stage.id === drag.target.stageId)
    if (row) {
      // 拖出画布会造成裁切后找不回来, 落点一律夹在画布内
      const commit = (node: { x: number; y: number; w: number; h: number }, target: RoadmapNodeTarget) => {
        editor.onMoveNode(target, {
          x: normalizeX(Math.min(Math.max(node.x + drag.dx, 0), width - node.w), width),
          y: Math.round(Math.min(Math.max(node.y + drag.dy, 0), Math.max(0, layout.height - node.h))),
        })
      }
      if (drag.target.questionId) {
        const q = [...row.left, ...row.right].find((x) => x.id === drag.target.questionId)
        if (q) commit(q, { stageId: row.stage.id, questionId: q.id })
      } else {
        commit(row, { stageId: row.stage.id })
        for (const q of [...row.left, ...row.right]) {
          commit(q, { stageId: row.stage.id, questionId: q.id })
        }
      }
    }
    setDrag(null)
  }

  useEffect(() => {
    if (!menu && !styleFor) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('[data-roadmap-popup]')) return
      setMenu(null)
      setStyleFor(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setStyleFor(null); setDrag(null) }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu, styleFor])

  if (stages.length === 0) {
    return (
      <div
        className={cn('rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground', className)}
        onContextMenu={editor ? (e) => { e.preventDefault(); editor.onAddStage({ x: normalizeX(width / 2, width), y: TOP_PAD }) } : undefined}
      >
        {editor ? '还没有阶段，右击这里加第一个阶段。' : '还没有阶段，先在编辑页编排阶段与题目。'}
      </div>
    )
  }

  const hubGeom = (row: PlacedStage) => {
    const off = offsetOf(row.stage.id)
    return { x: row.x + off.dx, y: row.y + off.dy, w: row.w, h: row.h }
  }
  const childGeom = (q: PlacedQuestion) => {
    const off = offsetOf(q.stageId, q.id)
    return { x: q.x + off.dx, y: q.y + off.dy, w: q.w, h: q.h }
  }
  const isManual = (node: { manual: boolean }) => node.manual

  const busX = (side: 'left' | 'right', kids: PlacedQuestion[], geomOf: (q: PlacedQuestion) => { x: number; w: number }) => {
    if (side === 'left') return Math.max(...kids.map((q) => geomOf(q).x + geomOf(q).w)) + BUS_OFFSET
    return Math.min(...kids.map((q) => geomOf(q).x)) - BUS_OFFSET
  }

  const busPath = (list: PlacedQuestion[], side: 'left' | 'right', hub: { x: number; y: number; w: number; h: number }) => {
    if (list.length === 0) return null
    const bus = busX(side, list, childGeom)
    const hubEdge = side === 'left' ? hub.x : hub.x + hub.w
    const hubY = hub.y + hub.h / 2
    const ys = list.map((q) => childGeom(q).y + childGeom(q).h / 2)
    const top = Math.min(hubY, ...ys)
    const bottom = Math.max(hubY, ...ys)
    return `M ${hubEdge} ${hubY} H ${bus} M ${bus} ${top} V ${bottom}`
  }

  const stubPath = (q: PlacedQuestion, side: 'left' | 'right') => {
    const geom = childGeom(q)
    const bus = busX(side, [q], childGeom)
    const edge = side === 'left' ? geom.x + geom.w : geom.x
    const y = geom.y + geom.h / 2
    return `M ${bus} ${y} H ${edge}`
  }

  const isStageHovered = (stageId: string) => hover?.stageId === stageId
  const isNodeHovered = (stageId: string, questionId: string) =>
    hover?.stageId === stageId && hover.questionId === questionId
  const isFaded = (stageId: string) => hover !== null && !isStageHovered(stageId)

  const busClass = (done: boolean, stageId: string) =>
    hover ? (isStageHovered(stageId) ? LINE_HOT : LINE_MUTED) : done ? LINE_DONE : LINE

  const stubClass = (q: PlacedQuestion) => {
    if (!hover) return q.passed ? LINE_DONE : LINE
    if (isNodeHovered(q.stageId, q.id)) return LINE_HOT
    if (isStageHovered(q.stageId)) return q.passed ? LINE_DONE : LINE
    return LINE_MUTED
  }

  const arrowFor = (q: PlacedQuestion) =>
    hover && isNodeHovered(q.stageId, q.id) ? `url(#${arrowHotId})` : `url(#${q.passed ? arrowDoneId : arrowId})`

  const patchStyle = (target: RoadmapNodeTarget, patch: RouteNodeStyle) => {
    editor?.onPatchStyle(target, patch)
  }

  const stylePanel = (() => {
    if (!styleFor) return null
    const row = layout.rows.find((r) => r.stage.id === styleFor.stageId)
    if (!row) return null
    const q = styleFor.questionId
      ? [...row.left, ...row.right].find((x) => x.id === styleFor.questionId)
      : undefined
    const geom = q ? childGeom(q) : hubGeom(row)
    const current: RouteNodeStyle = (q ?? row.stage).style ?? {}
    const manual = current.x !== undefined && current.y !== undefined
    const left = Math.min(Math.max(geom.x + geom.w - 40, 4), Math.max(4, width - 268))
    const top = Math.min(geom.y + geom.h + 8, Math.max(4, layout.height - 190))
    return (
      <div
        data-roadmap-popup
        className="absolute z-40 w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
        style={{ left, top }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold">节点样式</span>
          <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setStyleFor(null)}>
            关闭
          </button>
        </div>

        <div className="mb-1.5 text-[11px] text-muted-foreground">配色</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            title="默认"
            onClick={() => patchStyle(styleFor, { accent: undefined })}
            className={cn(
              'h-6 w-6 rounded-full border bg-card',
              current.accent ? 'border-border' : 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-popover',
            )}
          />
          {ACCENT.map((a) => (
            <button
              key={a}
              type="button"
              title={ACCENT_LABEL[a]}
              onClick={() => patchStyle(styleFor, { accent: a })}
              className={cn(
                'h-6 w-6 rounded-full border border-black/10',
                SWATCH[a],
                current.accent === a && 'ring-2 ring-ring ring-offset-1 ring-offset-popover',
              )}
            />
          ))}
        </div>

        <div className="mb-1.5 text-[11px] text-muted-foreground">尺寸</div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {(['sm', 'md', 'lg'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => patchStyle(styleFor, { size: s })}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition-colors',
                sizeOf(current) === s ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-accent',
              )}
            >
              {s === 'sm' ? '小' : s === 'md' ? '中' : '大'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => patchStyle(styleFor, { emphasis: !current.emphasis })}
          className={cn(
            'mb-3 w-full rounded-md border px-2 py-1 text-[11px] transition-colors',
            current.emphasis ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-accent',
          )}
        >
          {current.emphasis ? '已强调（加粗边框）' : '强调这个节点'}
        </button>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!manual}
            onClick={() => editor?.onMoveNode(styleFor, null)}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            回到自动布局
          </button>
          <button
            type="button"
            onClick={() => patchStyle(styleFor, { accent: undefined, size: undefined, emphasis: undefined })}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            恢复默认样式
          </button>
        </div>
      </div>
    )
  })()

  const menuItems = (() => {
    if (!menu) return null
    const items: { key: string; label: string; icon: ReactNode; run: () => void; danger?: boolean }[] = []
    const target = menu.target

    if (!target) {
      items.push({
        key: 'add',
        label: '在这里加阶段',
        icon: <Plus className="h-3.5 w-3.5" />,
        run: () => editor?.onAddStage({ x: normalizeX(menu.x, width), y: Math.round(menu.y) }),
      })
      items.push({
        key: 'reset',
        label: '整理布局',
        icon: <LayoutGrid className="h-3.5 w-3.5" />,
        run: () => editor?.onResetLayout(),
      })
    } else if (target.questionId) {
      const row = layout.rows.find((r) => r.stage.id === target.stageId)
      const q = [...(row?.left ?? []), ...(row?.right ?? [])].find((x) => x.id === target.questionId)
      items.push({ key: 'replace', label: '换一道题', icon: <Repeat className="h-3.5 w-3.5" />, run: () => editor?.onReplaceQuestion(target.stageId, target.questionId as string) })
      items.push({ key: 'style', label: '样式…', icon: <Palette className="h-3.5 w-3.5" />, run: () => setStyleFor(target) })
      items.push({ key: 'up', label: '上移', icon: <ArrowUp className="h-3.5 w-3.5" />, run: () => editor?.onMoveQuestion(target.stageId, target.questionId as string, -1) })
      items.push({ key: 'down', label: '下移', icon: <ArrowDown className="h-3.5 w-3.5" />, run: () => editor?.onMoveQuestion(target.stageId, target.questionId as string, 1) })
      if (q?.manual) {
        items.push({ key: 'unpin', label: '回到自动布局', icon: <Eraser className="h-3.5 w-3.5" />, run: () => editor?.onMoveNode(target, null) })
      }
      items.push({ key: 'remove', label: '移出本阶段', icon: <Trash2 className="h-3.5 w-3.5" />, run: () => editor?.onRemoveQuestion(target.stageId, target.questionId as string), danger: true })
    } else {
      const row = layout.rows.find((r) => r.stage.id === target.stageId)
      items.push({ key: 'edit', label: '编辑标题与简介', icon: <Pencil className="h-3.5 w-3.5" />, run: () => editor?.onEditStageContent(target.stageId) })
      items.push({ key: 'addq', label: '添加题目', icon: <Plus className="h-3.5 w-3.5" />, run: () => editor?.onAddQuestion(target.stageId) })
      items.push({ key: 'style', label: '样式…', icon: <Palette className="h-3.5 w-3.5" />, run: () => setStyleFor(target) })
      items.push({ key: 'up', label: '上移阶段', icon: <ArrowUp className="h-3.5 w-3.5" />, run: () => editor?.onMoveStage(target.stageId, -1) })
      items.push({ key: 'down', label: '下移阶段', icon: <ArrowDown className="h-3.5 w-3.5" />, run: () => editor?.onMoveStage(target.stageId, 1) })
      if (row?.manual) {
        items.push({ key: 'unpin', label: '回到自动布局', icon: <Eraser className="h-3.5 w-3.5" />, run: () => editor?.onMoveNode(target, null) })
      }
      items.push({ key: 'remove', label: '删除阶段', icon: <Trash2 className="h-3.5 w-3.5" />, run: () => editor?.onRemoveStage(target.stageId), danger: true })
    }

    const left = Math.min(menu.x, Math.max(4, width - 190))
    const top = Math.min(menu.y, Math.max(4, layout.height - items.length * 30 - 16))
    return (
      <div
        data-roadmap-popup
        className="absolute z-40 w-44 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-xl"
        style={{ left, top }}
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => { setMenu(null); it.run() }}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              it.danger && 'text-destructive hover:bg-destructive/10',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>
    )
  })()

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
        {editor && (
          <span className="ml-auto text-[11px]">
            右击空白处加阶段 · 右击节点改内容/样式 · 拖动节点摆位置
          </span>
        )}
        {!editor && (
          <span className="ml-auto">
            {stages.length} 个阶段 · {questionCount} 题
          </span>
        )}
      </div>

      <div ref={hostRef} className="overflow-x-auto rounded-xl border bg-muted/20 p-2">
        <div
          ref={canvasRef}
          className="relative mx-auto"
          style={{ width, height: layout.height }}
          onContextMenu={(e) => {
            if (!editor) return
            e.preventDefault()
            const p = toCanvas(e)
            setStyleFor(null)
            setMenu({ x: p.x, y: p.y })
          }}
        >
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
              {layout.rows.map((row, i) => {
                const next = layout.rows[i + 1]
                if (!next) return null
                const hub = hubGeom(row)
                const nextHub = hubGeom(next)
                if (row.manual || next.manual) {
                  return (
                    <path
                      key={`spine-${row.stage.id}`}
                      d={curveBetween(hub, nextHub)}
                      markerEnd={`url(#${arrowId})`}
                      className={hover ? LINE_MUTED : LINE}
                    />
                  )
                }
                return (
                  <path
                    key={`spine-${row.stage.id}`}
                    d={`M ${hub.x + hub.w / 2} ${hub.y + hub.h} L ${nextHub.x + nextHub.w / 2} ${nextHub.y}`}
                    markerEnd={`url(#${arrowId})`}
                    className={hover ? LINE_MUTED : LINE}
                  />
                )
              })}

              {layout.rows.map((row) => {
                const hub = hubGeom(row)
                const kids = [...row.left, ...row.right]
                const free = isManual(row) || kids.some(isManual)
                const line = busClass(row.stage.done, row.stage.id)
                if (free) {
                  return (
                    <Fragment key={`free-${row.stage.id}`}>
                      {kids.map((q) => (
                        <path
                          key={`free-${q.id}`}
                          d={curveBetween(hub, childGeom(q))}
                          markerEnd={arrowFor(q)}
                          className={stubClass(q)}
                        />
                      ))}
                    </Fragment>
                  )
                }
                const leftBus = busPath(row.left, 'left', hub)
                const rightBus = busPath(row.right, 'right', hub)
                return (
                  <Fragment key={`bus-${row.stage.id}`}>
                    {leftBus && <path d={leftBus} className={line} />}
                    {rightBus && <path d={rightBus} className={line} />}
                  </Fragment>
                )
              })}

              {layout.rows.flatMap((row) => {
                const kids = [...row.left, ...row.right]
                if (isManual(row) || kids.some(isManual)) return []
                return [
                  ...row.left.map((q) => (
                    <path key={`stub-l-${q.id}`} d={stubPath(q, 'left')} markerEnd={arrowFor(q)} className={stubClass(q)} />
                  )),
                  ...row.right.map((q) => (
                    <path key={`stub-r-${q.id}`} d={stubPath(q, 'right')} markerEnd={arrowFor(q)} className={stubClass(q)} />
                  )),
                ]
              })}
            </g>
          </svg>

          {layout.rows.map((row) => {
            const geom = hubGeom(row)
            const accent = row.stage.style?.accent
            const emphasis = !!row.stage.style?.emphasis
            const size = sizeOf(row.stage.style)
            return (
              <button
                key={row.stage.id}
                type="button"
                title={row.stage.label}
                onClick={() => { if (!editor) onSelectStage?.(row.stage.id) }}
                onContextMenu={(e) => {
                  if (!editor) return
                  e.preventDefault()
                  e.stopPropagation()
                  const p = toCanvas(e)
                  setStyleFor(null)
                  setMenu({ x: p.x, y: p.y, target: { stageId: row.stage.id } })
                }}
                onPointerDown={(e) => startDrag(e, { stageId: row.stage.id })}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                onMouseEnter={() => setHover({ stageId: row.stage.id })}
                onMouseLeave={() => { if (!drag) setHover(null) }}
                style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h }}
                className={cn(
                  'group absolute z-10 flex items-center gap-2 rounded-md border-2 px-2.5 text-left transition-shadow duration-150',
                  editor ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
                  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  drag?.target.stageId === row.stage.id && drag.target.questionId === undefined && drag.moved && 'shadow-lg',
                  isFaded(row.stage.id) && 'opacity-45',
                  accent
                    ? ACCENT_HUB[accent]
                    : row.stage.done
                      ? 'border-emerald-500/60 bg-emerald-500/10 hover:border-emerald-500'
                      : 'border-amber-500/50 bg-amber-100/80 hover:border-amber-500 dark:border-amber-400/50 dark:bg-amber-400/15',
                  emphasis && 'border-[3px] font-bold',
                )}
              >
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded font-bold',
                    size === 'sm' ? 'h-4 w-4 text-[9px]' : size === 'lg' ? 'h-6 w-6 text-[11px]' : 'h-5 w-5 text-[10px]',
                    accent || row.stage.done
                      ? 'bg-foreground/85 text-background'
                      : 'bg-amber-400/90 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100',
                  )}
                >
                  {row.stage.done ? <Check className="h-3 w-3" /> : row.index + 1}
                </span>
                <span className={cn('min-w-0 flex-1 truncate font-semibold', size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-[13px]' : 'text-xs')}>
                  {row.stage.label}
                </span>
                {row.stage.meta && size !== 'sm' && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{row.stage.meta}</span>
                )}
                {editor && (
                  <span
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation()
                      const p = toCanvas(e)
                      setStyleFor(null)
                      setMenu({ x: p.x, y: p.y, target: { stageId: row.stage.id } })
                    }}
                    className="absolute -right-1 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow group-hover:flex hover:text-foreground"
                  >
                    <Ellipsis className="h-3 w-3" />
                  </span>
                )}
              </button>
            )
          })}

          {layout.rows.map((row) => (
            <Fragment key={`kids-${row.stage.id}`}>
              {[...row.left, ...row.right].map((q) => {
              const geom = childGeom(q)
              const accent = q.style?.accent
              const emphasis = !!q.style?.emphasis
              const size = sizeOf(q.style)
              return (
                <button
                  key={`${q.stageId}-${q.id}`}
                  type="button"
                  title={q.label}
                  onClick={() => { if (!editor) onSelectQuestion?.(q.stageId, q.id) }}
                  onContextMenu={(e) => {
                    if (!editor) return
                    e.preventDefault()
                    e.stopPropagation()
                    const p = toCanvas(e)
                    setStyleFor(null)
                    setMenu({ x: p.x, y: p.y, target: { stageId: q.stageId, questionId: q.id } })
                  }}
                  onPointerDown={(e) => startDrag(e, { stageId: q.stageId, questionId: q.id })}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  onMouseEnter={() => setHover({ stageId: q.stageId, questionId: q.id })}
                  onMouseLeave={() => { if (!drag) setHover(null) }}
                  style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h }}
                  className={cn(
                    'group absolute z-10 flex items-center gap-1.5 rounded-md border px-2 text-left transition-shadow duration-150',
                    size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xs' : 'text-[11px]',
                    editor ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
                    'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    drag?.target.questionId === q.id && drag.moved && 'shadow-lg',
                    isFaded(q.stageId) && 'opacity-45',
                    accent
                      ? ACCENT_CHILD[accent]
                      : q.passed
                        ? 'border-emerald-500/50 bg-emerald-500/[0.07] text-foreground/80 hover:border-emerald-500 dark:bg-emerald-500/10'
                        : 'border-foreground/20 bg-card hover:border-primary/60 dark:border-foreground/25',
                    emphasis && 'border-2 font-semibold',
                  )}
                >
                  <span
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded-full border text-[8px] font-medium leading-none',
                      size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5',
                      accent
                        ? 'border-foreground/40 text-foreground/70'
                        : q.passed
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-foreground/25 text-muted-foreground',
                    )}
                  >
                    {q.passed ? <Check className="h-2.5 w-2.5" /> : q.index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{q.label}</span>
                </button>
                )
              })}
            </Fragment>
          ))}

          {menuItems}
          {stylePanel}
        </div>
      </div>
    </div>
  )
}
