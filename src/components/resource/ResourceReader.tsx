import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Columns2, FileText, ListTree, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { cn } from '@/lib/utils'
import type { PageUrl } from '@/lib/pdf-page-renderer'
import type { ResourceBlock } from '@/lib/resource-blocks'
import { buildToc } from '@/lib/resource-blocks'
import { searchBlocks, type BlockHit } from '@/lib/resource-search'
import { HighlightText } from './HighlightText'
import { ResourcePdfPane } from './ResourcePdfPane'
import { ResourceSearchPanel } from './ResourceSearchPanel'
import { ResourceToc } from './ResourceToc'
import { Separator } from '@/components/ui/separator'

interface Props {
  documentId: string
  blocks: ResourceBlock[]
  pages: PageUrl[]
  markdown: string
  pdfUrl: string | null
  /** 各卷页码区间; 页图缺失时按卷兜底渲染用 */
  parts?: { page_from: number; page_to: number }[]
  /** pages 为空(页图缺失, 走本地渲染兜底)时用它显示真实页数 */
  pdfTotalPages?: number | null
  /** 从检索结果或外链带着目标区块进来时, 挂载后直接定位过去 */
  initialBlockIndex?: number | null
  initialQuery?: string
}

function blockClass(block: ResourceBlock): string {
  if (block.headingLevel > 0) {
    switch (block.headingLevel) {
      case 1: return 'text-[15px] font-semibold leading-snug pt-3 pb-1'
      case 2: return 'text-[13px] font-semibold leading-snug pt-2.5 pb-0.5'
      case 3: return 'text-xs font-semibold leading-snug pt-2 pb-0.5'
      default: return 'text-xs font-medium leading-snug pt-1.5'
    }
  }
  if (block.blockType === 'formula' || block.blockType === 'equation' || block.blockType === 'interline_equation') {
    return 'text-xs leading-relaxed font-mono text-foreground/80'
  }
  if (block.blockType === 'image' || block.blockType === 'figure') {
    return 'text-[11px] leading-relaxed text-muted-foreground italic'
  }
  if (block.blockType === 'list_item' || block.blockType === 'list-item' || block.blockType === 'list') {
    return 'text-xs leading-relaxed pl-3 -indent-2'
  }
  return 'text-xs leading-relaxed'
}

export function ResourceReader({
  documentId, blocks, pages, markdown, pdfUrl, parts, pdfTotalPages, initialBlockIndex, initialQuery = '',
}: Props) {
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const [tocOpen, setTocOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(() => initialQuery.trim().length > 0)
  const [viewMode, setViewMode] = useState<'blocks' | 'document'>('blocks')
  const [pageInput, setPageInput] = useState('')
  const [jumpToPage, setJumpToPage] = useState<{ page: number; nonce: number } | null>(null)

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  // 命中结果连同"它属于哪个关键词"一起存: 关键词一变旧结果自动失效, 不用再写个 effect 去清空
  const [hitState, setHitState] = useState<{ query: string; hits: BlockHit[]; error: string | null }>({
    query: '', hits: [], error: null,
  })
  const [searching, setSearching] = useState(false)

  const mdScrollRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map())
  const offsetsRef = useRef<{ idx: number; top: number }[]>([])
  const suppressSpyUntil = useRef(0)

  const activeQuery = searchOpen ? searchQuery.trim() : ''
  const hits = useMemo(
    () => (hitState.query === activeQuery ? hitState.hits : []),
    [hitState, activeQuery],
  )
  const searchError = hitState.query === activeQuery ? hitState.error : null

  const toc = useMemo(() => buildToc(blocks), [blocks])
  const located = useMemo(() => blocks.filter((b) => b.bbox).length, [blocks])
  const hitIndexes = useMemo(() => new Set(hits.map((h) => h.blockIndex)), [hits])

  // ── 检索: 限定本篇文章, 关键词变了才发请求 ──
  useEffect(() => {
    if (!activeQuery) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setSearching(true)
      searchBlocks(activeQuery, { documentId, limit: 60 })
        .then((result) => {
          if (!cancelled) setHitState({ query: activeQuery, hits: result, error: null })
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setHitState({
            query: activeQuery,
            hits: [],
            error: err instanceof Error ? err.message : String(err),
          })
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [activeQuery, documentId])

  // ── 目录 / 检索 / PDF 点击 → 三边同步定位 ──
  // pendingLocate 记着"正在滚向哪一块": 长文档里平滑滚动到几千段之外的块要好几秒,
  // 光靠一个固定时长的抑制窗口挡不住滚动监听 —— 滚动途中它就会把 active 改成当前可见的块,
  // 于是"点第 250 页的检索结果却跳到 166 页"。所以改成: 目标没进入视口之前, 监听器不抢。
  const pendingLocateRef = useRef<number | null>(null)

  const locate = useCallback((blockIndex: number) => {
    pendingLocateRef.current = blockIndex
    setActiveBlockIndex(blockIndex)
    setFlashIndex(blockIndex)
    setFocusNonce((n) => n + 1)
    suppressSpyUntil.current = Date.now() + 700
  }, [])

  useEffect(() => {
    if (focusNonce === 0) return
    const el = activeBlockIndex === null ? null : blockRefs.current.get(activeBlockIndex)
    // 用 start 而不是 center: 滚动监听认定的「当前块」是视口顶部那一段, 定位时若把目标居中,
    // 滚完监听就会把 active 改成顶部那一段, 变成「定位到了却显示成别的块」。
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusNonce, activeBlockIndex])

  // 带着 ?block= 进来时, 等首屏排版稳定再定位, 否则量到的位置会偏。
  // 检索面板的初始关键词已经在 useState 里取自 props —— 详情页给 Reader 挂了 key,
  // 换关键词跳转就是新组件, 不需要在这里再 setState。
  useEffect(() => {
    if (initialBlockIndex === null || initialBlockIndex === undefined) return
    const timer = setTimeout(() => locate(initialBlockIndex), 60)
    return () => clearTimeout(timer)
  }, [initialBlockIndex, locate])

  // ── 正文滚动 → 目录与 PDF 跟随 ──
  const measureOffsets = useCallback(() => {
    const root = mdScrollRef.current
    if (!root) return
    const base = root.getBoundingClientRect().top - root.scrollTop
    const list: { idx: number; top: number }[] = []
    for (const [idx, el] of blockRefs.current) {
      list.push({ idx, top: el.getBoundingClientRect().top - base })
    }
    list.sort((a, b) => a.top - b.top)
    offsetsRef.current = list
  }, [])

  useEffect(() => {
    if (viewMode !== 'blocks') return
    const root = mdScrollRef.current
    if (!root) return
    measureOffsets()
    const ro = new ResizeObserver(measureOffsets)
    ro.observe(root)
    return () => ro.disconnect()
  }, [blocks, viewMode, measureOffsets])

  useEffect(() => {
    if (viewMode !== 'blocks') return
    const root = mdScrollRef.current
    if (!root) return
    let raf = 0
    let settle: number | null = null

    const onScroll = () => {
      // 每次滚动都重置"已经滚完"的计时。程序化定位期间一直挡着监听, 直到滚动真正停下 ——
      // 用"目标是否接近顶部"这种判据会中途放行, 平滑滚动的后半程就把 active 改成更后面的块了。
      if (settle !== null) window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        settle = null
        pendingLocateRef.current = null
      }, 180)

      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (Date.now() < suppressSpyUntil.current) return
        if (pendingLocateRef.current !== null) return

        const list = offsetsRef.current
        if (list.length === 0) return
        // 取"盖住视口顶边的那一块", 而不是"顶部往下 90px 内最靠后的那一块":
        // 后者在短段落上会选中定位目标的下一个块, 让定位结果看起来偏了一屏。
        const target = root.scrollTop + 4
        let lo = 0
        let hi = list.length - 1
        let found = list[0].idx
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (list[mid].top <= target) { found = list[mid].idx; lo = mid + 1 } else hi = mid - 1
        }
        setActiveBlockIndex(found)
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      if (settle !== null) window.clearTimeout(settle)
    }
  }, [viewMode])

  const submitPage = () => {
    const page = Number(pageInput.trim())
    if (!Number.isFinite(page) || page < 1) return
    setJumpToPage({ page, nonce: Date.now() })
  }

  return (
    <div className="flex h-full min-h-0">
      {tocOpen && (
        <div className="hidden w-56 shrink-0 border-r lg:block xl:w-64">
          <ResourceToc entries={toc} activeBlockIndex={activeBlockIndex} onSelect={locate} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
          <Button
            variant={tocOpen ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => setTocOpen((v) => !v)}
            title="目录"
          >
            <ListTree className="h-3 w-3" />
            目录
          </Button>

          <span className="text-[10px] text-muted-foreground">
            共 {pages.length || pdfTotalPages || 0} 页<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{blocks.length} 段<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />可定位 {located}
          </span>
          {viewMode === 'document' && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">整篇模式不参与定位</span>
          )}

          <span className="flex-1" />

          <div className="flex items-center gap-1">
            <Input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPage() }}
              placeholder="页码"
              className="h-6 w-14 text-[11px]"
            />
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={submitPage}>
              跳转
            </Button>
          </div>

          <div className="flex items-center rounded-md border">
            <button
              type="button"
              onClick={() => setViewMode('blocks')}
              className={cn(
                'flex h-6 items-center gap-1 px-1.5 text-[11px]',
                viewMode === 'blocks' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
              title="按段显示, 可与 PDF 互相定位"
            >
              <Columns2 className="h-3 w-3" />逐段对齐
            </button>
            <button
              type="button"
              onClick={() => setViewMode('document')}
              className={cn(
                'flex h-6 items-center gap-1 px-1.5 text-[11px]',
                viewMode === 'document' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
              title="整篇渲染, 公式表格更完整但不参与定位"
            >
              <FileText className="h-3 w-3" />整篇
            </button>
          </div>

          <Button
            variant={searchOpen ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => setSearchOpen((v) => !v)}
            title="检索定位"
          >
            <Search className="h-3 w-3" />
            检索
          </Button>
        </div>

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={52} minSize={25}>
            <div className="h-full border-r">
              <ResourcePdfPane
                pages={pages}
                blocks={blocks}
                pdfUrl={pdfUrl}
                partRanges={parts?.map((p) => ({ from: p.page_from, to: p.page_to }))}
                activeBlockIndex={activeBlockIndex}
                onSelectBlock={locate}
                jumpToPage={jumpToPage}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={48} minSize={25}>
            {viewMode === 'document' ? (
              <div className="h-full overflow-y-auto p-3">
                <MarkdownRenderer content={markdown} className="text-xs" />
              </div>
            ) : (
              <div ref={mdScrollRef} className="h-full overflow-y-auto px-3 py-2">
                {blocks.map((block) => {
                  const active = block.blockIndex === activeBlockIndex
                  const hit = hitIndexes.has(block.blockIndex)
                  return (
                    <div
                      key={block.blockIndex}
                      data-block-index={block.blockIndex}
                      ref={(el) => {
                        if (el) blockRefs.current.set(block.blockIndex, el)
                        else blockRefs.current.delete(block.blockIndex)
                      }}
                      onAnimationEnd={(e) => {
                        if (e.animationName === 'flash') setFlashIndex(null)
                      }}
                      onClick={() => locate(block.blockIndex)}
                      title={`第 ${block.pageNo} 页 · 段 ${block.blockIndex}`}
                      className={cn(
                        'group relative cursor-pointer rounded-sm border-l-2 px-1.5 py-0.5 transition-colors',
                        flashIndex === block.blockIndex && 'animate-flash',
                        block.bbox ? 'border-l-amber-300/60' : 'border-l-transparent',
                        active
                          ? 'border-l-primary bg-primary/10 ring-1 ring-primary/40'
                          : hit
                            ? 'bg-amber-50/60 hover:bg-accent/50 dark:bg-amber-900/10'
                            : 'hover:bg-accent/50',
                        blockClass(block),
                      )}
                    >
                      <HighlightText text={block.text} query={searchOpen ? searchQuery : ''} />
                      <span className="pointer-events-none absolute right-1 top-0.5 hidden text-[9px] tabular-nums text-muted-foreground/50 group-hover:inline">
                        P{block.pageNo}
                      </span>
                    </div>
                  )
                })}
                <div className="h-8" />
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {searchOpen && (
        <div className="fixed inset-y-0 right-0 z-30 w-72 border-l bg-background shadow-lg md:static md:z-auto md:shadow-none">
          <ResourceSearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            hits={hits}
            loading={searching}
            error={searchError}
            activeBlockIndex={activeBlockIndex}
            onSelect={(hit) => locate(hit.blockIndex)}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
