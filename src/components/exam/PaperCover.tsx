/**
 * 试卷封面渲染: 与 PaperPreview / PaperOutline 共用 .paper-sheet 排版,
 * 在卷面第一页(整卷前)单独渲染一张封面。
 * 排版 token (纸张/边距/装订线/密封条/水印) 由 layout 提供。
 */
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { layoutToCssVars, textBlockInlineStyle, type ExamTemplateLayout, type PaperPick, type PaperTextBlockKey } from '@/lib/paper-layout'
import { PaperLayoutOverlays } from './paper-view-parts'
import type { ExamTemplateCover, ExamTemplateCoverBlock } from '@/lib/paper-cover'

interface Props {
  cover: ExamTemplateCover
  /** sheet 整卷(A4), spread 多栏摊开(无 180 宽) */
  layout?: 'sheet' | 'spread'
  /** 紧凑模式: 编辑器侧栏缩排 */
  compact?: boolean
  /** 排版 token, 可选; 不传则用默认 layout (A4) */
  paperLayout?: ExamTemplateLayout | null
  /**
   * bare: 由外层页面容器统一负责内边距时置 true(双页分页视图用),
   * 封面自身不再加纸张边距, 与正文页面版心一致。
   */
  bare?: boolean
  /** 是否渲染装订线/密封条/水印; 双页分页视图由页面层统一渲染, 传 false 避免重复 */
  overlays?: boolean
  /** 直调编辑态: 文本元素挂 data-paper-tb 命中标记 (需配合 PaperOutline direct) */
  direct?: boolean
  /** 当前命中选中 (direct 时有效), 命中文本块高亮 */
  pick?: PaperPick | null
  /**
   * direct 编辑态: 封面自定义块支持拖动排序。回调在放下时给出可视槽位 from → to
   * (0 基; 仅计封面内渲染的块, 不含 header/footer 落位的块)。
   */
  onReorderBlocks?: (from: number, to: number) => void
}

/** 命中选中态 class (作用于全部同名文本块) */
function selCls(pick: PaperPick | null, tb: PaperTextBlockKey): string | undefined {
  return pick?.kind === 'tb' && pick.tb === tb ? 'pe-sel' : undefined
}

/** 直调命中: 返回一组 data-* 字面量属性 (direct=false 时不挂) */
function hit(direct: boolean, tb: PaperTextBlockKey): { 'data-paper-tb'?: PaperTextBlockKey; 'data-paper-hit'?: string } {
  return direct ? { 'data-paper-tb': tb, 'data-paper-hit': '' } : {}
}

/** 直调双击编辑: 给可编辑文字挂上归属字段 (direct=false 时不挂) */
function editAttr(direct: boolean, field: string, index?: number): Record<string, string> {
  if (!direct) return {}
  return index === undefined ? { 'data-cover-field': field } : { 'data-cover-field': field, 'data-cover-index': String(index) }
}

export function PaperCover({ cover, layout = 'sheet', compact = false, paperLayout, bare = false, overlays = true, direct = false, pick = null, onReorderBlocks }: Props) {
  const spread = layout === 'spread'
  const compactCls = compact ? 'paper-cover-compact' : ''
  const cssVars = paperLayout ? layoutToCssVars(paperLayout, layout) : undefined
  // sheet 模式下封面默认独占一页; spread(摊开一屏) 与 compact(编辑器缩排) 不分页
  const ownPage = !spread && !compact && (paperLayout?.coverOwnPage ?? true)

  const tb = useMemo(() => ({
    banner: textBlockInlineStyle(paperLayout, 'coverBanner'),
    examName: textBlockInlineStyle(paperLayout, 'coverExamName'),
    title: textBlockInlineStyle(paperLayout, 'coverTitle'),
    code: textBlockInlineStyle(paperLayout, 'coverCode'),
    noticeTitle: textBlockInlineStyle(paperLayout, 'coverNoticeTitle'),
    noticeItem: textBlockInlineStyle(paperLayout, 'coverNoticeItem'),
    infoLabel: textBlockInlineStyle(paperLayout, 'coverInfoLabel'),
    infoHint: textBlockInlineStyle(paperLayout, 'coverInfoHint'),
  }), [paperLayout])

  // 排序附加块, 把 cover-end 排在最后 (其它 placement 是 header/footer, 不会出现在封面上)
  const coverEndBlocks = (cover.customBlocks ?? []).filter(
    (b) => b.placement !== 'header' && b.placement !== 'footer',
  )

  // ---- 封面自定义块「上下拖动换序」(与题型分区拖拽同款: 实时挤开让位) ----
  const reorderCtl = Boolean(direct && onReorderBlocks && coverEndBlocks.length > 1)
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const reorderRef = useRef<{
    pointerId: number
    from: number
    over: number
    step: number
    startY: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const rowEls = () => (rowsRef.current ? (Array.from(rowsRef.current.children) as HTMLElement[]) : [])

  /** 拖动中按目标槽位给每一行施加位移(源行滑向槽位, 中间行反向让位) */
  const applyRowTransforms = (from: number, over: number) => {
    const s = reorderRef.current
    if (!s) return
    const step = s.step || 1
    for (const el of rowEls()) {
      let ty = 0
      const i = rowEls().indexOf(el)
      if (i === from) ty = (over - from) * step
      else if (from < over && i > from && i <= over) ty = -step
      else if (from > over && i >= over && i < from) ty = step
      el.style.transform = ty ? `translateY(${ty}px)` : ''
    }
  }

  const beginReorder = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!reorderCtl) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const host = rowsRef.current
    if (!host) return
    const el = (e.target as HTMLElement).closest('[data-paper-reorder-block]') as HTMLElement | null
    if (!el || !host.contains(el)) return
    const els = rowEls()
    const from = els.indexOf(el)
    if (from < 0) return
    let gapSum = 0
    let gapCount = 0
    for (let i = 1; i < els.length; i++) {
      const gap = els[i].getBoundingClientRect().top - els[i - 1].getBoundingClientRect().top
      if (Number.isFinite(gap) && gap > 0) {
        gapSum += gap
        gapCount++
      }
    }
    const step = gapCount ? gapSum / gapCount : (els[0]?.offsetHeight ?? 32) + 8
    e.preventDefault()
    e.stopPropagation()
    host.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    host.classList.add('pe-dragging')
    reorderRef.current = { pointerId: e.pointerId, from, over: from, step, startY: e.clientY }
    applyRowTransforms(from, from)
  }

  const moveReorder = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = reorderRef.current
    if (!s || e.pointerId !== s.pointerId) return
    e.preventDefault()
    const n = rowEls().length
    const over = Math.min(n - 1, Math.max(0, s.from + Math.round((e.clientY - s.startY) / s.step)))
    if (over !== s.over) {
      s.over = over
      applyRowTransforms(s.from, over)
    }
  }

  const endReorder = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const s = reorderRef.current
    const host = rowsRef.current
    if (!s || e.pointerId !== s.pointerId) return
    reorderRef.current = null
    host?.classList.remove('pe-dragging')
    try {
      host?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* 指针可能已释放 */
    }
    document.body.style.userSelect = ''
    for (const el of rowEls()) el.style.transform = ''
    if (commit && s.over !== s.from) {
      // 真拖动后抑制本次点击冒泡到画布(避免误选中/误触发命中)
      suppressClickRef.current = true
      onReorderBlocks?.(s.from, s.over)
    }
  }

  const cancelReorder = (e: ReactPointerEvent<HTMLDivElement>) => endReorder(e, false)

  // 卸载时复位 (防指针/样式残留)
  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
    }
  }, [])

  return (
    <div
      className={cn(
        'paper-cover',
        compactCls,
        bare ? undefined : spread ? 'paper-cover-spread' : 'paper-cover-sheet',
        ownPage && !bare ? 'paper-cover-ownpage' : 'paper-cover-inline',
      )}
      style={cssVars as React.CSSProperties}
    >
      {paperLayout && overlays && <PaperLayoutOverlays layout={paperLayout} />}

      {cover.banner && (
        <div {...hit(direct, 'coverBanner')} {...editAttr(direct, 'banner')} className={cn('paper-cover-banner', selCls(pick, 'coverBanner'))} style={tb.banner}>{cover.banner}</div>
      )}

      <div className="paper-cover-head">
        {cover.examName && <div {...hit(direct, 'coverExamName')} {...editAttr(direct, 'examName')} className={cn('paper-cover-exam-name', selCls(pick, 'coverExamName'))} style={tb.examName}>{cover.examName}</div>}
        {cover.title && <div {...hit(direct, 'coverTitle')} {...editAttr(direct, 'title')} className={cn('paper-cover-title', selCls(pick, 'coverTitle'))} style={tb.title}>{cover.title}</div>}
        {cover.codeLine && <div {...hit(direct, 'coverCode')} {...editAttr(direct, 'codeLine')} className={cn('paper-cover-code', selCls(pick, 'coverCode'))} style={tb.code}>{cover.codeLine}</div>}
      </div>

      {cover.noticeTitle && (
        <div {...hit(direct, 'coverNoticeTitle')} {...editAttr(direct, 'noticeTitle')} className={cn('paper-cover-notice-title', selCls(pick, 'coverNoticeTitle'))} style={tb.noticeTitle}>{cover.noticeTitle}</div>
      )}

      {cover.notices && cover.notices.length > 0 && (
        <ol className="paper-cover-notices">
          {cover.notices.map((n, i) => (
            <li key={i} {...hit(direct, 'coverNoticeItem')} {...editAttr(direct, 'notice', i)} className={cn('paper-cover-notice-item', selCls(pick, 'coverNoticeItem'))} style={tb.noticeItem}>
              <span className="paper-cover-notice-no">{i + 1}.</span>
              <span>{n}</span>
            </li>
          ))}
        </ol>
      )}

      {cover.infoHint && (
        <div {...hit(direct, 'coverInfoHint')} {...editAttr(direct, 'infoHint')} className={cn('paper-cover-info-hint', selCls(pick, 'coverInfoHint'))} style={tb.infoHint}>{cover.infoHint}</div>
      )}

      {cover.infoTable && cover.infoTable.length > 0 && (
        <div className="paper-cover-info-table">
          {cover.infoTable.map((row, i) => (
            <div key={i} className="paper-cover-info-row">
              <div {...hit(direct, 'coverInfoLabel')} className={cn('paper-cover-info-label', selCls(pick, 'coverInfoLabel'))} style={tb.infoLabel}>{row.label}</div>
              <div className="paper-cover-info-cells">
                {Array.from({ length: Math.max(0, row.boxes) }, (_, k) => (
                  <span key={k} className="paper-cover-info-box" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {coverEndBlocks.length > 0 && (
        <div
          ref={rowsRef}
          className={cn('paper-cover-custom', reorderCtl && 'pe-reorder')}
          onPointerDown={beginReorder}
          onPointerMove={moveReorder}
          onPointerUp={(e) => endReorder(e, true)}
          onPointerCancel={cancelReorder}
          onClickCapture={(e) => {
            // 拖动换序刚结束的这次点击由拖拽逻辑消费, 不再冒泡给画布命中
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          {cover.customBlocks?.map((b, i) => {
            if (b.placement === 'header' || b.placement === 'footer') return null
            return <CoverTextBlock key={i} block={b} index={i} direct={direct} pick={pick} reorder={reorderCtl} />
          })}
        </div>
      )}
    </div>
  )
}

/** 封面自定义附加块: heading/paragraph 文本可命中直调 size/align/bold (rule 为分隔线不可调) */
function CoverTextBlock({
  block,
  index,
  direct,
  pick,
  reorder,
}: {
  block: ExamTemplateCoverBlock
  index: number
  direct: boolean
  pick: PaperPick | null
  /** 拖动排序可用: 行元素挂上供 pointer 委托命中的标记 */
  reorder?: boolean
}) {
  const hit =
    direct
      ? { 'data-paper-cover-block': index, 'data-paper-hit': '' as const }
      : undefined
  const reorderAttr = reorder ? { 'data-paper-reorder-block': '' as const } : undefined
  // 分隔线仅参与拖动排序, 不可「选中调样式」(因此不挂 data-paper-cover-block 命中标记)
  if (block.kind === 'rule') return <hr {...reorderAttr} className="paper-cover-rule" />
  const sizeCls =
    block.size === 'xl' ? 'text-2xl font-semibold'
    : block.size === 'lg' ? 'text-lg font-semibold'
    : block.size === 'sm' ? 'text-xs'
    : 'text-sm'
  const align = block.align ?? 'left'
  const bold = block.bold ?? (block.size === 'xl' || block.size === 'lg')
  const sel = pick?.kind === 'coverBlock' && pick.index === index ? 'pe-sel' : undefined
  const cls = cn(sizeCls, bold && 'font-semibold', `text-${align}`, sel)
  if (block.kind === 'heading') {
    return (
      <div {...hit} {...reorderAttr} className={cls}>
        {block.text}
      </div>
    )
  }
  return (
    <p {...hit} {...reorderAttr} className={cls}>
      {block.text}
    </p>
  )
}