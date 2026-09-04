/**
 * 试卷排版编辑器 (PaperLayoutEditor): 表单编辑 ExamTemplateLayout 的所有 token。
 * 在 ExamTemplateEditorDialog 的 layout tab 里渲染。
 * 修改通过 onChange 传出, 由父组件统一管理保存。
 */
import { useEffect } from 'react'
import { useT } from '@/i18n/use-t'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_LAYOUT,
  LAYOUT_FONT_PRESETS,
  type PaperPick,
  type ExamTemplateLayout,
  type PaperSize,
  type BinderSide,
  type SealPosition,
  type ScoreBoxMode,
  type PaperAdditionalBlock,
  type PaperTextBlockKey,
  type PaperTextBlockStyle,
  type PaperMarginSide,
} from '@/lib/paper-layout'

interface Props {
  value: ExamTemplateLayout | null
  onChange: (next: ExamTemplateLayout) => void
  /** 预览直调命中的目标: 高亮并滚动到对应表单行/边距输入 */
  activePick?: PaperPick | null
}

const PAPER_SIZES: PaperSize[] = ['A4', 'A3', 'B5', 'Letter']
const BINDER_SIDES: { value: BinderSide; key: string }[] = [
  { value: 'none', key: 'none' },
  { value: 'left', key: 'left' },
  { value: 'right', key: 'right' },
  { value: 'top', key: 'top' },
]
const SEAL_POSITIONS: { value: SealPosition; key: string }[] = [
  { value: 'none', key: 'none' },
  { value: 'top-center', key: 'topCenter' },
  { value: 'top-left', key: 'topLeft' },
]
const SCORE_BOX_MODES: { value: ScoreBoxMode; key: string }[] = [
  { value: 'always', key: 'always' },
  { value: 'optional', key: 'optional' },
  { value: 'none', key: 'none' },
]

/** 可独立调字体的文本块 */
const TEXT_BLOCK_KEYS: PaperTextBlockKey[] = [
  'coverBanner',
  'coverExamName',
  'coverTitle',
  'coverCode',
  'coverNoticeTitle',
  'coverNoticeItem',
  'coverInfoLabel',
  'coverInfoHint',
  'paperTitle',
  'paperMeta',
  'sectionTitle',
  'questionStem',
  'questionOption',
]

const fieldCls = 'h-8 text-xs'
const numCls = `${fieldCls} w-20`
const selectCls = 'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function PaperLayoutEditor({ value, onChange, activePick }: Props) {
  const { t } = useT()
  const layout: ExamTemplateLayout = value ?? DEFAULT_LAYOUT

  // 预览直调选中 → 表单对应行/输入框就近滚动(可见时不动)
  useEffect(() => {
    if (!activePick) return
    const id =
      activePick.kind === 'tb'
        ? `pl-row-${activePick.tb}`
        : activePick.kind === 'margin'
          ? `pl-margin-${activePick.side}`
          : null
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activePick])

  const patch = (p: Partial<ExamTemplateLayout>) => onChange({ ...layout, ...p })
  const patchMargin = (key: keyof ExamTemplateLayout['margins'], v: number) =>
    patch({ margins: { ...layout.margins, [key]: v } })
  const patchBinder = (p: Partial<ExamTemplateLayout['binderLine']>) =>
    patch({ binderLine: { ...layout.binderLine, ...p } })
  const patchSeal = (p: Partial<ExamTemplateLayout['sealBand']>) =>
    patch({ sealBand: { ...layout.sealBand, ...p } })
  const patchWatermark = (p: Partial<ExamTemplateLayout['watermark']>) =>
    patch({ watermark: { ...layout.watermark, ...p } })
  const patchHF = (p: Partial<ExamTemplateLayout['headerFooter']>) =>
    patch({ headerFooter: { ...layout.headerFooter, ...p } })

  const patchTextBlock = (key: PaperTextBlockKey, p: Partial<PaperTextBlockStyle>) => {
    const cur = layout.textBlocks[key] ?? {}
    // 清空字段 → 删除该 key 上无意义的空样式
    const next = { ...cur, ...p }
    const hasAny = Boolean(next.fontFamily || next.fontSizePt || next.lineHeight || (next.spacingMm !== undefined && next.spacingMm !== null))
    const blocks = { ...layout.textBlocks }
    if (hasAny) blocks[key] = next
    else delete blocks[key]
    patch({ textBlocks: blocks })
  }

  const setAdditionalBlocks = (next: PaperAdditionalBlock[]) => patch({ additionalBlocks: next })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.layout.hint')}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={() => onChange({ ...DEFAULT_LAYOUT })}
        >
          <RotateCcw className="h-3 w-3" /> {t('examTemplate.layout.reset')}
        </Button>
      </div>

      {/* 纸张 + 方向 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.paperGroup')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.paperSize')}</Label>
            <select
              className={selectCls}
              value={layout.paperSize}
              onChange={(e) => patch({ paperSize: e.target.value as PaperSize })}
            >
              {PAPER_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.orientation')}</Label>
            <select
              className={selectCls}
              value={layout.orientation}
              onChange={(e) => patch({ orientation: e.target.value as 'portrait' | 'landscape' })}
            >
              <option value="portrait">{t('examTemplate.layout.portrait')}</option>
              <option value="landscape">{t('examTemplate.layout.landscape')}</option>
            </select>
          </div>
        </div>
      </section>

      {/* 边距 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.marginsGroup')}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(['topMm', 'rightMm', 'bottomMm', 'leftMm'] as const).map((k) => {
            const side = k.replace('Mm', '') as PaperMarginSide
            const active = activePick?.kind === 'margin' && activePick.side === side
            return (
              <div key={k} className="space-y-1">
                <Label className="text-[10px]">{t(`examTemplate.layout.margin.${k.replace('Mm', '')}`)}</Label>
                <Input
                  id={`pl-margin-${side}`}
                  className={cn(numCls, active && 'ring-1 ring-ring')}
                  type="number"
                  min={0}
                  max={50}
                  value={layout.margins[k]}
                  onChange={(e) => patchMargin(k, Number(e.target.value))}
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* 字号 + 行高 + 分栏 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.typographyGroup')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.baseFontPt')}</Label>
            <Input
              className={numCls}
              type="number"
              min={8}
              max={18}
              step={0.5}
              value={layout.baseFontPt}
              onChange={(e) => patch({ baseFontPt: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.lineHeight')}</Label>
            <Input
              className={numCls}
              type="number"
              min={1}
              max={3}
              step={0.1}
              value={layout.lineHeight}
              onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.columns')}</Label>
            <select
              className={selectCls}
              value={layout.columns}
              onChange={(e) => patch({ columns: Number(e.target.value) as 1 | 2 | 3 | 4 })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 装订线 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.binderGroup')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.binderSide')}</Label>
            <select
              className={selectCls}
              value={layout.binderLine.side}
              onChange={(e) => patchBinder({ side: e.target.value as BinderSide })}
            >
              {BINDER_SIDES.map((b) => (
                <option key={b.value} value={b.value}>{t(`examTemplate.layout.binder.${b.key}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.binderOffset')}</Label>
            <Input
              className={numCls}
              type="number"
              min={0}
              max={30}
              value={layout.binderLine.offsetMm}
              onChange={(e) => patchBinder({ offsetMm: Number(e.target.value) })}
              disabled={layout.binderLine.side === 'none'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.binderWidth')}</Label>
            <Input
              className={numCls}
              type="number"
              min={0}
              max={5}
              step={0.5}
              value={layout.binderLine.widthMm}
              onChange={(e) => patchBinder({ widthMm: Number(e.target.value) })}
              disabled={layout.binderLine.side === 'none'}
            />
          </div>
        </div>
      </section>

      {/* 密封条 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.sealGroup')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.sealPosition')}</Label>
            <select
              className={selectCls}
              value={layout.sealBand.position}
              onChange={(e) => patchSeal({ position: e.target.value as SealPosition })}
            >
              {SEAL_POSITIONS.map((s) => (
                <option key={s.value} value={s.value}>{t(`examTemplate.layout.seal.${s.key}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('examTemplate.layout.sealText')}</Label>
            <Input
              className={fieldCls}
              value={layout.sealBand.text}
              onChange={(e) => patchSeal({ text: e.target.value })}
              disabled={layout.sealBand.position === 'none'}
              placeholder={t('examTemplate.layout.sealTextPlaceholder')}
            />
          </div>
        </div>
        {layout.sealBand.position !== 'none' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('examTemplate.layout.sealOffset')}</Label>
              <Input
                className={numCls}
                type="number"
                min={0}
                max={20}
                value={layout.sealBand.offsetMm}
                onChange={(e) => patchSeal({ offsetMm: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('examTemplate.layout.sealHeight')}</Label>
              <Input
                className={numCls}
                type="number"
                min={2}
                max={20}
                value={layout.sealBand.heightMm}
                onChange={(e) => patchSeal({ heightMm: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('examTemplate.layout.sealFontSize')}</Label>
              <Input
                className={numCls}
                type="number"
                min={6}
                max={16}
                value={layout.sealBand.fontSizePt}
                onChange={(e) => patchSeal({ fontSizePt: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
      </section>

      {/* 水印 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('examTemplate.layout.watermarkGroup')}
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={layout.watermark.enabled}
              onChange={(e) => patchWatermark({ enabled: e.target.checked })}
            />
            {t('examTemplate.layout.watermarkEnabled')}
          </label>
        </div>
        {layout.watermark.enabled && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">{t('examTemplate.layout.watermarkText')}</Label>
              <Input
                className={fieldCls}
                value={layout.watermark.text}
                onChange={(e) => patchWatermark({ text: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('examTemplate.layout.watermarkOpacity')}</Label>
                <Input
                  className={numCls}
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layout.watermark.opacity}
                  onChange={(e) => patchWatermark({ opacity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('examTemplate.layout.watermarkRotation')}</Label>
                <Input
                  className={numCls}
                  type="number"
                  min={-90}
                  max={90}
                  value={layout.watermark.rotationDeg}
                  onChange={(e) => patchWatermark({ rotationDeg: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('examTemplate.layout.watermarkSize')}</Label>
                <Input
                  className={numCls}
                  type="number"
                  min={16}
                  max={200}
                  value={layout.watermark.fontSizePt}
                  onChange={(e) => patchWatermark({ fontSizePt: Number(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* 整卷字族 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.fontFamilyGroup')}
        </div>
        <select
          className={selectCls}
          value={layout.fontFamily ?? ''}
          onChange={(e) => patch({ fontFamily: e.target.value || null })}
        >
          {LAYOUT_FONT_PRESETS.map((f) => (
            <option key={f.labelKey} value={f.value}>{t(`examTemplate.layout.${f.labelKey}`)}</option>
          ))}
        </select>
      </section>

      {/* 封面独占页 + 卷首抬头 */}
      <section className="space-y-2 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.paperHeadGroup')}
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={layout.coverOwnPage}
            onChange={(e) => patch({ coverOwnPage: e.target.checked })}
          />
          {t('examTemplate.layout.coverOwnPage')}
        </label>
        <p className="pl-4 text-[10px] text-muted-foreground">{t('examTemplate.layout.coverOwnPageHint')}</p>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={layout.showPaperTitle}
            onChange={(e) => patch({ showPaperTitle: e.target.checked })}
          />
          {t('examTemplate.layout.showPaperTitle')}
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={layout.showPaperMeta}
            onChange={(e) => patch({ showPaperMeta: e.target.checked })}
          />
          {t('examTemplate.layout.showPaperMeta')}
        </label>
      </section>

      {/* 各区块字体样式表 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.textBlocksGroup')}
        </div>
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.layout.textBlocksHint')}</p>
        <div className="grid grid-cols-[minmax(64px,1fr)_auto] gap-1.5">
          {/* 表头 */}
          <div />
          <div className="flex items-center gap-1">
            <span className="w-9 text-center text-[9px] leading-none text-muted-foreground">{t('examTemplate.layout.tbFont')}</span>
            <span className="w-10 text-center text-[9px] leading-none text-muted-foreground">{t('examTemplate.layout.tbSize')}</span>
            <span className="w-10 text-center text-[9px] leading-none text-muted-foreground">{t('examTemplate.layout.tbSpacing')}</span>
          </div>

          {TEXT_BLOCK_KEYS.map((key) => {
            const s = layout.textBlocks[key]
            const active = activePick?.kind === 'tb' && activePick.tb === key
            return (
              <FragmentRow
                key={key}
                label={t(`examTemplate.layout.tb.${key}`)}
                active={active}
                anchorId={`pl-row-${key}`}
              >
                <div className={cn('flex items-center gap-1', active && '-mx-0.5 rounded-md px-0.5 ring-1 ring-ring/80')}>
                  <select
                    className="h-7 w-24 rounded-md border border-input bg-transparent px-1 text-[10px] outline-none"
                    value={s?.fontFamily ?? ''}
                    onChange={(e) => patchTextBlock(key, { fontFamily: e.target.value || null })}
                  >
                    {LAYOUT_FONT_PRESETS.map((f) => (
                      <option key={f.labelKey} value={f.value}>{t(`examTemplate.layout.${f.labelKey}`)}</option>
                    ))}
                  </select>
                  <Input
                    className="h-7 w-10 px-1 text-center text-[10px]"
                    type="number"
                    min={6}
                    max={40}
                    step={0.5}
                    placeholder="—"
                    title={t('examTemplate.layout.tbSize')}
                    value={s?.fontSizePt ?? ''}
                    onChange={(e) => patchTextBlock(key, { fontSizePt: e.target.value ? Number(e.target.value) : null })}
                  />
                  <Input
                    className="h-7 w-10 px-1 text-center text-[10px]"
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    placeholder="—"
                    title={t('examTemplate.layout.tbSpacing')}
                    value={s?.spacingMm ?? ''}
                    onChange={(e) => patchTextBlock(key, { spacingMm: e.target.value !== '' ? Number(e.target.value) : null })}
                  />
                </div>
              </FragmentRow>
            )
          })}
        </div>
      </section>

      {/* 页眉页脚 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.headerFooterGroup')}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('examTemplate.layout.headerText')}</Label>
          <Input
            className={fieldCls}
            value={layout.headerFooter.headerText}
            onChange={(e) => patchHF({ headerText: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('examTemplate.layout.footerText')}</Label>
          <Input
            className={fieldCls}
            value={layout.headerFooter.footerText}
            onChange={(e) => patchHF({ footerText: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={layout.headerFooter.showPageNumber}
            onChange={(e) => patchHF({ showPageNumber: e.target.checked })}
          />
          {t('examTemplate.layout.showPageNumber')}
        </label>
      </section>

      {/* 得分框 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('examTemplate.layout.scoreBoxGroup')}
        </div>
        <select
          className={selectCls}
          value={layout.scoreBox}
          onChange={(e) => patch({ scoreBox: e.target.value as ScoreBoxMode })}
        >
          {SCORE_BOX_MODES.map((m) => (
            <option key={m.value} value={m.value}>{t(`examTemplate.layout.scoreBox.${m.key}`)}</option>
          ))}
        </select>
      </section>

      {/* 附加块 */}
      <section className="space-y-1.5 rounded-lg border p-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('examTemplate.layout.additionalGroup')}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() =>
              setAdditionalBlocks([
                ...layout.additionalBlocks,
                { placement: 'cover-end', content: '' },
              ])
            }
          >
            <Plus className="h-3 w-3" /> {t('examTemplate.layout.addAdditionalBlock')}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.layout.additionalHint')}</p>
        <div className="space-y-1">
          {layout.additionalBlocks.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                className={`${selectCls} w-32`}
                value={b.placement}
                onChange={(e) => {
                  const next = [...layout.additionalBlocks]
                  next[i] = { ...b, placement: e.target.value as PaperAdditionalBlock['placement'] }
                  setAdditionalBlocks(next)
                }}
              >
                <option value="cover-end">{t('examTemplate.layout.placement.coverEnd')}</option>
                <option value="header">{t('examTemplate.layout.placement.header')}</option>
                <option value="footer">{t('examTemplate.layout.placement.footer')}</option>
              </select>
              <Input
                className={`${fieldCls} flex-1`}
                value={b.content}
                onChange={(e) => {
                  const next = [...layout.additionalBlocks]
                  next[i] = { ...b, content: e.target.value }
                  setAdditionalBlocks(next)
                }}
                placeholder={t('examTemplate.layout.additionalContentPlaceholder')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setAdditionalBlocks(layout.additionalBlocks.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** 一行标签 + 控件 (用于文本块表格); active 时高亮, anchorId 供预览直调联动滚动 */
function FragmentRow({
  label,
  children,
  active,
  anchorId,
}: {
  label: string
  children: React.ReactNode
  active?: boolean
  anchorId?: string
}) {
  return (
    <>
      <div
        id={anchorId}
        className={cn(
          'flex min-w-0 items-center text-[11px] leading-none text-foreground/90',
          active && 'rounded bg-primary/10 px-1 font-medium text-primary',
        )}
      >
        {label}
      </div>
      {children}
    </>
  )
}