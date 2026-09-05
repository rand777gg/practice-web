import { useRef, useState } from 'react'
import { PaperCover } from './PaperCover'
import { PaperSheetStyles } from './paper-sheet-styles'
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { hasCoverContent, type ExamTemplateCover } from '@/lib/paper-cover'
import {
  layoutToCssVars,
  textBlockInlineStyle,
  type ExamTemplateLayout,
  type PaperMarginSide,
  type PaperPick,
  type PaperTextBlockKey,
  type PaperTextEditReq,
} from '@/lib/paper-layout'
import { useT } from '@/i18n/use-t'
import type { ExamTemplateSection, QuestionType } from '@/types'

interface Props {
  title: string
  meta?: string
  /** 编辑器里的草稿分区, 改动会实时反映到卷面上 */
  sections: ExamTemplateSection[]
  className?: string
  /** 侧栏缩排卷: 宽度自适应容器、单栏, 默认摊开双栏 */
  compact?: boolean
  /** 可选封面: 编辑器里同步展示 */
  cover?: ExamTemplateCover | null
  /** 排版 token: 编辑器里同步展示 */
  paperLayout?: ExamTemplateLayout | null
  /** 直调编辑态: 真实纸张 + 元素命中标记; compact 应保持 false */
  direct?: boolean
  /** 当前命中选中 (direct 时有效), 同名文本块全部高亮 */
  pick?: PaperPick | null
  /** 点击命中回调 (direct 时); 点空白/非命中元素 = null */
  onPick?: (p: PaperPick | null) => void
  /** 双击文字回调 (direct 时): 由上层画布就地编辑该文字内容 */
  onEditText?: (req: PaperTextEditReq, el: HTMLElement) => void
  /** 边距热区拖拽回调 (direct 时): 手指在纸上直接拉边距 */
  onMarginDrag?: (side: PaperMarginSide, mm: number) => void
  /** 封面自定义块上下拖动换序 (direct 时): 放下回调可视槽位 from → to */
  onReorderCoverBlocks?: (from: number, to: number) => void
}

/** 直调命中: 返回一组 data-* 字面量属性 (direct=false 时不挂) */
function hit(direct: boolean, tb: PaperTextBlockKey): { 'data-paper-tb'?: PaperTextBlockKey; 'data-paper-hit'?: string } {
  return direct ? { 'data-paper-tb': tb, 'data-paper-hit': '' } : {}
}

/** 命中选中态 class (作用于全部同名文本块) */
function selCls(pick: PaperPick | null, tb: PaperTextBlockKey): string | undefined {
  return pick?.kind === 'tb' && pick.tb === tb ? 'pe-sel' : undefined
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
const VISIBLE_PER_SECTION = 3

/** 稳定宽度(不用随机数, 避免每次渲染抖动) */
function width(no: number, k: number): string {
  return `${58 + ((no * 37 + k * 13) % 38)}%`
}

/**
 * 试卷骨架: 用真实卷面版式呈现模板的分区结构(题型/题数/分值/分类), 题目本身是占位行。
 * 与 PaperPreview 共用纸张样式, 让编辑模板时看到的就是将来发到手上的那张纸。
 */
export function PaperOutline({ title, meta, sections, className, compact, cover, paperLayout, direct = false, pick = null, onPick, onEditText, onMarginDrag, onReorderCoverBlocks }: Props) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  // direct(直调编辑) = 真实纸张(不缩排、不分栏), 由外层缩放包装
  const sheetLayout: 'sheet' | 'spread' = compact ? 'sheet' : direct ? 'sheet' : 'spread'
  const cssVars = paperLayout ? layoutToCssVars(paperLayout, sheetLayout) : undefined
  const showTitle = paperLayout ? paperLayout.showPaperTitle : true
  const showMeta = paperLayout ? paperLayout.showPaperMeta : true
  const tbPaperTitle = textBlockInlineStyle(paperLayout, 'paperTitle')
  const tbPaperMeta = textBlockInlineStyle(paperLayout, 'paperMeta')
  const tbSectionTitle = textBlockInlineStyle(paperLayout, 'sectionTitle')

  const handlePaperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPick) return
    const target = e.target as HTMLElement
    const m = target.closest('[data-paper-margin]')
    if (m) {
      const side = m.getAttribute('data-paper-margin') as PaperMarginSide | null
      if (side) return onPick({ kind: 'margin', side })
    }
    const cb = target.closest('[data-paper-cover-block]')
    if (cb) {
      const index = Number(cb.getAttribute('data-paper-cover-block'))
      if (Number.isFinite(index)) return onPick({ kind: 'coverBlock', index })
    }
    const tbEl = target.closest('[data-paper-tb]')
    if (tbEl) {
      const tb = tbEl.getAttribute('data-paper-tb') as PaperTextBlockKey | null
      if (tb) return onPick({ kind: 'tb', tb })
    }
    onPick(null)
  }

  /** 双击文字 → 上层面板就地编辑; 只放行「有数据可写」的文字 (封面字段/卷首标题) */
  const handlePaperDblClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onEditText) return
    const target = e.target as HTMLElement
    const cf = target.closest('[data-cover-field]') as HTMLElement | null
    if (cf) {
      const field = cf.getAttribute('data-cover-field')
      if (!field) return
      e.preventDefault()
      const ix = cf.getAttribute('data-cover-index')
      return onEditText({ kind: 'coverField', field, index: ix === null ? undefined : Number(ix) }, cf)
    }
    const tbEl = target.closest('[data-paper-tb="paperTitle"]') as HTMLElement | null
    if (tbEl) {
      e.preventDefault()
      return onEditText({ kind: 'paperTitle' }, tbEl)
    }
  }

  let cursor = 0
  const groups = sections.map((s) => {
    const count = Math.max(0, Math.round(s.count) || 0)
    const items = Array.from({ length: count }, () => ++cursor)
    return { section: s, count, items }
  })
  const total = groups.reduce((n, g) => n + g.count, 0)
  const hasHidden = groups.some((g) => g.items.length > VISIBLE_PER_SECTION)

  return (
    <>
      <PaperSheetStyles />
      <div
        className={cn(
          'paper-sheet',
          compact ? 'paper-sheet-compact' : direct ? undefined : 'paper-sheet-spread',
          direct && 'paper-sheet-direct',
          className,
        )}
        style={cssVars as React.CSSProperties}
        onClick={direct ? handlePaperClick : undefined}
        onDoubleClick={direct && onEditText ? handlePaperDblClick : undefined}
      >
        {hasCoverContent(cover) && (
          <PaperCover cover={cover!} layout={sheetLayout} compact={compact} paperLayout={paperLayout} direct={direct} pick={pick} onReorderBlocks={direct ? onReorderCoverBlocks : undefined} />
        )}

        <header className={cn('text-center', compact ? 'mb-3' : 'mb-5')}>
          {showTitle && (
            <h1
              {...hit(direct, 'paperTitle')}
              className={cn(
                'font-semibold tracking-wide',
                compact ? 'text-base' : 'text-lg',
                !title && 'text-muted-foreground/60',
                selCls(pick, 'paperTitle'),
              )}
              style={tbPaperTitle}
            >
              {title || t('examTemplate.untitledPaper')}
            </h1>
          )}
          {showMeta && meta && (
            <p
              {...hit(direct, 'paperMeta')}
              className={cn('mt-1 text-xs text-muted-foreground', selCls(pick, 'paperMeta'))}
              style={tbPaperMeta}
            >
              {meta}
            </p>
          )}
          <div className={cn((showTitle || showMeta) && 'mt-3 border-t border-double border-t-4 border-foreground pt-2', 'text-xs text-muted-foreground')}>
            <span>{t('paperPreview.totalHint').replace('{n}', String(total))}</span>
            {hasHidden && (
              <button
                type="button"
                className="paper-no-print rounded border px-1.5 text-[10px] leading-5 hover:bg-accent"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? t('examTemplate.outlineCollapse') : t('examTemplate.outlineExpandAll')}
              </button>
            )}
          </div>
        </header>

        {total === 0 && (
          <p className="rounded border border-dashed py-8 text-center text-xs text-muted-foreground">
            {t('examTemplate.outlineEmpty')}
          </p>
        )}

        <div className={compact ? undefined : 'paper-columns'}>
          {groups.map((g, si) => {
            const shown = expanded ? g.items : g.items.slice(0, VISIBLE_PER_SECTION)
            const rest = g.items.length - shown.length
            const secScore = g.count * Math.max(0, g.section.score || 0)
            return (
              <section key={g.section.id ?? si} className={cn('paper-sec', compact ? 'mb-3' : 'mb-4')}>
                <div className="paper-sec-head mb-2 flex items-end justify-between border-b border-foreground/15 pb-1">
                  <h2
                    {...hit(direct, 'sectionTitle')}
                    className={cn('text-sm font-semibold', selCls(pick, 'sectionTitle'))}
                    style={tbSectionTitle}
                  >
                    {CN_NUM[si] ?? si + 1}、{g.section.type ? QUESTION_TYPE_LABELS[g.section.type] : t('examTemplate.anyType')}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      （{g.section.score > 0
                        ? t('paperPreview.sectionHint')
                          .replace('{n}', String(g.count))
                          .replace('{s}', String(g.section.score))
                          .replace('{t}', String(secScore))
                        : t('paperPreview.sectionHintNoScore').replace('{n}', String(g.count))}）
                    </span>
                  </h2>
                  <span className="shrink-0 border border-foreground/35 px-3 text-[10px] leading-5 text-muted-foreground">
                    {t('paperPreview.scoreBox')}
                  </span>
                </div>

                {(g.section.subject?.length ?? 0) > 0 && (
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    {t('examTemplate.subject')}: {g.section.subject?.join('、')}
                  </p>
                )}

                {(g.section.categories?.length ?? 0) > 0 && (
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    {t('examTemplate.outlineCategories')}
                    {g.section.categories.join('、')}
                  </p>
                )}

                <ol className="space-y-3">
                  {shown.map((no) => (
                    <li key={no} className="paper-q">
                      <div className="flex gap-2">
                        <span className="shrink-0 tabular-nums">{no}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="space-y-1">
                            <div className="paper-sk h-3.5" style={{ width: width(no, 0) }} />
                            <div className="paper-sk h-3.5" style={{ width: width(no, 1) }} />
                          </div>
                          <SkeletonBody type={g.section.type} no={no} />
                        </div>
                      </div>
                    </li>
                  ))}
                  {rest > 0 && (
                    <li className="paper-q">
                      <button
                        type="button"
                        className="paper-no-print text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setExpanded(true)}
                      >
                        ⋯ {t('examTemplate.outlineRest').replace('{n}', String(rest))}
                      </button>
                    </li>
                  )}
                </ol>
              </section>
            )
          })}
        </div>

        {direct && paperLayout && (
          <MarginHotspots
            layout={paperLayout}
            pick={pick}
            onSelect={(side) => onPick?.({ kind: 'margin', side })}
            onDrag={onMarginDrag}
          />
        )}
      </div>
    </>
  )
}

/** 一次边距拖拽的进行中状态 */
interface MarginDragState {
  side: PaperMarginSide
  /** pointerdown 时的指针坐标 (screen px) */
  startX: number
  startY: number
  /** pointerdown 时的边距值 (mm) */
  base: number
  /** 屏幕上 1mm 对应的像素 (px), 由纸张实际渲染宽度换算 */
  pxPerMm: number
  /** 是否发生真实拖动 (按下即抬 = 仅选中) */
  moved: boolean
}

/** 直调编辑态的四边距热区: 点击选中由工具条微调, 按住可直接拖拽拉边距 */
function MarginHotspots({
  layout,
  pick,
  onSelect,
  onDrag,
}: {
  layout: ExamTemplateLayout
  pick: PaperPick | null
  onSelect?: (side: PaperMarginSide) => void
  onDrag?: (side: PaperMarginSide, mm: number) => void
}) {
  const dragRef = useRef<MarginDragState | null>(null)
  const sides: { side: PaperMarginSide; key: keyof ExamTemplateLayout['margins'] }[] = [
    { side: 'top', key: 'topMm' },
    { side: 'right', key: 'rightMm' },
    { side: 'bottom', key: 'bottomMm' },
    { side: 'left', key: 'leftMm' },
  ]

  const handleDown = (e: React.PointerEvent<HTMLDivElement>, side: PaperMarginSide) => {
    if (e.button !== 0) return
    // 阻止兼容的 mousedown/click, 避免拖完再触发命中判定; 选中由这里直接设置
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget
    const sheet = el.closest('.paper-sheet') as HTMLElement | null
    if (!sheet) return
    const rect = sheet.getBoundingClientRect()
    const wMm = parseFloat(getComputedStyle(sheet).getPropertyValue('--paper-width')) || 210
    if (!(rect.width > 0) || !(wMm > 0)) return
    dragRef.current = {
      side,
      startX: e.clientX,
      startY: e.clientY,
      base: layout.margins[`${side}Mm`],
      pxPerMm: rect.width / wMm,
      moved: false,
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* 某些输入类型不支持 capture, 忽略 */
    }
    onSelect?.(side)
  }

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.startX) / d.pxPerMm
    const dy = (e.clientY - d.startY) / d.pxPerMm
    // 语义: 把内容边缘往纸中心方向拉 = 对应边距变大 (top/bottom/left 取正, right 反向)
    const delta = d.side === 'top' ? dy : d.side === 'bottom' ? -dy : d.side === 'left' ? dx : -dx
    const mm = d.base + delta
    const v = Math.min(50, Math.max(0, Math.round(mm * 10) / 10))
    if (Math.abs(mm - d.base) > 0.01) d.moved = true
    onDrag?.(d.side, v)
  }

  const handleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 已在 up 前释放 */
    }
    dragRef.current = null
  }

  return (
    <>
      {sides.map(({ side, key }) => (
        <div
          key={side}
          data-paper-margin={side}
          data-paper-hit=""
          data-paper-margin-value={layout.margins[key]}
          className={cn('pe-margin', `pe-margin-${side}`, pick?.kind === 'margin' && pick.side === side && 'pe-sel')}
          onPointerDown={(e) => handleDown(e, side)}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        />
      ))}
    </>
  )
}

function SkeletonBody({ type, no }: { type: QuestionType | null; no: number }) {
  const { t } = useT()

  if (type === 'single_choice' || type === 'multi_select') {
    const round = type === 'single_choice' ? 'rounded-full' : 'rounded-sm'
    return (
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn('h-4 w-4 shrink-0 border border-foreground/40', round)} />
            <span className="shrink-0 text-xs font-medium">{OPTION_LABELS[i]}.</span>
            <span className="paper-sk h-3 flex-1" style={{ width: width(no, i + 2) }} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'true_false' || type === 'judge_correct') {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex gap-5">
          {[t('paper.correct'), t('paper.wrong')].map((label) => (
            <span key={label} className="flex items-center gap-1.5 text-xs">
              <span className="h-4 w-4 rounded-full border border-foreground/40" />
              {label}
            </span>
          ))}
        </div>
        {type === 'judge_correct' && <div className="paper-sk h-3 w-2/3" />}
      </div>
    )
  }

  if (type === 'fill_blank') {
    return (
      <div className="mt-2 flex flex-wrap gap-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="text-xs text-muted-foreground">({i + 1})</span>
            <span className="h-3.5 w-24 border-b border-foreground/35" />
          </span>
        ))}
      </div>
    )
  }

  if (type === 'coding') {
    return (
      <div className="mt-2">
        <p className="mb-1 text-xs text-muted-foreground">{t('paper.codingHint')}</p>
        <div className={cn('rounded border border-dashed border-foreground/25 p-2', no % 2 === 0 ? 'h-16' : 'h-12')} />
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className={cn('rounded border border-dashed border-foreground/25 p-2', type === 'analysis' ? 'h-20' : 'h-12')} />
    </div>
  )
}
