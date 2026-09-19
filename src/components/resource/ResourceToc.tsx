import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ListTree, Minimize2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TocEntry } from '@/lib/resource-blocks'

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
    if (node.children.length > 0 && !collapsed.has(node.entry.blockIndex)) {
      out.push(...flattenVisible(node.children, collapsed, depth + 1))
    }
  }
  return out
}

function collectCollapsible(nodes: TocNode[], out: number[] = []): number[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      out.push(node.entry.blockIndex)
      collectCollapsible(node.children, out)
    }
  }
  return out
}

/** 目录里显示层级缩进, 但 level 可能从 2 起跳, 归一化后最深缩进 4 级 */
function indentOf(level: number, minLevel: number): number {
  return Math.min(Math.max(level - minLevel, 0), 4)
}

interface Props {
  entries: TocEntry[]
  activeBlockIndex: number | null
  onSelect: (blockIndex: number) => void
  className?: string
}

export function ResourceToc({ entries, activeBlockIndex, onSelect, className }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const tree = useMemo(() => buildTree(entries), [entries])
  const minLevel = useMemo(
    () => (entries.length > 0 ? Math.min(...entries.map((e) => e.level)) : 1),
    [entries],
  )

  const keyword = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (keyword ? entries.filter((e) => e.title.toLowerCase().includes(keyword)) : null),
    [entries, keyword],
  )

  // 目录很长时, 跟着阅读位置自动滚动, 否则看得到正文却找不到目录里对应哪一条
  useEffect(() => {
    if (activeBlockIndex === null) return
    const el = itemRefs.current.get(activeBlockIndex)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeBlockIndex])

  const allCollapsible = useMemo(() => collectCollapsible(tree), [tree])
  const allCollapsed = collapsed.size > 0 && collapsed.size >= allCollapsible.length

  const toggle = (blockIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
  }

  const rows = filtered
    ? filtered.map((entry) => ({ node: { entry, children: [] } as TocNode, depth: indentOf(entry.level, minLevel) }))
    : flattenVisible(tree, collapsed)

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2">
        <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">目录</span>
        <span className="text-[10px] text-muted-foreground">{entries.length} 条</span>
        <span className="flex-1" />
        {filtered ? (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="退出筛选" onClick={() => setQuery('')}>
            <X className="h-3 w-3" />
          </Button>
        ) : (
          allCollapsible.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              title={allCollapsed ? '展开全部' : '收起全部'}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allCollapsible))}
            >
              {allCollapsed ? <ListTree className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </Button>
          )
        )}
      </div>

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

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            这篇文献没解析出标题层级
          </p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">没有匹配的标题</p>
        ) : (
          rows.map(({ node, depth }) => {
            const { entry } = node
            const active = entry.blockIndex === activeBlockIndex
            const hasChildren = node.children.length > 0
            const isCollapsed = collapsed.has(entry.blockIndex)
            return (
              <div
                key={entry.blockIndex}
                className={cn(
                  'group relative flex items-start gap-1 rounded-sm pr-1.5 transition-colors',
                  active ? 'bg-primary/10' : 'hover:bg-accent/60',
                )}
                style={{ paddingLeft: `${6 + depth * 12}px` }}
              >
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(entry.blockIndex, el)
                    else itemRefs.current.delete(entry.blockIndex)
                  }}
                  type="button"
                  onClick={() => onSelect(entry.blockIndex)}
                  className="min-w-0 flex-1 py-1 text-left"
                  title={`${entry.title} — 第 ${entry.pageNo} 页`}
                >
                  <span
                    className={cn(
                      'block truncate text-[11px] leading-snug',
                      active ? 'font-medium text-primary' : 'text-foreground/85',
                      entry.level <= minLevel && 'text-xs font-medium text-foreground',
                    )}
                  >
                    {entry.title}
                  </span>
                </button>

                <span
                  className={cn(
                    'mt-1 shrink-0 text-[9px] tabular-nums text-muted-foreground/60',
                    active && 'text-primary/70',
                  )}
                >
                  {entry.pageNo}
                </span>

                {hasChildren && !filtered && (
                  <button
                    type="button"
                    onClick={() => toggle(entry.blockIndex)}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                    title={isCollapsed ? '展开' : '收起'}
                  >
                    <ChevronRight className={cn('h-3 w-3 transition-transform', !isCollapsed && 'rotate-90')} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
