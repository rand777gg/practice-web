import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { blankSection, isBuiltinTemplate, totalQuestions, totalScore } from '@/lib/exam-presets'
import { useExamTemplateStore, type ExamTemplateDraft } from '@/stores/exam-template-store'
import { useT } from '@/i18n/use-t'
import type { ExamOrderMode, ExamSampleMode, ExamTemplate, ExamTemplateSection, QuestionType } from '@/types'

const selectClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const ORDER_MODES: ExamOrderMode[] = ['section', 'shuffle']
const SAMPLE_MODES: ExamSampleMode[] = ['random', 'wrong_first', 'unseen_first', 'seq']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  template: ExamTemplate | null
  subjects: string[]
  categories: string[]
  userId: string
  onSaved: (template: ExamTemplate) => void
  onDeleted?: (id: string) => void
}

export function ExamTemplateEditorDialog({
  open,
  onOpenChange,
  template,
  subjects,
  categories,
  userId,
  onSaved,
  onDeleted,
}: Props) {
  const { t } = useT()
  const { create, update, remove } = useExamTemplateStore()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [durationMin, setDurationMin] = useState(60)
  const [orderMode, setOrderMode] = useState<ExamOrderMode>('section')
  const [sampleMode, setSampleMode] = useState<ExamSampleMode>('random')
  const [sections, setSections] = useState<ExamTemplateSection[]>([blankSection()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isBuiltin = template ? isBuiltinTemplate(template.id) : false
  const isNew = !template

  useEffect(() => {
    if (!open) return
    setError('')
    if (template) {
      setName(template.name)
      setSubject(template.subject ?? '')
      setDurationMin(template.duration_min)
      setOrderMode(template.order_mode)
      setSampleMode(template.sample_mode)
      setSections(template.sections.length ? template.sections.map((s) => ({ ...s })) : [blankSection()])
    } else {
      setName('')
      setSubject('')
      setDurationMin(60)
      setOrderMode('section')
      setSampleMode('random')
      setSections([blankSection()])
    }
  }, [open, template])

  const totals = useMemo(
    () => ({ questions: totalQuestions(sections), score: totalScore(sections) }),
    [sections],
  )

  const patchSection = (id: string, patch: Partial<(typeof sections)[number]>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const move = (index: number, delta: number) =>
    setSections((prev) => {
      const next = index + delta
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return copy
    })

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('examTemplate.nameRequired'))
      return
    }
    if (totals.questions === 0) {
      setError(t('examTemplate.needSection'))
      return
    }
    setSaving(true)
    setError('')
    const draft: ExamTemplateDraft = {
      name: name.trim(),
      subject: subject || null,
      duration_min: Math.max(1, Math.min(600, durationMin || 60)),
      order_mode: orderMode,
      sample_mode: sampleMode,
      sections: sections.filter((s) => s.count > 0),
    }

    if (isBuiltin || isNew) {
      const created = await create(userId, draft)
      setSaving(false)
      if (created) {
        onSaved(created)
        onOpenChange(false)
      } else {
        setError(useExamTemplateStore.getState().error ?? t('examTemplate.saveFailed'))
      }
      return
    }

    await update(template.id, draft)
    setSaving(false)
    const storeError = useExamTemplateStore.getState().error
    if (storeError) {
      setError(storeError)
      return
    }
    onSaved({ ...template, ...draft })
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (!template || isBuiltin) return
    await remove(template.id)
    onDeleted?.(template.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? t('examTemplate.new') : isBuiltin ? t('examTemplate.saveAs') : t('examTemplate.edit')}
          </DialogTitle>
          <DialogDescription>
            {isBuiltin ? t('examTemplate.builtinReadonly') : t('examTemplate.editorDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('examTemplate.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('examTemplate.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('examTemplate.subject')}</Label>
              <select className={selectClass} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">{t('examTemplate.anySubject')}</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('examTemplate.duration')}</Label>
              <Input
                type="number"
                min={1}
                max={600}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('examTemplate.orderMode')}</Label>
              <select className={selectClass} value={orderMode} onChange={(e) => setOrderMode(e.target.value as ExamOrderMode)}>
                {ORDER_MODES.map((m) => (
                  <option key={m} value={m}>{t(`examTemplate.order_${m}`)}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">{t('examTemplate.sampleMode')}</Label>
              <select className={selectClass} value={sampleMode} onChange={(e) => setSampleMode(e.target.value as ExamSampleMode)}>
                {SAMPLE_MODES.map((m) => (
                  <option key={m} value={m}>{t(`examTemplate.sample_${m}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('examTemplate.sections')}</Label>
              <span className="text-xs text-muted-foreground">
                {t('examTemplate.totalQuestions')}: {totals.questions} · {t('examTemplate.totalScore')}: {totals.score}
              </span>
            </div>

            <div className="space-y-1.5">
              {sections.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5 rounded-lg border p-1.5">
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  <select
                    className={`${selectClass} flex-1`}
                    value={s.type ?? ''}
                    onChange={(e) => patchSection(s.id, { type: (e.target.value || null) as QuestionType | null })}
                  >
                    {QUESTION_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <Input
                    className="h-8 w-14 text-xs"
                    type="number"
                    min={0}
                    max={200}
                    title={t('examTemplate.count')}
                    value={s.count}
                    onChange={(e) => patchSection(s.id, { count: Number(e.target.value) })}
                  />
                  <Input
                    className="h-8 w-14 text-xs"
                    type="number"
                    min={0}
                    max={100}
                    title={t('examTemplate.score')}
                    value={s.score}
                    onChange={(e) => patchSection(s.id, { score: Number(e.target.value) })}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
                        {s.categories.length ? `${s.categories.length}` : '—'}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                      {categories.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('examTemplate.noCategories')}</div>
                      )}
                      {categories.map((c) => {
                        const checked = s.categories.includes(c)
                        return (
                          <DropdownMenuCheckboxItem
                            key={c}
                            checked={checked}
                            onCheckedChange={() =>
                              patchSection(s.id, {
                                categories: checked ? s.categories.filter((x) => x !== c) : [...s.categories, c],
                              })
                            }
                          >
                            {c}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-6"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      title={t('examTemplate.moveUp')}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-6"
                      disabled={i === sections.length - 1}
                      onClick={() => move(i, 1)}
                      title={t('examTemplate.moveDown')}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setSections((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== s.id) : prev))}
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1 text-xs"
              onClick={() => setSections((prev) => [...prev, blankSection()])}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('examTemplate.addSection')}
            </Button>
            <p className="text-[10px] text-muted-foreground">{t('examTemplate.sectionHint')}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {!isNew && !isBuiltin && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {isBuiltin || isNew ? t('examTemplate.saveAs') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
