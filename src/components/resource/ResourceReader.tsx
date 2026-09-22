import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Columns2, Crosshair, FileText, Link2, ListTree, Loader2, MoveHorizontal, MoveVertical, Pencil, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { cn } from '@/lib/utils'
import type { PageUrl } from '@/lib/pdf-page-renderer'
import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'
import { buildToc } from '@/lib/resource-blocks'
import { searchBlocks, type BlockHit } from '@/lib/resource-search'
import { draftFromToc, blockIndexSet, staleEntryIds, tocFromDraft, updateEntry, type TocDraftEntry } from '@/lib/resource-toc'
import { resetManualToc, saveManualToc } from '@/lib/resource-toc-store'
import { HighlightText } from './HighlightText'
import { ResourcePdfPane } from './ResourcePdfPane'
import { ResourceSearchPanel } from './ResourceSearchPanel'
import { ResourceToc, type TocEditorBridge } from './ResourceToc'
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
  /** 管理员改过的人工目录; 传 null/不传就是用解析结果现推的那份 */
  toc?: TocEntry[] | null
  /** 管理员才能改目录 —— 目录改完直接影响出题范围, 不能让普通用户动 */
  canEditToc?: boolean
  /** 带 ?toc=edit 进来时直接进编辑态 (管理页的「编辑目录」就跳这里) */
  initialTocEdit?: boolean
  /** 目录存过之后通知外面重新拉一次, 否则退出编辑态会看到挂载时那份旧的 */
  onTocSaved?: () => void
}

function blockClass(block: ResourceBlock): string {  if (block.headingLevel > 0) {
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

/** PDF 缩放方式的持久化键 */
const PDF_FIT_KEY = 'resource.pdfFit'
/** 「自动跟随」的持久化键 */
const AUTO_FOLLOW_KEY = 'resource.autoFollow'

export function ResourceReader({
  documentId, blocks, pages, markdown, pdfUrl, parts, pdfTotalPages, initialBlockIndex, initialQuery = '', toc,
  canEditToc = false, initialTocEdit = false, onTocSaved,
}: Props) {
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const [tocOpen, setTocOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(() => initialQuery.trim().length > 0)
  const [viewMode, setViewMode] = useState<'blocks' | 'document'>('blocks')
  /**
   * PDF 缩放方式。存 localStorage: 窗口矮是"这台机器/这个屏幕"的属性, 不是一次性选择 ——
   * 每次进来都要再点一下就很烦。
   */
  const [pdfFit, setPdfFit] = useState<'width' | 'height'>(() => {
    try {
      return localStorage.getItem(PDF_FIT_KEY) === 'height' ? 'height' : 'width'
    } catch {
      return 'width'
    }
  })
  useEffect(() => {
    try { localStorage.setItem(PDF_FIT_KEY, pdfFit) } catch { /* 隐私模式下写不了, 无所谓 */ }
  }, [pdfFit])

  /**
   * 正文滚动时要不要自动改"当前选中块"(并因此带着目录和 PDF 一起走)。
   *
   * 关掉以后: 滚动只滚动, 选中区锁在你上一次明确点的位置 —— 否则每往下翻一屏,
   * 选中区就被换成视口顶部那一段, PDF 也跟着翻页, 想"盯住一段一边看一边对照"就没法用。
   */
  const [autoFollow, setAutoFollow] = useState(() => {
    try {
      return localStorage.getItem(AUTO_FOLLOW_KEY) !== 'off'
    } catch {
      return true
    }
  })
  // 监听器是常驻的(只在 viewMode 变时重建), 所以用 ref 读最新值, 免得每次开关都重新订阅
  const autoFollowRef = useRef(autoFollow)
  autoFollowRef.current = autoFollow
  useEffect(() => {
    try { localStorage.setItem(AUTO_FOLLOW_KEY, autoFollow ? 'on' : 'off') } catch { /* 同上 */ }
  }, [autoFollow])
  const [pageInput, setPageInput] = useState('')
  const [jumpToPage, setJumpToPage] = useState<{ page: number; nonce: number } | null>(null)

  // ── 目录编辑 (只有管理员) ──
  // 编辑期间的唯一数据源是 draft; 存过之后外面重拉一份 toc, 退出编辑态才不会看到挂载时那份旧的
  const canEdit = canEditToc
  const [editMode, setEditMode] = useState(() => canEdit && initialTocEdit)
  const [draft, setDraft] = useState<TocDraftEntry[] | null>(
    () => (canEdit && initialTocEdit ? draftFromToc(toc ?? buildToc(blocks)) : null),
  )
  const [tocDirty, setTocDirty] = useState(false)
  const [tocSaving, setTocSaving] = useState(false)
  const [tocNotice, setTocNotice] = useState<string | null>(null)
  const [tocError, setTocError] = useState<string | null>(null)
  // 正在等"点正文选落点"的那条目录 id
  const [mappingId, setMappingId] = useState<number | null>(null)

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  // 命中结果连同"它属于哪个关键词"一起存: 关键词一变旧结果自动失效, 不用再写个 effect 去清空
  const [hitState, setHitState] = useState<{ query: string; hits: BlockHit[]; error: string | null }>({
    query: '', hits: [], error: null,
  })
  const [searching, setSearching] = useState(false)

  const mdScrollRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map())
  const offsetsRef = useRef<{ idx: number; top: number }[]>([])
  /** 上次量偏移量时正文的总高; 对不上就说明内容重排过, 偏移量作废 */
  const measuredHeightRef = useRef(0)
  const suppressSpyUntil = useRef(0)

  const activeQuery = searchOpen ? searchQuery.trim() : ''
  const hits = useMemo(
    () => (hitState.query === activeQuery ? hitState.hits : []),
    [hitState, activeQuery],
  )
  const searchError = hitState.query === activeQuery ? hitState.error : null

  // 人工目录优先: 管理员改过就以那份为准, 没改过还是按解析结果现推
  const baseToc = useMemo(() => toc ?? buildToc(blocks), [toc, blocks])
  const tocEntries = useMemo(() => (draft ? tocFromDraft(draft) : baseToc), [draft, baseToc])
  const blockIndexes = useMemo(() => new Set(blocks.map((b) => b.blockIndex)), [blocks])
  const located = useMemo(() => blocks.filter((b) => b.bbox).length, [blocks])
  const hitIndexes = useMemo(() => new Set(hits.map((h) => h.blockIndex)), [hits])

  const staleIds = useMemo(
    () => (draft ? staleEntryIds(draft, blockIndexSet(blocks)) : new Set<number>()),
    [draft, blocks],
  )

  const startEditToc = useCallback(() => {
    setDraft((prev) => prev ?? draftFromToc(baseToc))
    setTocDirty(false)
    setTocNotice(null)
    setTocError(null)
    setEditMode(true)
    setTocOpen(true)
  }, [baseToc])

  const changeDraft = useCallback((next: TocDraftEntry[]) => {
    setDraft(next)
    setTocDirty(true)
    setTocNotice(null)
  }, [])

  /**
   * 有未保存的目录改动时拦一下关页面/刷新。
   *
   * 目录编辑是"边看正文边改"的长动作, 一本 497 条的目录改下来要好几分钟;
   * 手一抖关掉标签页就全没了, 而页面上没有任何地方能看出"还没保存"之外的东西。
   * 这里只挡浏览器级的离开(SPA 内部跳转是 router 的事, 不值当为它上 blocker)。
   */
  useEffect(() => {
    if (!editMode || !tocDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editMode, tocDirty])

  /**
   * 把某条的落点设成刚点的那一段。
   * 页码跟着落点走 —— 目录项标着第 8 页却映射到第 30 页的段, 出题范围会切在第 8 页。
   */
  const assignMapping = useCallback((blockIndex: number, pageNo: number) => {
    setDraft((prev) => {
      if (!prev || mappingId === null) return prev
      const at = prev.findIndex((e) => e.id === mappingId)
      return at < 0 ? prev : updateEntry(prev, at, { blockIndex, pageNo })
    })
    setTocDirty(true)
    setMappingId(null)
    setTocNotice('落点已设, 别忘了保存')
  }, [mappingId])

  const saveToc = useCallback(async () => {
    if (!draft) return
    setTocSaving(true)
    setTocError(null)
    try {
      await saveManualToc(documentId, draft)
      setTocDirty(false)
      setTocNotice('目录已保存, 阅读页目录与出题范围都按这份走')
      onTocSaved?.()
    } catch (err) {
      setTocError(err instanceof Error ? err.message : String(err))
    } finally {
      setTocSaving(false)
    }
  }, [draft, documentId, onTocSaved])

  const discardToc = useCallback(() => {
    setDraft(draftFromToc(baseToc))
    setTocDirty(false)
    setMappingId(null)
    setTocNotice('已回到上次保存的目录')
    setTocError(null)
  }, [baseToc])

  const resetTocToAuto = useCallback(async () => {
    if (!window.confirm('恢复自动目录会删掉所有人工修改, 之后目录按解析结果重新生成。继续?')) return
    setTocSaving(true)
    setTocError(null)
    try {
      await resetManualToc(documentId)
      setDraft(draftFromToc(buildToc(blocks)))
      setTocDirty(false)
      setMappingId(null)
      setTocNotice('已恢复自动目录(人工目录已删除)')
      onTocSaved?.()
    } catch (err) {
      setTocError(err instanceof Error ? err.message : String(err))
    } finally {
      setTocSaving(false)
    }
  }, [blocks, documentId, onTocSaved])

  const tocEditor = useMemo<TocEditorBridge | null>(() => (
    editMode && draft
      ? {
        draft,
        onChange: changeDraft,
        onPickMapping: (id: number) => {
          setMappingId((cur) => (cur === id ? null : id))
          setTocNotice(null)
        },
        staleIds,
        mappingId,
        dirty: tocDirty,
        saving: tocSaving,
        onSave: () => void saveToc(),
        onDiscard: discardToc,
        onResetAuto: () => void resetTocToAuto(),
      }
      : null
  ), [editMode, draft, changeDraft, staleIds, mappingId, tocDirty, tocSaving, saveToc, discardToc, resetTocToAuto])

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
  /**
   * 最近一次"明确要求定位"的目标。
   *
   * 和 pendingLocateRef 分开是因为那个会被滚动监听在滚动停下时清掉; 这个只由 locate() 写,
   * 所以下面那个 effect 不管什么时候跑都能拿到"该滚去哪一段"。
   */
  const locateTargetRef = useRef<number | null>(null)

  const locate = useCallback((blockIndex: number) => {
    pendingLocateRef.current = blockIndex
    locateTargetRef.current = blockIndex
    setActiveBlockIndex(blockIndex)
    setFlashIndex(blockIndex)
    setFocusNonce((n) => n + 1)
    suppressSpyUntil.current = Date.now() + 700
  }, [])

  /**
   * 点目录。落在正文里的就直接定位; 没有落点(纯分组项)或者映射已经失效的
   * (重新解析后 block_index 会整体重排), 退化成翻到那条目录记的页码 ——
   * 总比点了没反应好, 至少把 PDF 带到那一页。
   */
  const selectTocEntry = useCallback((entry: TocEntry) => {
    if (entry.blockIndex === null || !blockIndexes.has(entry.blockIndex)) {
      setJumpToPage({ page: entry.pageNo, nonce: Date.now() })
      return
    }
    locate(entry.blockIndex)
  }, [blockIndexes, locate])

  /**
   * 定位之后把目标那一段滚到视口顶部 —— 这是"点目录/检索结果/PDF 热区 → 正文跳过去"的那一步。
   *
   * 只认这一次定位的目标, **不能把 activeBlockIndex 放进依赖**: 那个值会随滚动、随换窗口比例
   * 而变, 挂上去就等于"只要当前块变了就把正文拽到它置顶"。而这个拽动本身又会产生 scroll 事件、
   * 又改 activeBlockIndex —— 自己咬自己。实测: 点过一次目录之后收起侧边栏, 正文被拽走近 5000px、
   * 活动块在 258 → 300 → 262 之间连跳三次, 表现就是"一换比例, 选中的内容就抖成别的了"。
   *
   * 用 start 而不是 center: 滚动监听认定的「当前块」是视口顶部那一段, 定位时若把目标居中,
   * 滚完监听就会把 active 改成顶部那一段, 变成「定位到了却显示成别的块」。
   */
  useEffect(() => {
    if (focusNonce === 0) return
    const target = locateTargetRef.current
    if (target === null) return
    const el = blockRefs.current.get(target)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusNonce])

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
    // 记下这次量的是"多高的内容": 高度一变(换窗口比例、拖面板、折叠目录)偏移量就全作废了
    measuredHeightRef.current = root.scrollHeight
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
        // 「自动跟随」关掉时, 滚动不参与选块 —— 选中区就锁在用户自己点的那一段,
        // 不会因为往下翻一屏就被换成视口顶部那一段, PDF 也就不会跟着乱翻。
        // 显式定位(点目录/检索结果/PDF 热区/点段落)照旧生效, 那条路不经过这里。
        if (!autoFollowRef.current) return
        if (Date.now() < suppressSpyUntil.current) return
        if (pendingLocateRef.current !== null) return

        // 换窗口比例/拖面板会让正文重排, 每个块的偏移量随即作废, 但重排本身会带着 scrollTop
        // 一起变(滚动锚定要保住同一段文字), 于是跟着来的这次 scroll 事件就是"新 scrollTop + 旧偏移量"。
        // 用它算出来的块是错的 —— 表现就是一换比例, 高亮和 PDF 那一页跳到别的段上。
        // 所以先用一次 scrollHeight 判断内容高度有没有变(单次读取, 很便宜), 变了就重量。
        if (root.scrollHeight !== measuredHeightRef.current) measureOffsets()

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
  }, [viewMode, measureOffsets])

  const submitPage = () => {
    const page = Number(pageInput.trim())
    if (!Number.isFinite(page) || page < 1) return
    setJumpToPage({ page, nonce: Date.now() })
  }

  return (
    <div className="flex h-full min-h-0">
      {tocOpen && (
        <div
          className={cn(
            'shrink-0 border-r',
            // 编辑态不跟 lg 断点走: 窄窗口下整个目录栏会被 hidden 掉, 管理员从「编辑目录」跳进来
            // 却看不到任何可改的东西, 而且没有任何提示。编辑是显式进入的, 宁可挤一点。
            editMode ? 'flex w-72' : 'hidden w-56 lg:block xl:w-64',
          )}
        >
          <ResourceToc
            entries={tocEntries}
            activeBlockIndex={activeBlockIndex}
            onSelect={selectTocEntry}
            editor={tocEditor}
            className="w-full"
          />
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

          {canEdit && (
            <Button
              variant={editMode ? 'default' : 'ghost'}
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px]"
              onClick={() => (editMode ? void saveToc() : startEditToc())}
              disabled={editMode && (tocSaving || !tocDirty)}
              title={editMode ? '保存目录改动' : '对照着正文改目录(层级/增删/改名/落点)'}
            >
              {tocSaving
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : editMode ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editMode ? '保存目录' : '改目录'}
            </Button>
          )}

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

          {/* PDF 缩放方式: 窗口一矮, 适宽就再也看不全一整页(实测 1280×700 面板 489px / 一页 550px) */}
          <div className="flex items-center rounded-md border">
            <button
              type="button"
              onClick={() => setPdfFit('width')}
              className={cn(
                'flex h-6 items-center gap-1 px-1.5 text-[11px]',
                pdfFit === 'width' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
              title="页宽铺满面板: 字最大, 但窗口矮时要滚动才能看全一整页"
            >
              <MoveHorizontal className="h-3 w-3" />适宽
            </button>
            <button
              type="button"
              onClick={() => setPdfFit('height')}
              className={cn(
                'flex h-6 items-center gap-1 px-1.5 text-[11px]',
                pdfFit === 'height' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
              title="整页放进面板: 每页正好一屏, 不用滚就能看全一页(页面会小一些)"
            >
              <MoveVertical className="h-3 w-3" />适高
            </button>
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

          {/*
            关掉之后滚动不再改选中块: 想"盯住这一段、一边往下看一边和 PDF 对照"时才不会被
            滚动一路带走。放最右边是因为它管的是整个右栏的滚动行为, 和左边那些定位按钮不是一类。
          */}
          <Button
            variant={autoFollow ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => setAutoFollow((v) => !v)}
            title={autoFollow
              ? '自动跟随: 开 —— 滚动时选中区跟着视口顶部走, 目录与 PDF 一起跳。点一下锁住当前选中'
              : '自动跟随: 关 —— 选中区已锁住, 滚动不再改它 (点目录/检索结果/PDF 热区仍可主动定位)'}
          >
            <Crosshair className={cn('h-3 w-3', autoFollow && 'fill-current')} />
            跟随
          </Button>
        </div>

        {editMode && mappingId !== null && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-2.5 py-1.5 text-[11px]">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              点右边正文里的某一段, 把它设为「
              {draft?.find((e) => e.id === mappingId)?.title || '这条目录'}
              」的落点
            </span>
            <Button
              variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]"
              onClick={() => setMappingId(null)}
            >
              <X className="h-3 w-3" />取消
            </Button>
          </div>
        )}

        {editMode && (tocNotice || tocError || staleIds.size > 0) && (
          <div
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-2 border-b px-2.5 py-1 text-[11px]',
              tocError ? 'bg-destructive/5 text-destructive' : 'bg-muted/40 text-muted-foreground',
            )}
          >
            {tocError ? (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{tocError}</span>
              </>
            ) : (
              <>
                {tocNotice && <span className="min-w-0 flex-1 truncate">{tocNotice}</span>}
                {staleIds.size > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {staleIds.size} 条映射失效(重新解析过), 在目录里点它们的页码可重设落点
                  </span>
                )}
              </>
            )}
          </div>
        )}

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
                fit={pdfFit}
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
                      onClick={() => {
                        // 选落点期间整篇正文就是一块"取点面板", 点到哪段就锚到哪段
                        if (mappingId !== null) assignMapping(block.blockIndex, block.pageNo)
                        else locate(block.blockIndex)
                      }}
                      title={mappingId !== null
                        ? `把落点设在这一段 (第 ${block.pageNo} 页)`
                        : `第 ${block.pageNo} 页 · 段 ${block.blockIndex}`}
                      className={cn(
                        'group relative cursor-pointer rounded-sm border-l-2 px-1.5 py-0.5 transition-colors',
                        flashIndex === block.blockIndex && 'animate-flash',
                        block.bbox ? 'border-l-amber-300/60' : 'border-l-transparent',
                        mappingId !== null && 'ring-1 ring-primary/30 hover:bg-primary/10 hover:ring-primary',
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
