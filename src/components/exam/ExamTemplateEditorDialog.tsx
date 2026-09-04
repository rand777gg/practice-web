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
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { blankSection, isBuiltinTemplate, totalQuestions, totalScore } from '@/lib/exam-presets'
import { useExamTemplateStore, type ExamTemplateDraft } from '@/stores/exam-template-store'
import { useT } from '@/i18n/use-t'
import { PaperOutline } from './PaperOutline'
import { TemplatePaperPreview } from './TemplatePaperPreview'
import { CoverEditor } from './CoverEditor'
import { PaperLayoutEditor } from './PaperLayoutEditor'
import {
  parsePaperFromPdf,
  visionResultToDraftPatch,
  type ParseProgress,
} from '@/lib/ai-vision-parser'
import type {
  ExamOrderMode,
  ExamSampleMode,
  ExamTemplate,
  ExamTemplateLayout,
  ExamTemplateSection,
  QuestionType,
} from '@/types'
import type { PaperPick } from '@/lib/paper-layout'
import type { ExamTemplateCover } from '@/lib/paper-cover'

const selectClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const ORDER_MODES: ExamOrderMode[] = ['section', 'shuffle']
const SAMPLE_MODES: ExamSampleMode[] = ['random', 'wrong_first', 'unseen_first', 'seq']

type EditTab = 'form' | 'cover' | 'layout' | 'paper'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  template: ExamTemplate | null
  subjects: string[]
  categories: string[]
  userId: string
  /** 新建时可选的继承来源 (快照复制其配置后独立修改); 含内置预设+用户模板 */
  parents?: ExamTemplate[]
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
  parents,
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
  const [cover, setCover] = useState<ExamTemplateCover | null>(null)
  const [paperLayout, setPaperLayout] = useState<ExamTemplateLayout | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [tab, setTab] = useState<EditTab>('form')
  /** 预览直调当前命中的目标 (点选文字/边距热区), 联动左侧排版表单高亮 */
  const [paperPick, setPaperPick] = useState<PaperPick | null>(null)

  const isBuiltin = template ? isBuiltinTemplate(template.id) : false
  const isNew = !template

  // 深拷贝父模板配置 (快照继承): sections 重新给 id, cover/layout 结构拷贝
  const applyParent = (parent: ExamTemplate) => {
    setName(parent.name)
    setSubject(parent.subject ?? '')
    setDurationMin(parent.duration_min)
    setOrderMode(parent.order_mode)
    setSampleMode(parent.sample_mode)
    setSections(parent.sections.length ? parent.sections.map((s) => ({ ...s })) : [blankSection()])
    setCover(parent.cover ? structuredClone(parent.cover) : null)
    setPaperLayout(parent.layout ? structuredClone(parent.layout) : null)
  }

  useEffect(() => {
    if (!open) return
    // 打开/切换模板时把外部 prop 快照同步进本地草稿 (既有同步重置模式)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('')
    setImportMsg('')
    setPaperPick(null)
    if (template) {
      setName(template.name)
      setSubject(template.subject ?? '')
      setDurationMin(template.duration_min)
      setOrderMode(template.order_mode)
      setSampleMode(template.sample_mode)
      setSections(template.sections.length ? template.sections.map((s) => ({ ...s })) : [blankSection()])
      setCover(template.cover ?? null)
      setPaperLayout(template.layout ?? null)
      // 另存内置模板时默认标记继承来源为内置模板本身
      setParentId(isBuiltinTemplate(template.id) ? (template.parent_id ?? template.id) : (template.parent_id ?? null))
    } else {
      setName('')
      setSubject('')
      setDurationMin(60)
      setOrderMode('section')
      setSampleMode('random')
      setSections([blankSection()])
      setCover(null)
      setPaperLayout(null)
      setParentId(null)
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

  const handleImportPdf = async (file: File) => {
    setImporting(true)
    setError('')
    setImportMsg('')
    const onProgress = (p: ParseProgress) => {
      const map: Record<ParseProgress['stage'], string> = {
        loading: t('examTemplate.cover.importStageLoading'),
        uploading: t('examTemplate.cover.importStageUploading').replace('{n}', file.name),
        parsing: t('examTemplate.cover.importStageParsing'),
        done: t('examTemplate.cover.importStageDone'),
        error: t('examTemplate.cover.importStageError'),
      }
      setImportMsg(map[p.stage])
    }
    try {
      const result = await parsePaperFromPdf(file, onProgress)
      const patch = visionResultToDraftPatch(result)
      // sections 解析出来直接覆盖当前草稿 (替换, 不追加)
      if (patch.hasSections) {
        const merged = patch.sections.filter((s) => s.count > 0)
        if (merged.length) setSections(merged)
      }
      // cover 解析出来直接覆盖
      if (patch.hasCover) {
        setCover(patch.cover)
      }
      // 给出用户反馈
      if (!patch.hasCover && !patch.hasSections) {
        setImportMsg(t('examTemplate.cover.importNoMatch'))
      } else if (result.hasTextLayer === false) {
        setImportMsg(t('examTemplate.cover.importSuccessScanned'))
      } else {
        setImportMsg(t('examTemplate.cover.importSuccess'))
      }
      // 切到 cover tab 让用户看到结果
      setTab('cover')
    } catch (e) {
      const code = (e as Error).message
      const i18nKey: Record<string, string> = {
        PDF_TOO_LARGE: t('examTemplate.cover.importErrorTooLarge'),
        READ_FAILED: t('examTemplate.cover.importErrorReadFailed'),
        AUTH_FAILED: t('examTemplate.cover.importErrorAuth'),
        RATE_LIMIT: t('examTemplate.cover.importErrorRateLimit'),
        SERVER_ERROR: t('examTemplate.cover.importErrorServer'),
        NETWORK_ERROR: t('examTemplate.cover.importErrorNetwork'),
        EMPTY_RESULT: t('examTemplate.cover.importErrorEmpty'),
      }
      setError(i18nKey[code] ?? t('examTemplate.cover.importErrorGeneric'))
    } finally {
      setImporting(false)
    }
  }

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
      cover: cover ?? null,
      layout: paperLayout ?? null,
      // 新建/另存为时记录继承来源; 编辑已有模板不触碰
      parent_id: isNew || isBuiltin ? (parentId ?? null) : undefined,
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

  const formNode = (
    <div className="space-y-4">
      {/* 新建时: 继承自父模板 (快照复制后独立修改) */}
      {isNew && parents && parents.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-dashed p-2">
          <Label className="flex items-center gap-1 text-xs">
            {t('examTemplate.inheritFrom')}
          </Label>
          <p className="text-[10px] text-muted-foreground">{t('examTemplate.inheritHint')}</p>
          <select
            className={selectClass}
            value={parentId ?? ''}
            onChange={(e) => {
              const id = e.target.value
              const parent = id ? parents.find((p) => p.id === id) : null
              setParentId(parent ? parent.id : null)
              if (parent) {
                applyParent(parent)
                // 提示用父名起名, 允许用户覆盖
                if (!name.trim()) setName(parent.name)
              } else {
                // 清空继承选择: 重置为空白
                setName('')
                setSubject('')
                setDurationMin(60)
                setOrderMode('section')
                setSampleMode('random')
                setSections([blankSection()])
                setCover(null)
                setPaperLayout(null)
              }
            }}
          >
            <option value="">{t('examTemplate.inheritNone')}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {isBuiltinTemplate(p.id) ? `${p.name} (${t('examTemplate.builtin')})` : p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('examTemplate.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('examTemplate.namePlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('examTemplate.subject')}</Label>
          <AutocompleteInput
            className="h-8 text-xs"
            value={subject}
            onChange={setSubject}
            suggestions={subjects}
            placeholder={t('examTemplate.anySubject')}
            clearable
          />
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
  )

  const coverNode = (
    <div className="space-y-2">
      <CoverEditor value={cover} onChange={setCover} onImportPdf={handleImportPdf} />
      {importing && (
        <p className="text-[10px] text-muted-foreground">{t('examTemplate.cover.importing')}</p>
      )}
      {importMsg && !importing && !error && (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{importMsg}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )

  const layoutNode = (
    <div className="space-y-2">
      <PaperLayoutEditor value={paperLayout} onChange={setPaperLayout} activePick={paperPick} />
    </div>
  )

  const paperMeta = [
    subject || t('examTemplate.anySubject'),
    `${durationMin} ${t('exam.minutes')}`,
    `${t('examTemplate.totalScore')} ${totals.score}`,
  ].join(' · ')

  const paperNode = (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{t('examTemplate.paperViewHint')}</p>
      <div className="rounded-lg bg-muted/40 p-2">
        <PaperOutline compact title={name} meta={paperMeta} sections={sections} cover={cover} paperLayout={paperLayout} />
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-w-[min(94vw,1280px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 max-h-[88vh]">
        <DialogHeader className="px-4 pt-5 pb-3 lg:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isNew ? t('examTemplate.new') : isBuiltin ? t('examTemplate.saveAs') : t('examTemplate.edit')}
            {!isNew && parentId && (() => {
              const parentName = parents?.find((p) => p.id === parentId)?.name
              return parentName ? (
                <span className="rounded border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  {t('examTemplate.inheritedBadge')} {parentName}
                </span>
              ) : null
            })()}
          </DialogTitle>
          <DialogDescription>
            {isBuiltin ? t('examTemplate.builtinReadonly') : t('examTemplate.editorDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden">
          {/* 桌面: 左表单 tabs(设置/封面/排版) + 右侧常驻直调画布 */}
          <div className="hidden h-full gap-4 px-6 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,540px)]">
            <div className="min-h-0 overflow-y-auto pr-1">
              <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="form">{t('examTemplate.formTab')}</TabsTrigger>
                  <TabsTrigger value="cover">{t('examTemplate.coverTab')}</TabsTrigger>
                  <TabsTrigger value="layout">{t('examTemplate.layoutTab')}</TabsTrigger>
                </TabsList>
                <TabsContent value="form" className="mt-3">{formNode}</TabsContent>
                <TabsContent value="cover" className="mt-3">{coverNode}</TabsContent>
                <TabsContent value="layout" className="mt-3">{layoutNode}</TabsContent>
              </Tabs>
            </div>
            <div className="min-h-0 border-l pl-4">
              <TemplatePaperPreview
                title={name}
                meta={paperMeta}
                sections={sections}
                cover={cover}
                layout={paperLayout}
                onLayoutChange={setPaperLayout}
                onCoverChange={setCover}
                pick={paperPick}
                onPick={setPaperPick}
              />
            </div>
          </div>

          {/* 窄屏: 单列 tabs, 试卷视图退化为只读缩排卷 */}
          <div className="h-full overflow-y-auto px-4 pb-4 lg:hidden">
            <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="form">{t('examTemplate.formTab')}</TabsTrigger>
                <TabsTrigger value="cover">{t('examTemplate.coverTab')}</TabsTrigger>
                <TabsTrigger value="layout">{t('examTemplate.layoutTab')}</TabsTrigger>
                <TabsTrigger value="paper">{t('examTemplate.paperTab')}</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-3">{formNode}</TabsContent>
              <TabsContent value="cover" className="mt-3">{coverNode}</TabsContent>
              <TabsContent value="layout" className="mt-3">{layoutNode}</TabsContent>
              <TabsContent value="paper" className="mt-3">{paperNode}</TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-3 lg:px-6">
          {!isNew && !isBuiltin && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || importing}>
            {isBuiltin || isNew ? t('examTemplate.saveAs') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}