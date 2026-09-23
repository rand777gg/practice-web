import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { RENDER_SCALE, renderPdfPagesLocally, type PageUrl } from '@/lib/pdf-page-renderer'
import type { ResourceBlock } from '@/lib/resource-blocks'
import { TONE_CHIP, TONE_HOTSPOT, typeLabel, typeTone } from '@/lib/mineru-types'
import { scrollElementToCenter } from './centered-scroll'

interface Props {
  pages: PageUrl[]
  blocks: ResourceBlock[]
  pdfUrl: string | null
  /** 各卷的原文页码范围; 页图缺失时按卷取范围现场渲染, 大书才不会一次渲染几百页 */
  partRanges?: { from: number; to: number }[]
  activeBlockIndex: number | null
  onSelectBlock: (blockIndex: number) => void
  /** 直接跳页(工具栏页码框); nonce 变化才触发, 便于重复跳同一页 */
  jumpToPage?: { page: number; nonce: number } | null
  /**
   * 'width'  适宽: 页宽铺满面板(默认, 字最大, 矮窗口下看不全一整页)
   * 'height' 适高: 整页放进面板 —— 取宽高两个方向都放得下的缩放比, 所以也绝不会横向溢出。
   *           窗口一矮(实测 1280×700 时面板只有 489px 而一页要 550px)必然看不全整页,
   *           这个模式下每页正好一屏, 翻页是整屏整屏地滚。
   */
  fit?: 'width' | 'height'
  /**
   * 类型标签显示方式, 与右侧正文那个开关是同一个:
   *   'active' 只给选中那一块显示(默认, 和 MinerU 客户端一致)
   *   'all'    每块都显示
   */
  labels?: 'active' | 'all'
}

const INITIAL_PAGES = 6
const PAGE_STEP = 3
// 兜底渲染把每页存成 base64 常驻内存, 一本 295 页的书能吃掉几百 MB 并拖崩标签页。
// 所以只在页数不多时自动渲染, 超了就让用户按需点 —— 正常路径(有 R2 页图)不受影响。
const LOCAL_RENDER_MAX = 40

/**
 * 页框宽度小于这个值就不认这次测量。
 *
 * 首帧 ResizablePanel 还没定宽, 容器会被量到几十像素; 采信它就会先按 35px 宽排一遍页框,
 * 等真实宽度(五百多)到了再跳一次 —— 实测一次 layout-shift 就是 0.245, 看起来就是整页抖一下。
 * 真实的 PDF 阅读区不会只有 160px, 所以这个下限只会挡掉"还没布局好"那种测量。
 */
const MIN_USABLE_W = 160
const MIN_USABLE_H = 160
/** 面板的 p-2: 上下左右各 8px, 页框要减掉才是可用尺寸 */
const PANE_PAD_X = 16
const PANE_PAD_Y = 16
/** 页框的 mb-3; 适高时把它一起算进去, 才能"一页正好一屏" */
const PAGE_GAP = 12

export function ResourcePdfPane({
  pages, blocks, pdfUrl, partRanges, activeBlockIndex, onSelectBlock, jumpToPage, fit = 'width', labels = 'active',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  // 高度也要量: 适高模式是按"一页放进面板高度"来定缩放的
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [localPages, setLocalPages] = useState<PageUrl[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const [localProgress, setLocalProgress] = useState<{ done: number; total: number } | null>(null)
  const [loadedCount, setLoadedCount] = useState(INITIAL_PAGES)
  const [localWanted, setLocalWanted] = useState(false)
  const ioRef = useRef<IntersectionObserver | null>(null)

  const effectivePages = pages.length > 0 ? pages : localPages

  // 全篇页数: 有分卷就按各卷累加, 否则用页码参数兜底
  const fallbackTotal = useMemo(() => {
    if (partRanges && partRanges.length > 0) {
      return partRanges.reduce((n, r) => n + Math.max(0, r.to - r.from + 1), 0)
    }
    return 0
  }, [partRanges])
  const needsFallback = pages.length === 0 && !!pdfUrl
  const fallbackTooBig = needsFallback && fallbackTotal > LOCAL_RENDER_MAX
  // 状态只在异步回调里改, "正在渲染"这个中间态由渲染时推导, 免得在 effect 里同步 setState 触发多一轮渲染
  const localBusy = needsFallback && (!fallbackTooBig || localWanted) && localPages.length === 0 && localError === null

  // 页图缺失时(解析时渲染失败 / R2 不可达)现场用 pdfjs 渲染, 否则这篇文献只剩正文可看。
  // 大书只渲染开头一段: base64 常驻内存, 295 页能吃掉几百 MB 并拖崩标签页。
  useEffect(() => {
    if (!needsFallback) return
    if (fallbackTooBig && !localWanted) return
    const run = { cancelled: false }
    renderPdfPagesLocally(pdfUrl, fallbackTooBig ? `1-${LOCAL_RENDER_MAX}` : undefined, (done, total) => {
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
  }, [needsFallback, pdfUrl, fallbackTooBig, localWanted])

  /**
   * 用 callback ref 而不是 useEffect 量尺寸, 有两个原因:
   *   1) ref 是在 commit 阶段调的, 早于浏览器绘制 —— 首帧就量到真实尺寸, 不会先按兜底值画一遍;
   *   2) 页图缺失时上面那个分支会先返回一个没有容器的占位视图, 容器是后来才挂上的,
   *      写死 deps 的 effect 那时早就跑过了(el 为 null), ResizeObserver 永远不会挂上去。
   */
  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const apply = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      // 只挡下限: 面板被拖宽拖窄都是正常操作, 照单全收
      if (w < MIN_USABLE_W || h < MIN_USABLE_H) return
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    roRef.current = ro
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

  // 正文/目录/检索选中的区块, PDF 这边跟着走 —— 选中页居中显示(比例不够高时自动退回顶对齐, 见 helper)
  useEffect(() => {
    if (activePage === null) return
    const pane = containerRef.current
    const el = pageRefs.current.get(activePage)
    if (pane && el) scrollElementToCenter(pane, el)
  }, [activePage, activeBlockIndex])

  // 跳页目标可能还在懒加载后面, 用派生值把它前面的页一起放出来 —— 放到 state 里会晚一帧,
  // 那一帧里目标元素还没挂载, 滚动就丢了。
  const targetIdx = jumpToPage ? effectivePages.findIndex((p) => p.p === jumpToPage.page) : -1
  // 正文定位过来的目标页同理: 长文档里目标页往往还没挂载, 不放出来的话 scrollIntoView 找不到元素,
  // 表现就是「正文定位了但 PDF 没动也没有高亮」。
  const activePageIdx = activePage === null ? -1 : effectivePages.findIndex((p) => p.p === activePage)
  const visibleCount = Math.max(loadedCount, targetIdx + 1, activePageIdx + 1)
  const visible = effectivePages.slice(0, visibleCount)
  const hasMore = visibleCount < effectivePages.length
  // 哨兵的回调里要用到总页数, 又不能把它写进依赖(见下)
  const totalRef = useRef(effectivePages.length)
  totalRef.current = effectivePages.length

  /**
   * 哨兵用 callback ref 挂 IntersectionObserver, 而不是 useEffect([hasMore, ...])。
   *
   * 上面那个"还没量到可用宽度就先显示骨架"的分支**不渲染哨兵**, 而 effect 会在首帧就执行一次
   * (那时 sentinelRef.current 还是 null), 之后 hasMore / 页数都不再变, effect 也就不会再跑 ——
   * 观察器永远挂不上, 无限滚动整个失效, 表现就是"滚到底部不出下一页"。
   * callback ref 在元素真正挂载/卸载时才调, 不受这些分支切换影响。
   *
   * root 用面板自己而不是视口: 加载与否该看哨兵有没有接近**面板**的底边, 与面板在屏幕上多高无关。
   *
   * 放页也不是从 loadedCount 往上加: 定位/跳页到远超已加载窗口的一页时, visibleCount 由
   * activePageIdx/targetIdx 撑着(定位到第 200 页就是 visibleCount=201 而 loadedCount 还停在 6),
   * 加在 loadedCount 上派生值纹丝不动 —— 不多渲染一页, 哨兵就停在原地, 观察器再等不到状态变化
   * 而彻底静默, 内容也就到定位那页为止, 表现就是"只能翻到定位的那一页, 再往下翻不动了"。
   * 所以这里按**真正挂在 DOM 上的页数**(= visibleCount, 页框都登记在 pageRefs 里)往上放。
   */
  const attachSentinel = useCallback((el: HTMLDivElement | null) => {
    ioRef.current?.disconnect()
    ioRef.current = null
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadedCount((prev) => Math.min(Math.max(prev, pageRefs.current.size) + PAGE_STEP, totalRef.current))
      }
    }, { root: containerRef.current, rootMargin: '300px' })
    io.observe(el)
    ioRef.current = io
  }, [])

  useEffect(() => {
    if (!jumpToPage) return
    const el = pageRefs.current.get(jumpToPage.page)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [jumpToPage])

  if (effectivePages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        {fallbackTooBig && !localWanted ? (
          <>
            <p className="text-xs text-muted-foreground">
              这篇文献缺少页图, 共 {fallbackTotal} 页 —— 一次全部渲染会占用过多内存。
            </p>
            <Button variant="outline" size="sm" onClick={() => setLocalWanted(true)}>
              只渲染前 {LOCAL_RENDER_MAX} 页
            </Button>
            <p className="text-[10px] text-muted-foreground">要看到全部页面, 请在管理页重新解析以生成页图。</p>
          </>
        ) : localBusy ? (
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

  // 还没量到可用尺寸就只占位, 不按错误尺寸把页框排一遍再跳 —— 那一次跳动正是"页面抖一下"
  if (box.w < MIN_USABLE_W || box.h < MIN_USABLE_H) {
    return (
      <div
        ref={attachContainer}
        className="h-full overflow-y-auto p-2 [scrollbar-gutter:stable]"
      >
        <Skeleton className="mx-auto mb-3 aspect-[1/1.414] w-full max-w-[520px] rounded" />
        <Skeleton className="mx-auto mb-3 aspect-[1/1.414] w-full max-w-[520px] rounded" />
      </div>
    )
  }

  const availW = box.w - PANE_PAD_X
  // 适高时把 mb-3 一起扣掉, 于是"一页 + 它的下边距"正好等于面板的可视高度, 每页正好一屏
  const availH = box.h - PANE_PAD_Y - (fit === 'height' ? PAGE_GAP : 0)

  return (
    <div ref={attachContainer} className="h-full overflow-y-auto p-2 [scrollbar-gutter:stable]">
      {localError && (
        <p className="pb-2 text-center text-[10px] text-muted-foreground">{localError}</p>
      )}

      {visible.map((page) => {
        // 页框用 aspect-ratio 而不是自己算像素高: 宽度一变浏览器直接就着重排, 不用等我们重渲染一轮;
        // 而且 page.h 缺失时自己算会得到 NaN, 整块会塌成 0 高 —— 那才是真正会抖的形状。
        const pw = page.w > 0 ? page.w : 1000
        const ph = page.h > 0 ? page.h : 1414
        // 适高 = 整页放进面板: 取宽、高两个方向都能放下的那个缩放比, 所以纵向放得下、横向也不会溢出
        const cssW = fit === 'height' ? Math.min(availW, (availH * pw) / ph) : availW
        const bboxScale = RENDER_SCALE * (cssW / pw)
        const pageBlocks = blocksByPage.get(page.p) ?? []
        const isActivePage = activePage === page.p

        return (
          <div
            key={page.p}
            ref={(el) => {
              if (el) pageRefs.current.set(page.p, el)
              else pageRefs.current.delete(page.p)
            }}
            className={`lib-page relative mx-auto mb-3 transition-shadow ${isActivePage ? 'ring-1 ring-primary/40' : ''}`}
            style={{ width: cssW, aspectRatio: `${pw} / ${ph}` }}
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
              const tone = typeTone(b.blockType)
              return (
                <button
                  key={b.blockIndex}
                  type="button"
                  onClick={() => onSelectBlock(b.blockIndex)}
                  // 悬停时按类型上色, 和右边正文里的标签同色 —— 一眼能对上哪块是哪块
                  title={`${typeLabel(b.blockType)}: ${b.text.slice(0, 120)}`}
                  className={`absolute cursor-pointer border text-left transition-colors ${
                    active
                      ? 'z-10 border-primary bg-primary/25 ring-1 ring-primary'
                      : `border-transparent ${TONE_HOTSPOT[tone]}`
                  }`}
                  style={{
                    left: x0 * bboxScale,
                    top: y0 * bboxScale,
                    width: Math.max((x1 - x0) * bboxScale, 3),
                    height: Math.max((y1 - y0) * bboxScale, 3),
                  }}
                >
                  {/*
                    和右边正文里同款的标签: 文字就是 type 的中文名, 颜色同色, 挂在框**外面**的左上角
                    (压在框的上边缘上, 和 MinerU 客户端一致)。默认只给选中那一块显示 —— 一页几十个标签
                    会把扫描件糊住。不吃鼠标事件, 悬停/点击照旧落在下面那个热区上;
                    字号不跟页面缩放, 页面缩小后仍然看得清。
                  */}
                  {(labels === 'all' || active) && (
                    <span
                      className={`pointer-events-none absolute -left-px -top-[13px] whitespace-nowrap border px-1 text-[9px] leading-[11px] ${TONE_CHIP[tone]}`}
                    >
                      {typeLabel(b.blockType)}
                    </span>
                  )}
                </button>
              )
            })}

            <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-background/75 px-1 text-[9px] text-muted-foreground/60">
              {page.p}
            </span>
          </div>
        )
      })}

      {hasMore && <div ref={attachSentinel} className="h-4" />}
    </div>
  )
}
