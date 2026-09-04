import { Plus, Trash2, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/use-t'
import type { ExamTemplateCover, ExamTemplateCoverInfoRow } from '@/lib/paper-cover'

interface Props {
  value: ExamTemplateCover | null
  onChange: (next: ExamTemplateCover | null) => void
  onImportPdf?: (file: File) => Promise<void> | void
}

export function CoverEditor({ value, onChange, onImportPdf }: Props) {
  const { t } = useT()
  const cover: ExamTemplateCover = value ?? {}

  const update = (patch: Partial<ExamTemplateCover>) => onChange({ ...cover, ...patch })

  const setNotices = (next: string[]) => update({ notices: next })
  const setInfoTable = (next: ExamTemplateCoverInfoRow[]) => update({ infoTable: next })

  const handlePdf = async (file: File | null) => {
    if (!file || !onImportPdf) return
    await onImportPdf(file)
  }

  const fieldCls = 'h-8 text-xs'
  const taCls = 'min-h-[64px] text-xs'

  return (
    <div className="space-y-3">
      {onImportPdf && (
        <div className="rounded-lg border border-dashed p-3">
          <Label className="flex items-center gap-1.5 text-xs">
            <FileUp className="h-3.5 w-3.5" /> {t('examTemplate.cover.importPdf')}
          </Label>
          <p className="mt-1 text-[10px] text-muted-foreground">{t('examTemplate.cover.importPdfHint')}</p>
          <Input
            type="file"
            accept="application/pdf"
            className="mt-2 h-8 text-xs"
            onChange={(e) => handlePdf(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      <Field label={t('examTemplate.cover.banner')} hint={t('examTemplate.cover.bannerHint')}>
        <Input className={fieldCls} value={cover.banner ?? ''} onChange={(e) => update({ banner: e.target.value })} />
      </Field>
      <Field label={t('examTemplate.cover.examName')} hint={t('examTemplate.cover.examNameHint')}>
        <Input className={fieldCls} value={cover.examName ?? ''} onChange={(e) => update({ examName: e.target.value })} />
      </Field>
      <Field label={t('examTemplate.cover.title')} hint={t('examTemplate.cover.titleHint')}>
        <Input className={fieldCls} value={cover.title ?? ''} onChange={(e) => update({ title: e.target.value })} />
      </Field>
      <Field label={t('examTemplate.cover.codeLine')} hint={t('examTemplate.cover.codeLineHint')}>
        <Input className={fieldCls} value={cover.codeLine ?? ''} onChange={(e) => update({ codeLine: e.target.value })} />
      </Field>
      <Field label={t('examTemplate.cover.noticeTitle')} hint={t('examTemplate.cover.noticeTitleHint')}>
        <Input className={fieldCls} value={cover.noticeTitle ?? ''} onChange={(e) => update({ noticeTitle: e.target.value })} />
      </Field>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('examTemplate.cover.notices')}</Label>
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.cover.noticesHint')}</p>
        <Textarea
          className={taCls}
          value={(cover.notices ?? []).join('\n')}
          onChange={(e) => setNotices(e.target.value.split('\n'))}
          rows={4}
          placeholder={'1. 答题前，考生须在答题卡指定位置上填写考生编号和考生姓名。\n2. 选择题的答案须涂写在答题卡相应题号的选项上，…'}
        />
      </div>

      <Field label={t('examTemplate.cover.infoHint')} hint={t('examTemplate.cover.infoHintHint')}>
        <Input className={fieldCls} value={cover.infoHint ?? ''} onChange={(e) => update({ infoHint: e.target.value })} />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('examTemplate.cover.infoTable')}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => setInfoTable([...(cover.infoTable ?? []), { label: '', boxes: 10 }])}
          >
            <Plus className="h-3 w-3" /> {t('examTemplate.cover.addRow')}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.cover.infoTableHint')}</p>
        <div className="space-y-1">
          {(cover.infoTable ?? []).map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                className={`${fieldCls} flex-1`}
                value={row.label}
                onChange={(e) => {
                  const next = [...(cover.infoTable ?? [])]
                  next[i] = { ...row, label: e.target.value }
                  setInfoTable(next)
                }}
                placeholder="考生编号"
              />
              <Input
                className={`${fieldCls} w-16`}
                type="number"
                min={0}
                max={30}
                value={row.boxes}
                onChange={(e) => {
                  const next = [...(cover.infoTable ?? [])]
                  next[i] = { ...row, boxes: Number(e.target.value) }
                  setInfoTable(next)
                }}
                title={t('examTemplate.cover.boxes')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setInfoTable((cover.infoTable ?? []).filter((_, j) => j !== i))}
                title={t('common.delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-xs text-destructive"
          onClick={() => onChange(null)}
        >
          {t('examTemplate.cover.clearCover')}
        </Button>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}