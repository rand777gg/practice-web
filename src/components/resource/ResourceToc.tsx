import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  ArrowLeftToLine, ArrowRightToLine, Check, ChevronRight, CornerDownRight, GripVertical,
  Link2, ListPlus, ListTree, Minimize2, Pencil, Plus, RotateCcw, Search, Trash2, Unlink, X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TocEntry } from '@/lib/resource-blocks'
import {
  addChild, addRoot, addSibling, hasChildren, moveSubtreeTo, removeEntry, shiftSubtreeLevel,
  subtreeRange, tocFromDraft, updateEntry, type TocDraftEntry,
} from '@/lib/resource-toc'

interface TocNode {
  entry: TocEntry
  children: TocNode[]
}

/** 目录项自己带 level, 用栈还原层级; 没有上级的(文档直接从二级标题开始)就落到根 */
function buildTree(entries: TocEntry[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []
  for (const entry of entries) {
    const node: TocNode = { entry, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) stack.pop()
    if (stack.length > 0) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

function flattenVisible(
  nodes: TocNode[],
  collapsed: Set<number>,
  depth = 0,
): { node: TocNode; depth: number }[] {
  const out: { node: TocNode; depth: number }[] = []
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.children.length > 0 && !collapsed.has(node.entry.key)) {
      out.push(...flattenVisible(node.children, collapsed, depth + 1))
    }
  }
  return out
}

function collectCollapsible(nodes: TocNode[], out: number[] = []): number[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      out.push(node.entry.key)
      collectCollapsible(node.children, out)
    }
  }
  return out
}

/** 目录里显示层级缩进, 但 level 可能从 2 起跳, 归一化后最深缩进 4 级 */
function indentOf(level: number, minLevel: number): number {
  return Math.min(Math.max(level - minLevel, 0), 4)
}

/** 拖动时往右拉多少像素算降一级 —— 和目录每级的缩进像素一致, 手感才对 */
const LEVEL_STEP_PX = 12
/** 量不到行高时的兜底 */
const FALLBACK_ROW_STEP = 22

/** 管理员编辑目录时从外面接进来的那组能力; 不传就是只读目录 */
export interface TocEditorBridge {
  draft: TocDraftEntry[]
  onChange: (next: TocDraftEntry[]) => void
  /** 请求进入"点正文选落点"状态 */
  onPickMapping: (id: number) => void
  /** 映射到已不存在区块的条目 id */
  staleIds: ReadonlySet<number>
  /** 正在等正文点选的条目 id */
  mappingId: number | null
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onResetAuto: () => void
}

interface Props {
  entries: TocEntry[]
  activeBlockIndex: number | null
  onSelect: (entry: TocEntry) => void
  className?: string
  editor?: TocEditorBridge | null
}

interface MenuState {
  x: number
  y: number
  /** 命中的行下标; null = 右键在空白处 */
  index: number | null
}

interface DragState {
  id: number
  from: number
  pointerId: number
  startX: number
  startY: number
}

export function ResourceToc({ entries, activeBlockIndex, onSelect, className, editor }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [levelDelta, setLevelDelta] = useState(0)
  /**
   * 多选。存的是**条目 id 而不是下标** —— 批量删除/升降级都会让下标整体前移,
   * 按下标存的话删到一半就删错行了。
   */
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** shift 连选的锚点(也是 id) */
  const [anchorId, setAnchorId] = useState<number | null>(null)

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const rowEls = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const overRef = useRef<number | null>(null)
  const deltaRef = useRef(0)

  const editing = Boolean(editor)
  const draft = editor?.draft
  // 编辑态渲染的是草稿: 顺序/层级必须和草稿下标一一对应, 否则拖动换算出来的落点会错位
  const list = useMemo(() => (draft ? tocFromDraft(draft) : entries), [draft, entries])

  const tree = useMemo(() => buildTree(list), [list])
  const minLevel = useMemo(
    () => (list.length > 0 ? Math.min(...list.map((e) => e.level)) : 1),
    [list],
  )
  const collapsibleKeys = useMemo(() => new Set(collectCollapsible(tree)), [tree])

  const keyword = query.trim().toLowerCase()
  // 编辑态不给筛选也不给折叠: 渲染顺序必须等于草稿顺序, 否则拖动/右键认的行和实际改的行会错位
  const filtered = useMemo(
    () => (!editing && keyword ? list.filter((e) => e.title.toLowerCase().includes(keyword)) : null),
    [list, keyword, editing],
  )

  // 目录很长时跟着阅读位置自动滚动, 否则看得到正文却找不到目录里对应哪一条
  useEffect(() => {
    if (activeBlockIndex === null || editing) return
    const hit = list.find((e) => e.blockIndex === activeBlockIndex)
    if (hit) itemRefs.current.get(hit.key)?.scrollIntoView({ block: 'nearest' })
  }, [activeBlockIndex, list, editing])

  const allCollapsed = collapsed.size > 0 && collapsed.size >= collapsibleKeys.size

  const toggle = (key: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rows = filtered
    ? filtered.map((entry) => ({ entry, depth: indentOf(entry.level, minLevel) }))
    : flattenVisible(tree, editing ? new Set() : collapsed).map(({ node, depth }) => ({ entry: node.entry, depth }))

  // ── 右键菜单 ──

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const indexOfId = useCallback(
    (id: number) => (draft ? draft.findIndex((e) => e.id === id) : -1),
    [draft],
  )

  const applyEdit = useCallback((next: TocDraftEntry[]) => {
    editor?.onChange(next)
  }, [editor])

  // ── 多选 / 批量操作 ──

  /** 选中的那些条目现在各自在第几行; 用 id 反查, 所以草稿怎么变都不会指错 */
  const selectedIndexes = useMemo(
    () => (draft ? draft.reduce<number[]>((acc, e, i) => (selected.has(e.id) ? [...acc, i] : acc), []) : []),
    [draft, selected],
  )

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchorId(null)
  }, [])

  const toggleSelect = useCallback((id: number, extend: boolean) => {
    if (!draft) return
    const ids = draft.map((e) => e.id)
    const at = ids.indexOf(id)
    if (at < 0) return
    if (extend && anchorId !== null) {
      const from = ids.indexOf(anchorId)
      if (from >= 0) {
        const [lo, hi] = from <= at ? [from, at] : [at, from]
        setSelected(new Set(ids.slice(lo, hi + 1)))
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAnchorId(id)
  }, [draft, anchorId])

  /**
   * 批量删除。**倒序**删: removeEntry 会把后面的行整体前移, 正序删的话第二个下标就错位了。
   * 倒序时先删子条目、后删父条目, 顺序天然是对的。
   */
  const removeSelected = useCallback(() => {
    if (!draft || selectedIndexes.length === 0) return
    let next = draft
    for (const i of [...selectedIndexes].sort((a, b) => b - a)) next = removeEntry(next, i)
    applyEdit(next)
    clearSelection()
  }, [draft, selectedIndexes, applyEdit, clearSelection])

  /** 批量升降级。平移不改顺序, 所以按下标升序做就行 */
  const shiftSelected = useCallback((delta: number) => {
    if (!draft || selectedIndexes.length === 0) return
    let next = draft
    for (const i of selectedIndexes) next = shiftSubtreeLevel(next, i, delta)
    applyEdit(next)
  }, [draft, selectedIndexes, applyEdit])

  // ── 拖动: 与模板题型分区同款(指针捕获 + 让位动画), 多一维左右调层级 ──

  const measureStep = useCallback((): number => {
    const els = rowEls.current.filter(Boolean) as HTMLDivElement[]
    if (els.length >= 2) {
      const d = Math.abs(els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().top)
      if (d > 4) return d
    }
    if (els.length === 1) {
      const h = els[0].getBoundingClientRect().height
      if (h > 4) return h
    }
    return FALLBACK_ROW_STEP
  }, [])

  const beginDrag = (index: number, id: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (dragRef.current) return
    const session: DragState = { id, from: index, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    dragRef.current = session
    overRef.current = index
    deltaRef.current = 0
    setDrag(session)
    setOverIndex(index)
    setLevelDelta(0)
    setMenu(null)
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
  }

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = dragRef.current
    if (!s || !draft || e.pointerId !== s.pointerId) return
    const step = measureStep()
    const { start, end } = subtreeRange(draft, s.from)
    // 落点按根条目算; 拖在自己这棵子树的高度以内都还不算移动(否则会在自己身上反复跳)
    let t = start + Math.round((e.clientY - s.startY) / step)
    t = Math.max(0, Math.min(draft.length, t))
    if (t > start && t < end) t = start
    if (t !== overRef.current) {
      overRef.current = t
      setOverIndex(t)
    }
    const d = Math.round((e.clientX - s.startX) / LEVEL_STEP_PX)
    if (d !== deltaRef.current) {
      deltaRef.current = d
      setLevelDelta(d)
    }
    // 贴近可滚动祖先视口上下缘时自动滚动, 长目录也能拖到边缘
    let sc: HTMLElement | null = scrollRef.current
    while (sc && sc.scrollHeight <= sc.clientHeight + 2) sc = sc.parentElement
    if (!sc) return
    const r = sc.getBoundingClientRect()
    const edge = 48
    if (e.clientY < r.top + edge) sc.scrollTop -= 10
    else if (e.clientY > r.bottom - edge) sc.scrollTop += 10
  }

  const endDrag = () => {
    const s = dragRef.current
    // 无条件先清会话: 走到这里可能是手柄自己的 pointerup, 也可能是窗口兜底那个。
    // 只要有一次没清干净, dragRef 就永远有值, 之后每个 beginDrag 都被挡掉 ——
    // 表现是"拖过一次之后就再也拖不动", 而且全程不报错。
    dragRef.current = null
    document.body.style.userSelect = ''
    const t = overRef.current
    const d = deltaRef.current
    setDrag(null)
    setOverIndex(null)
    setLevelDelta(0)
    overRef.current = null
    deltaRef.current = 0
    if (!s || t === null || !draft) return

    let next = draft
    if (t !== s.from) next = moveSubtreeTo(next, s.from, t)
    if (d !== 0) {
      // 搬完之后按下标找已经不准了, 按 id 找回来 —— 临时 id 也不会重
      const at = next.findIndex((x) => x.id === s.id)
      if (at >= 0) next = shiftSubtreeLevel(next, at, d)
    }
    if (next !== draft) applyEdit(next)
  }

  // 指针在手柄外面抬起(拖出面板、窗口失焦)也要收尾, 否则会话卡住
  useEffect(() => {
    if (!drag) return
    const onUp = () => endDrag()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  })

  // ── 行位移: 源子树跟着落点走, 被让开的行整块反向平移 ──

  const dragRange = useMemo(() => {
    if (!drag || !draft) return null
    return subtreeRange(draft, drag.from)
  }, [drag, draft])

  const transformOf = (i: number): string | undefined => {
    if (!dragRange || overIndex === null) return undefined
    const { start, end } = dragRange
    const step = measureStep()
    const blockH = (end - start) * step
    if (i >= start && i < end) return `translate(${levelDelta * LEVEL_STEP_PX}px, ${(overIndex - start) * step}px)`
    if (overIndex > start && i >= end && i <= overIndex) return `translateY(${-blockH}px)`
    if (overIndex < start && i >= overIndex && i < start) return `translateY(${blockH}px)`
    return undefined
  }

  const committingRef = useRef(false)
  const commitRename = (id: number, title: string) => {
    if (committingRef.current) return
    committingRef.current = true
    const at = indexOfId(id)
    if (at >= 0 && draft && draft[at].title !== title) applyEdit(updateEntry(draft, at, { title }))
    setRenamingId(null)
    // 失焦与 Enter 会连着触发两次, 让这一轮先结束再解锁
    setTimeout(() => { committingRef.current = false }, 0)
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2">
        <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">{editing ? '编辑目录' : '目录'}</span>
        <span className="text-[10px] text-muted-foreground">{list.length} 条</span>
        <span className="flex-1" />
        {editing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]"
              title="清掉人工目录, 回到按解析结果现推"
              disabled={editor?.saving}
              onClick={() => editor?.onResetAuto()}
            >
              <RotateCcw className="h-3 w-3" />自动
            </Button>
            <Button
              variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]"
              disabled={editor?.saving}
              onClick={() => editor?.onDiscard()}
            >
              放弃
            </Button>
            <Button
              size="sm" className="h-6 px-2 text-[11px]"
              disabled={editor?.saving || !editor?.dirty}
              onClick={() => editor?.onSave()}
            >
              保存
            </Button>
          </div>
        ) : filtered ? (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="退出筛选" onClick={() => setQuery('')}>
            <X className="h-3 w-3" />
          </Button>
        ) : (
          collapsibleKeys.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              title={allCollapsed ? '展开全部' : '收起全部'}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys))}
            >
              {allCollapsed ? <ListTree className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </Button>
          )
        )}
      </div>

      {!editing && (
        <div className="shrink-0 px-2.5 py-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选目录标题"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
      )}

      {editing && selectedIndexes.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-primary/5 px-2.5 py-1 text-[11px]">
          <span className="text-muted-foreground">已选 {selectedIndexes.length} 条</span>
          <Button
            variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px]"
            title="选中的条目整体降一级(子树跟着走)"
            onClick={() => shiftSelected(1)}
          >
            <ArrowRightToLine className="h-3 w-3" />降级
          </Button>
          <Button
            variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px]"
            title="选中的条目整体升一级(子树跟着走)"
            onClick={() => shiftSelected(-1)}
          >
            <ArrowLeftToLine className="h-3 w-3" />升级
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-5 gap-1 px-1.5 text-[11px] text-destructive hover:text-destructive"
            title="删除选中的目录项(单项的子条目会上提)"
            onClick={removeSelected}
          >
            <Trash2 className="h-3 w-3" />删除
          </Button>
          <span className="flex-1" />
          <Button
            variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]"
            onClick={() => { setSelected(new Set((draft ?? []).map((e) => e.id))); setAnchorId(null) }}
          >
            全选
          </Button>
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]" onClick={clearSelection}>
            清除
          </Button>
        </div>
      ) : editing ? (
        <p className="shrink-0 px-2.5 py-1 text-[10px] leading-relaxed text-muted-foreground">
          拖拖动柄排序, 左右拉调层级; 右键出行内菜单。勾选左侧方框可多选, 再批量升降级或删除。改动不会动正文。
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto pb-3"
        onContextMenu={(e) => {
          if (!editing) return
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, index: null })
        }}
      >
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {editing ? '还没有目录项, 右键添加一条' : '没有匹配的标题'}
          </p>
        ) : (
          rows.map(({ entry, depth }, i) => {
            const active = entry.blockIndex !== null && entry.blockIndex === activeBlockIndex
            const isStale = editor?.staleIds.has(entry.key) ?? false
            const isMapping = editor?.mappingId === entry.key
            const isDragging = drag?.from === i
            const isRenaming = renamingId === entry.key
            const isSelected = selected.has(entry.key)
            const childCount = editing && draft ? subtreeRange(draft, i).end - i - 1 : 0
            return (
              <div
                key={entry.key}
                ref={(el) => { rowEls.current[i] = el }}
                onContextMenu={(e) => {
                  if (!editing) return
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, index: i })
                }}
                className={cn(
                  'group relative flex items-start gap-1 rounded-sm pr-1.5 transition-transform duration-150 ease-out',
                  active ? 'bg-primary/10' : 'hover:bg-accent/60',
                  isStale && 'bg-amber-50/70 dark:bg-amber-900/15',
                  isMapping && 'ring-1 ring-primary',
                  isDragging && 'z-10 bg-background opacity-90 shadow-lg',
                )}
                style={{
                  paddingLeft: `${(editing ? 2 : 6) + depth * 12}px`,
                  transform: transformOf(i),
                }}
              >
                {editing && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`选择「${entry.title || '无标题'}」`}
                    title="勾选后可批量升降级或删除(Shift 点标题连选一段)"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(entry.key, e.shiftKey) }}
                    className={cn(
                      'mt-1 shrink-0 rounded border p-0.5 transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 text-transparent hover:border-foreground',
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                )}

                {editing && (
                  <span
                    className="mt-1 w-5 shrink-0 text-[9px] tabular-nums text-muted-foreground/70"
                    title={`第 ${entry.level} 级`}
                  >
                    L{entry.level}
                  </span>
                )}

                {editing && (
                  <button
                    type="button"
                    onPointerDown={beginDrag(i, entry.key)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    title="拖动排序(左右拉调层级)"
                    className="mt-1 shrink-0 touch-none cursor-grab rounded p-0.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-3 w-3" />
                  </button>
                )}

                {isRenaming ? (
                  <Input
                    autoFocus
                    defaultValue={entry.title}
                    onBlur={(e) => commitRename(entry.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(entry.key, e.currentTarget.value) }
                      else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null) }
                    }}
                    className="my-0.5 h-6 min-w-0 flex-1 text-[11px]"
                  />
                ) : (
                  <button
                    ref={(el) => {
                      if (el) itemRefs.current.set(entry.key, el)
                      else itemRefs.current.delete(entry.key)
                    }}
                    type="button"
                    onClick={(e) => {
                      // 编辑态下按住修饰键点标题 = 选中(Shift 连选一段), 不按住还是照旧定位过去
                      if (editing && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        toggleSelect(entry.key, e.shiftKey)
                        return
                      }
                      onSelect(entry)
                    }}
                    onDoubleClick={() => { if (editing) { setMenu(null); setRenamingId(entry.key) } }}
                    className="min-w-0 flex-1 py-1 text-left"
                    title={`${entry.title} — 第 ${entry.pageNo} 页${entry.blockIndex === null ? ' (无正文落点)' : ''}`}
                  >
                    <span
                      className={cn(
                        'block truncate text-[11px] leading-snug',
                        active ? 'font-medium text-primary' : 'text-foreground/85',
                        entry.level <= minLevel && 'text-xs font-medium text-foreground',
                        entry.blockIndex === null && 'text-muted-foreground',
                      )}
                    >
                      {entry.title || '(无标题)'}
                    </span>
                  </button>
                )}

                {editing ? (
                  <span className="mt-1 flex shrink-0 items-center gap-0.5">
                    {isStale && (
                      <span className="text-[9px] text-amber-600 dark:text-amber-400" title="映射到了已不存在的段落">
                        失效
                      </span>
                    )}
                    <button
                      type="button"
                      title={entry.blockIndex === null ? '映射到正文段落' : `映射到段 ${entry.blockIndex}, 点击重选`}
                      onClick={(e) => { e.stopPropagation(); editor?.onPickMapping(entry.key) }}
                      className={cn(
                        'rounded px-0.5 text-[9px] tabular-nums hover:bg-accent',
                        isStale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/60',
                        isMapping && 'text-primary',
                      )}
                    >
                      {entry.blockIndex === null ? '无落点' : `P${entry.pageNo}`}
                    </button>
                    {childCount > 0 && (
                      <span className="text-[9px] text-muted-foreground/50" title={`含 ${childCount} 个子条目`}>
                        +{childCount}
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'mt-1 shrink-0 text-[9px] tabular-nums text-muted-foreground/60',
                      active && 'text-primary/70',
                    )}
                  >
                    {entry.pageNo}
                  </span>
                )}

                {!editing && collapsibleKeys.has(entry.key) && (
                  <button
                    type="button"
                    onClick={() => toggle(entry.key)}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                    title={collapsed.has(entry.key) ? '展开' : '收起'}
                  >
                    <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed.has(entry.key) && 'rotate-90')} />
                  </button>
                )}
              </div>
            )
          })
        )}

        {editing && (
          <button
            type="button"
            onClick={() => applyEdit(addRoot(draft ?? []))}
            className="mt-1 flex w-full items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/60"
          >
            <ListPlus className="h-3 w-3" />添加顶级条目
          </button>
        )}
      </div>

      {drag && (
        <div className="shrink-0 border-t px-2.5 py-1 text-[10px] text-muted-foreground">
          落点 {overIndex === null ? '—' : overIndex >= list.length ? '末尾' : `第 ${overIndex + 1} 条`}
          {levelDelta !== 0 && ` · ${levelDelta > 0 ? '降' : '升'} ${Math.abs(levelDelta)} 级`}
        </div>
      )}

      {menu && editing && draft && (
        <ContextMenu
          menu={menu}
          draft={draft}
          indexOfId={indexOfId}
          onClose={() => setMenu(null)}
          onEdit={applyEdit}
          onRename={setRenamingId}
          onPickMapping={(id) => editor?.onPickMapping(id)}
          onResetAuto={() => editor?.onResetAuto()}
        />
      )}
    </div>
  )
}

interface MenuProps {
  menu: MenuState
  draft: TocDraftEntry[]
  indexOfId: (id: number) => number
  onClose: () => void
  onEdit: (next: TocDraftEntry[]) => void
  onRename: (id: number) => void
  onPickMapping: (id: number) => void
  onResetAuto: () => void
}

function ContextMenu({ menu, draft, indexOfId, onClose, onEdit, onRename, onPickMapping, onResetAuto }: MenuProps) {
  const index = menu.index
  const entry = index === null ? null : draft[index]

  const items: { key: string; label: string; icon: ReactNode; run: () => void; danger?: boolean }[] = []

  if (entry) {
    const id = entry.id
    const at = indexOfId(id)
    items.push({ key: 'rename', label: '改名', icon: <Pencil className="h-3.5 w-3.5" />, run: () => onRename(id) })
    items.push({
      key: 'child', label: '添加子级', icon: <CornerDownRight className="h-3.5 w-3.5" />,
      run: () => onEdit(addChild(draft, at)),
    })
    items.push({
      key: 'sibling', label: '添加同级', icon: <Plus className="h-3.5 w-3.5" />,
      run: () => onEdit(addSibling(draft, at)),
    })
    items.push({
      key: 'indent', label: '降一级', icon: <ChevronRight className="h-3.5 w-3.5" />,
      run: () => onEdit(shiftSubtreeLevel(draft, at, 1)),
    })
    items.push({
      key: 'outdent', label: '升一级', icon: <ChevronRight className="h-3.5 w-3.5 -scale-x-100" />,
      run: () => onEdit(shiftSubtreeLevel(draft, at, -1)),
    })
    items.push({
      key: 'map',
      label: entry.blockIndex === null ? '映射到正文段落' : '重选正文落点',
      icon: <Link2 className="h-3.5 w-3.5" />,
      run: () => onPickMapping(id),
    })
    if (entry.blockIndex !== null) {
      items.push({
        key: 'unmap', label: '清除落点(变纯分组项)', icon: <Unlink className="h-3.5 w-3.5" />,
        run: () => onEdit(updateEntry(draft, at, { blockIndex: null })),
      })
    }
    items.push({
      key: 'remove',
      label: hasChildren(draft, at) ? '删除(子条目上提)' : '删除',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      run: () => onEdit(removeEntry(draft, at)),
      danger: true,
    })
  } else {
    items.push({
      key: 'add', label: '添加顶级条目', icon: <ListPlus className="h-3.5 w-3.5" />,
      run: () => onEdit(addRoot(draft)),
    })
    items.push({
      key: 'auto', label: '恢复自动目录', icon: <RotateCcw className="h-3.5 w-3.5" />,
      run: () => onResetAuto(),
    })
  }

  const width = 208
  const height = items.length * 30 + 10
  const left = Math.min(menu.x, Math.max(4, window.innerWidth - width - 8))
  const top = Math.min(menu.y, Math.max(4, window.innerHeight - height - 8))

  return (
    <div
      className="fixed z-50 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-xl"
      style={{ left, top, width }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => { onClose(); it.run() }}
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
}
