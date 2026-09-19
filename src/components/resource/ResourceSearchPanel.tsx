import { Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { BlockHit } from '@/lib/resource-search'
import { HighlightText } from './HighlightText'

interface Props {
  query: string
  onQueryChange: (query: string) => void
  hits: BlockHit[]
  loading: boolean
  error: string | null
  activeBlockIndex: number | null
  onSelect: (hit: BlockHit) => void
  onClose: () => void
}

export function ResourceSearchPanel({
  query, onQueryChange, hits, loading, error, activeBlockIndex, onSelect, onClose,
}: Props) {
  const total = hits.length > 0 ? hits[0].totalHits : 0

  return (
    <div className="flex h-full min-h-0 flex-col border-l">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">检索定位</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="关闭" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="shrink-0 px-2.5 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="知识点 / 关键字, 如「死锁」"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="清空"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="pt-1 text-[10px] text-muted-foreground">
          {query.trim()
            ? `命中 ${total} 处${hits.length < total ? `, 显示前 ${hits.length} 条` : ''}`
            : '输入关键词, 命中后点结果即跳转到对应页'}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <p className="px-3 py-4 text-[11px] text-destructive">{error}</p>
        ) : !query.trim() ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            中文按子串匹配, 两个字也能搜
          </p>
        ) : !loading && hits.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">没有命中</p>
        ) : (
          <div className="space-y-0.5 p-1.5">
            {hits.map((hit) => (
              <button
                key={`${hit.documentId}-${hit.blockIndex}`}
                type="button"
                onClick={() => onSelect(hit)}
                className={cn(
                  'block w-full rounded-sm px-2 py-1.5 text-left transition-colors',
                  hit.blockIndex === activeBlockIndex ? 'bg-primary/10' : 'hover:bg-accent/60',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">
                    P{hit.pageNo}
                  </span>
                  {hit.headingLevel > 0 && (
                    <span className="rounded bg-blue-100 px-1 text-[9px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      标题
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                    {hit.docTitle}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug">
                  <HighlightText text={hit.snippet} query={query} />
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
