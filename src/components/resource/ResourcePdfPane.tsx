import { useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { RENDER_SCALE, renderPdfPagesLocally, type PageUrl } from '@/lib/pdf-page-renderer'
import type { ResourceBlock } from '@/lib/resource-blocks'

interface Props {
  pages: PageUrl[]
  blocks: ResourceBlock[]
  pdfUrl: string | null
  activeBlockIndex: number | null
  onSelectBlock: (blockIndex: number) => void
  /** 直接跳页(工具栏页码框); nonce 变化才触发, 便于重复跳同一页 */
  jumpToPage?: { page: number; nonce: number } | null
}

const INITIAL_PAGES = 6
const PAGE_STEP = 3

export function ResourcePdfPane({ pages, blocks, pdfUrl, activeBlockIndex, onSelectBlock, jumpToPage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [containerW, setContainerW] = useState(700)
  const [localPages, setLocalPages] = useState<PageUrl[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const [localProgress, setLocalProgress] = useState<{ done: number; total: number } | null>(null)
  const [loadedCount, setLoadedCount] = useState(INITIAL_PAGES)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const effectivePages = pages.length > 0 ? pages : localPages
  // 状态只在异步回调里改, "正在渲染"这个中间态由渲染时推导, 免得在 effect 里同步 setState 触发多一轮渲染
  const localBusy = pages.length === 0 && !!pdfUrl && localPages.length === 0 && localError === null

  // 页图缺失时(解析时渲染失败 / R2 不可达)现场用 pdfjs 渲染, 否则这篇文献只剩正文可看
  useEffect(() => {
    if (pages.length > 0 || !pdfUrl) return
    const run = { cancelled: false }
    renderPdfPagesLocally(pdfUrl, undefined, (done, total) => {
      if (!run.cancelled) setLocalProgress({ done, total })
    })
      .then((rendered) => {
        if (run.cancelled) return
        setLocalPages(rendered)
        setLocalError(rendered.length > 0 ? null : 'PDF 页面渲染失败, 仅显示正文')
      })
      .catch(() => {
        if (!run.cancelled) setLocalError('PDF 页面渲染失败, 仅显示正文')
      })
    return () => { run.cancelled = true }
  }, [pages.length, pdfUrl])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const blocksByPage = useMemo(() => {
    const map = new Map<number, ResourceBlock[]>()
    for (const b of blocks) {
      if (!b.bbox) continue
      const arr = map.get(b.pageNo)
      if (arr) arr.push(b)
      else map.set(b.pageNo, [b])
    }
    return map
  }, [blocks])

  const pageOfBlock = useMemo(() => {
    const map = new Map<number, number>()
    for (const b of blocks) map.set(b.blockIndex, b.pageNo)
    return map
  }, [blocks])

  const activePage = activeBlockIndex === null ? null : pageOfBlock.get(activeBlockIndex) ?? null

  // 正文/目录/检索选中的区块, PDF 这边跟着走
  useEffect(() => {
    if (activePage === null) return
    const el = pageRefs.current.get(activePage)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePage, activeBlockIndex])

  // 跳页目标可能还在懒加载后面, 用派生值把它前面的页一起放出来 —— 放到 state 里会晚一帧,
  // 那一帧里目标元素还没挂载, 滚动就丢了。
  const targetIdx = jumpToPage ? effectivePages.findIndex((p) => p.p === jumpToPage.page) : -1
  const visibleCount = Math.max(loadedCount, targetIdx + 1)
  const visible = effectivePages.slice(0, visibleCount)
  const hasMore = visibleCount < effectivePages.length

  useEffect(() => {
    if (!jumpToPage) return
    const el = pageRefs.current.get(jumpToPage.page)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [jumpToPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLoadedCount((prev) => Math.min(prev + PAGE_STEP, effectivePages.length))
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, effectivePages.length])

  if (effectivePages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        {localBusy ? (
          <>
            <Skeleton className="h-[46vh] w-full max-w-md rounded" />
            <p className="text-xs text-muted-foreground">
              {localProgress ? `正在渲染 PDF 页面... ${localProgress.done}/${localProgress.total}` : '正在渲染 PDF 页面...'}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {localError ?? '这篇文献没有可显示的 PDF 页面'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-2">
      {localError && (
        <p className="pb-2 text-center text-[10px] text-muted-foreground">{localError}</p>
      )}

      {visible.map((page) => {
        const cssW = containerW - 16
        const scale = cssW / page.w
        const cssH = page.h * scale
        const bboxScale = RENDER_SCALE * scale
        const pageBlocks = blocksByPage.get(page.p) ?? []
        const isActivePage = activePage === page.p

        return (
          <div
            key={page.p}
            ref={(el) => {
              if (el) pageRefs.current.set(page.p, el)
              else pageRefs.current.delete(page.p)
            }}
            className={`relative mx-auto mb-3 transition-shadow ${isActivePage ? 'ring-1 ring-primary/40' : ''}`}
            style={{ width: cssW, height: cssH }}
          >
            <img
              src={page.src}
              alt={`第 ${page.p} 页`}
              loading="lazy"
              className="h-full w-full rounded border bg-white"
            />

            {pageBlocks.map((b) => {
              const [x0, y0, x1, y1] = b.bbox as number[]
              const active = b.blockIndex === activeBlockIndex
              return (
                <button
                  key={b.blockIndex}
                  type="button"
                  onClick={() => onSelectBlock(b.blockIndex)}
                  title={b.text.slice(0, 120)}
                  className={`absolute cursor-pointer border text-left transition-colors ${
                    active
                      ? 'z-10 border-primary bg-primary/25 ring-1 ring-primary'
                      : 'border-transparent hover:border-amber-400/70 hover:bg-amber-400/20'
                  }`}
                  style={{
                    left: x0 * bboxScale,
                    top: y0 * bboxScale,
                    width: Math.max((x1 - x0) * bboxScale, 3),
                    height: Math.max((y1 - y0) * bboxScale, 3),
                  }}
                />
              )
            })}

            <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-background/75 px-1 text-[9px] text-muted-foreground/60">
              {page.p}
            </span>
          </div>
        )
      })}

      {hasMore && <div ref={sentinelRef} className="h-4" />}
    </div>
  )
}
