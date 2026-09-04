/**
 * 直调预览 (TemplatePaperPreview): 模板编辑器的所见即所得画布。
 * 以「真实纸张」(mm 尺寸 + CSS transform 等比缩放) 渲染 PaperOutline,
 * 点选标题/分区/封面文字或纸的边缘 → 顶部工具条就地调字号 / 行距 / 段距 / 字族 / 边距。
 * 修改直接写 ExamTemplateLayout (onLayoutChange), 与左侧 PaperLayoutEditor 表单同一份数据。
 */
import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, MousePointerClick, RotateCcw, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/use-t'
import {
  DEFAULT_LAYOUT,
  LAYOUT_FONT_PRESETS,
  PAPER_DIMENSIONS_MM,
  type ExamTemplateLayout,
  type PaperMarginSide,
  type PaperMargins,
  type PaperPick,
  type PaperTextBlockKey,
  type PaperTextBlockStyle,
} from '@/lib/paper-layout'
import type { ExamTemplateCover, ExamTemplateCoverBlock } from '@/lib/paper-cover'
import type { ExamTemplateSection } from '@/types'
import { PaperOutline } from './PaperOutline'

const MM_PX = 96 / 25.4

/** 模板尚未自带 layout 时的编辑基线: 沿用旧预览「显示卷首标题/meta」的观感, 首次点调即以此落库 */
const FALLBACK_LAYOUT: ExamTemplateLayout = { ...DEFAULT_LAYOUT, showPaperTitle: true, showPaperMeta: true }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round1 = (v: number) => Math.round(v * 10) / 10

/** 封面自定义文字块可选字号档位 */
const CB_SIZES: NonNullable<ExamTemplateCoverBlock['size']>[] = ['sm', 'md', 'lg', 'xl']
const sizeLabelKey = (s: string) => `examTemplate.direct.size${s.charAt(0).toUpperCase()}${s.slice(1)}`

interface Props {
  title: string
  meta?: string
  sections: ExamTemplateSection[]
  cover?: ExamTemplateCover | null
  layout?: ExamTemplateLayout | null
  onLayoutChange: (next: ExamTemplateLayout) => void
  /** 封面的任何修改 (含自定义文字块) 由调用方回写 */
  onCoverChange?: (next: ExamTemplateCover | null) => void
  pick: PaperPick | null
  onPick: (p: PaperPick | null) => void
}

/** 覆写单个文本块样式; 与 PaperLayoutEditor.patchTextBlock 同一套「清空即删除」语义 */
function patchTextBlockStyle(
  layout: ExamTemplateLayout,
  tb: PaperTextBlockKey,
  p: Partial<PaperTextBlockStyle>,
): ExamTemplateLayout {
  const cur = layout.textBlocks[tb] ?? {}
  const next = { ...cur, ...p }
  const hasAny = Boolean(next.fontFamily || next.fontSizePt || next.lineHeight || (next.spacingMm !== undefined && next.spacingMm !== null))
  const textBlocks = { ...layout.textBlocks }
  if (hasAny) textBlocks[tb] = next
  else delete textBlocks[tb]
  return { ...layout, textBlocks }
}

const patchMargin = (layout: ExamTemplateLayout, side: PaperMarginSide, mm: number): ExamTemplateLayout => {
  const key = `${side}Mm` as keyof PaperMargins
  return { ...layout, margins: { ...layout.margins, [key]: mm } }
}

export function TemplatePaperPreview({ title, meta, sections, cover, layout, onLayoutChange, onCoverChange, pick, onPick }: Props) {
  const { t } = useT()
  const eff = layout ?? FALLBACK_LAYOUT

  const outerRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [availW, setAvailW] = useState(0)
  const [hostH, setHostH] = useState(0)

  // 画布可用宽度 (决定缩放比)
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth))
    ro.observe(el)
    setAvailW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // 真实纸张布局高度 (未缩放), 驱动缩放占位容器高度
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHostH(el.offsetHeight))
    ro.observe(el)
    setHostH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  const dim = PAPER_DIMENSIONS_MM[eff.paperSize]
  const wMm = eff.orientation === 'landscape' ? dim.height : dim.width
  const realW = wMm * MM_PX
  const scale = availW > 0 ? Math.min(1, Math.max(0.05, (availW - 8) / realW)) : 0
  const scaledW = realW * scale
  const wrapH = hostH * scale

  // Esc 取消选中
  useEffect(() => {
    if (!pick) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick, onPick])

  // 命中文本块的「当前渲染基线」: 未覆写时按元素计算样式估算 (字号 pt / 行距倍 / 段距 mm)
  // 延迟到绘制后读取 DOM 计算样式, 避免渲染期读取 (DOM 属外部系统)
  const [est, setEst] = useState<{ pt: number; lh: number; mm: number } | null>(null)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (pick?.kind !== 'tb') {
        setEst(null)
        return
      }
      const el = hostRef.current?.querySelector<HTMLElement>(`[data-paper-tb="${pick.tb}"]`)
      if (!el) {
        setEst(null)
        return
      }
      const cs = getComputedStyle(el)
      const fsPx = parseFloat(cs.fontSize) || 14
      const lhPx = parseFloat(cs.lineHeight)
      const mbPx = parseFloat(cs.marginBottom) || 0
      setEst({
        pt: round1(fsPx * 0.75),
        lh: round1(Number.isFinite(lhPx) ? lhPx / fsPx : 1.5),
        mm: round1(mbPx / MM_PX),
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [pick, eff, hostH])

  const pickBlock = pick?.kind === 'tb' ? pick.tb : null
  const blockStyle = pickBlock ? eff.textBlocks[pickBlock] : undefined

  const applyBlock = (p: Partial<PaperTextBlockStyle>) => {
    if (!pickBlock) return
    onLayoutChange(patchTextBlockStyle(eff, pickBlock, p))
  }
  const clearBlock = () => {
    if (!pickBlock) return
    onLayoutChange(
      patchTextBlockStyle(eff, pickBlock, { fontFamily: null, fontSizePt: null, lineHeight: null, spacingMm: null }),
    )
  }

  // 封面自定义文字块 (coverBlock): 整块文字直接在画布上改字号/对齐/加粗/文字/删除
  const coverBlocks = cover?.customBlocks ?? []
  const pickCbIx = pick?.kind === 'coverBlock' ? pick.index : -1
  const pickCb = pickCbIx >= 0 ? coverBlocks[pickCbIx] : undefined
  /** 可编辑的封面文字块 (rule 分隔线不可调) */
  const cbTarget: ExamTemplateCoverBlock | null = cover && onCoverChange && pickCb && pickCb.kind !== 'rule' ? pickCb : null
  /** 对齐按钮组: 预先算好 active, 避免在 JSX 回调里二次收窄 */
  const cbAligns = cbTarget
    ? (['left', 'center', 'right'] as const).map((a) => ({ a, active: (cbTarget.align ?? 'left') === a }))
    : []

  const applyCoverBlock = (patch: Partial<ExamTemplateCoverBlock>) => {
    if (!cover || !onCoverChange || pickCbIx < 0 || !pickCb || pickCb.kind === 'rule') return
    onCoverChange({
      ...cover,
      customBlocks: coverBlocks.map((b, i) => (i === pickCbIx ? { ...b, ...patch } : b)),
    })
  }
  const deleteCoverBlock = () => {
    if (!cover || !onCoverChange || pickCbIx < 0) return
    const next = coverBlocks.filter((_, i) => i !== pickCbIx)
    onCoverChange({ ...cover, customBlocks: next.length ? next : null })
    onPick(null)
  }
  const dragMargin = (side: PaperMarginSide, mm: number) => onLayoutChange(patchMargin(eff, side, mm))

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 顶部工具条: 常显 (未选中=提示, 选中=微调控件) */}
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background/80 px-2 py-1">
        {!pick && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
            {t('examTemplate.direct.hint')}
          </span>
        )}

        {pick?.kind === 'tb' && (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {t(`examTemplate.layout.tb.${pick.tb}`)}
              </span>
              <span className="hidden whitespace-nowrap text-[10px] text-muted-foreground md:inline">
                {t('examTemplate.direct.scopeNote')}
              </span>
            </span>

            <span className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{t('examTemplate.layout.tbFont')}</span>
              <select
                className="h-6 w-[92px] rounded-md border border-input bg-transparent px-1 text-[11px] outline-none"
                value={blockStyle?.fontFamily ?? ''}
                onChange={(e) => applyBlock({ fontFamily: e.target.value || null })}
              >
                {LAYOUT_FONT_PRESETS.map((f) => (
                  <option key={f.labelKey} value={f.value}>{t(`examTemplate.layout.${f.labelKey}`)}</option>
                ))}
              </select>
            </span>

            <FieldStepper
              label={t('examTemplate.layout.tbSize')}
              value={blockStyle?.fontSizePt ?? est?.pt ?? null}
              suffix="pt"
              step={0.5}
              digits={1}
              min={6}
              max={40}
              onChange={(v) => applyBlock({ fontSizePt: v })}
            />
            <FieldStepper
              label={t('examTemplate.layout.lineHeight')}
              value={blockStyle?.lineHeight ?? est?.lh ?? null}
              suffix="×"
              step={0.1}
              digits={1}
              min={1}
              max={3}
              onChange={(v) => applyBlock({ lineHeight: v })}
            />
            <FieldStepper
              label={t('examTemplate.layout.tbSpacing')}
              value={blockStyle?.spacingMm ?? est?.mm ?? null}
              suffix="mm"
              step={0.5}
              digits={1}
              min={0}
              max={10}
              onChange={(v) => applyBlock({ spacingMm: v })}
            />

            <button
              type="button"
              title={t('examTemplate.direct.clearBlock')}
              className="flex h-6 items-center gap-1 rounded-md border border-input px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={clearBlock}
            >
              <RotateCcw className="h-3 w-3" />
              {t('examTemplate.layout.reset')}
            </button>
          </>
        )}

        {pick?.kind === 'margin' && (
          <>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              {t(`examTemplate.layout.margin.${pick.side}`)}
              {t('examTemplate.direct.marginWord')}
            </span>
            <FieldStepper
              label={t('examTemplate.layout.marginsGroup')}
              value={eff.margins[`${pick.side}Mm`]}
              suffix="mm"
              step={0.5}
              digits={1}
              min={0}
              max={50}
              onChange={(v) => onLayoutChange(patchMargin(eff, pick.side, v))}
            />
            <span className="hidden whitespace-nowrap text-[10px] text-muted-foreground xl:inline">
              {t('examTemplate.direct.dragHint')}
            </span>
          </>
        )}

        {pick?.kind === 'coverBlock' && (
          <>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              {t('examTemplate.direct.coverBlock')} · {pickCbIx + 1}
            </span>
            {cbTarget && (
              <>
                <input
                  className="h-6 w-44 min-w-0 rounded-md border border-input bg-transparent px-1.5 text-[11px] outline-none"
                  value={cbTarget.text ?? ''}
                  placeholder={t('examTemplate.direct.cbText')}
                  onChange={(e) => applyCoverBlock({ text: e.target.value })}
                />
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{t('examTemplate.direct.cbSize')}</span>
                  <select
                    className="h-6 rounded-md border border-input bg-transparent px-1 text-[11px] outline-none"
                    value={cbTarget.size ?? 'md'}
                    onChange={(e) => applyCoverBlock({ size: e.target.value as ExamTemplateCoverBlock['size'] })}
                  >
                    {CB_SIZES.map((s) => (
                      <option key={s} value={s}>{t(sizeLabelKey(s))}</option>
                    ))}
                  </select>
                </span>
                <span className="flex items-center gap-0.5" title={t('examTemplate.direct.cbAlign')}>
                  {cbAligns.map(({ a, active }) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    return (
                      <button
                        key={a}
                        type="button"
                        title={t(`examTemplate.direct.align${a.charAt(0).toUpperCase()}${a.slice(1)}`)}
                        className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                        onClick={() => applyCoverBlock({ align: a })}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    )
                  })}
                </span>
                <button
                  type="button"
                  title={t('examTemplate.direct.cbBold')}
                  className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] ${
                    cbTarget.bold
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  onClick={() => applyCoverBlock({ bold: !cbTarget.bold })}
                >
                  <Bold className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title={t('examTemplate.direct.cbDelete')}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={deleteCoverBlock}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* 等比缩放画布 */}
      <div ref={outerRef} className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30">
        <div className="relative mx-auto my-2" style={{ width: scaledW, height: wrapH }}>
          <div
            ref={hostRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: realW,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <PaperOutline
              title={title}
              meta={meta}
              sections={sections}
              cover={cover}
              paperLayout={layout}
              direct
              pick={pick}
              onPick={onPick}
              onMarginDrag={dragMargin}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** 一个 [- val +] 步进控件; value=null 表示「继承中」(首次点击时以基准值起步) */
function FieldStepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  digits,
  suffix,
}: {
  label: string
  value: number | null
  onChange: (v: number) => void
  step: number
  min: number
  max: number
  digits: number
  suffix: string
}) {
  const btn = 'flex h-5 w-5 items-center justify-center rounded border border-input text-[11px] leading-none text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40'
  const base = value ?? clamp(min, min, max)
  return (
    <span className="flex items-center gap-1" title={label}>
      <button
        type="button"
        className={btn}
        disabled={value !== null && base - step < min}
        onClick={() => onChange(clamp(round1(base - step), min, max))}
      >
        −
      </button>
      <span className="min-w-10 text-center text-[11px] tabular-nums">
        {value === null ? '—' : `${value.toFixed(digits)}${suffix}`}
      </span>
      <button
        type="button"
        className={btn}
        disabled={value !== null && base + step > max}
        onClick={() => onChange(clamp(round1(base + step), min, max))}
      >
        +
      </button>
    </span>
  )
}
