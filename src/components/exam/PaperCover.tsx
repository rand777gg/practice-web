/**
 * 试卷封面渲染: 与 PaperPreview / PaperOutline 共用 .paper-sheet 排版,
 * 在卷面第一页(整卷前)单独渲染一张封面。
 * 排版 token (纸张/边距/装订线/密封条/水印) 由 layout 提供。
 */
import { useMemo } from 'react'
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
}

/** 命中选中态 class (作用于全部同名文本块) */
function selCls(pick: PaperPick | null, tb: PaperTextBlockKey): string | undefined {
  return pick?.kind === 'tb' && pick.tb === tb ? 'pe-sel' : undefined
}

/** 直调命中: 返回一组 data-* 字面量属性 (direct=false 时不挂) */
function hit(direct: boolean, tb: PaperTextBlockKey): { 'data-paper-tb'?: PaperTextBlockKey; 'data-paper-hit'?: string } {
  return direct ? { 'data-paper-tb': tb, 'data-paper-hit': '' } : {}
}

export function PaperCover({ cover, layout = 'sheet', compact = false, paperLayout, bare = false, overlays = true, direct = false, pick = null }: Props) {
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
        <div {...hit(direct, 'coverBanner')} className={cn('paper-cover-banner', selCls(pick, 'coverBanner'))} style={tb.banner}>{cover.banner}</div>
      )}

      <div className="paper-cover-head">
        {cover.examName && <div {...hit(direct, 'coverExamName')} className={cn('paper-cover-exam-name', selCls(pick, 'coverExamName'))} style={tb.examName}>{cover.examName}</div>}
        {cover.title && <div {...hit(direct, 'coverTitle')} className={cn('paper-cover-title', selCls(pick, 'coverTitle'))} style={tb.title}>{cover.title}</div>}
        {cover.codeLine && <div {...hit(direct, 'coverCode')} className={cn('paper-cover-code', selCls(pick, 'coverCode'))} style={tb.code}>{cover.codeLine}</div>}
      </div>

      {cover.noticeTitle && (
        <div {...hit(direct, 'coverNoticeTitle')} className={cn('paper-cover-notice-title', selCls(pick, 'coverNoticeTitle'))} style={tb.noticeTitle}>{cover.noticeTitle}</div>
      )}

      {cover.notices && cover.notices.length > 0 && (
        <ol className="paper-cover-notices">
          {cover.notices.map((n, i) => (
            <li key={i} {...hit(direct, 'coverNoticeItem')} className={cn('paper-cover-notice-item', selCls(pick, 'coverNoticeItem'))} style={tb.noticeItem}>
              <span className="paper-cover-notice-no">{i + 1}.</span>
              <span>{n}</span>
            </li>
          ))}
        </ol>
      )}

      {cover.infoHint && (
        <div {...hit(direct, 'coverInfoHint')} className={cn('paper-cover-info-hint', selCls(pick, 'coverInfoHint'))} style={tb.infoHint}>{cover.infoHint}</div>
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
        <div className="paper-cover-custom">
          {cover.customBlocks?.map((b, i) => {
            if (b.placement === 'header' || b.placement === 'footer') return null
            return <CoverTextBlock key={i} block={b} index={i} direct={direct} pick={pick} />
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
}: {
  block: ExamTemplateCoverBlock
  index: number
  direct: boolean
  pick: PaperPick | null
}) {
  if (block.kind === 'rule') return <hr className="paper-cover-rule" />
  const sizeCls =
    block.size === 'xl' ? 'text-2xl font-semibold'
    : block.size === 'lg' ? 'text-lg font-semibold'
    : block.size === 'sm' ? 'text-xs'
    : 'text-sm'
  const align = block.align ?? 'left'
  const bold = block.bold ?? (block.size === 'xl' || block.size === 'lg')
  const hit =
    direct
      ? { 'data-paper-cover-block': index, 'data-paper-hit': '' as const }
      : undefined
  const sel = pick?.kind === 'coverBlock' && pick.index === index ? 'pe-sel' : undefined
  const cls = cn(sizeCls, bold && 'font-semibold', `text-${align}`, sel)
  if (block.kind === 'heading') {
    return (
      <div {...hit} className={cls}>
        {block.text}
      </div>
    )
  }
  return (
    <p {...hit} className={cls}>
      {block.text}
    </p>
  )
}