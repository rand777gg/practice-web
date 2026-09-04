/**
 * 模板画布 (/exam/templates): 在一整块画布上编辑试卷模板的独立工作台。
 * - 库里列出「内置预设 + 我的模板」, 点卡片进入画布工作台;
 * - 工作台左侧是整张 A4/纸张画布 (TemplatePaperPreview): 点选文字就地调字号/行距/段距,
 *   点选封面整块文字改字号/对齐/加粗/删块, 按住纸的四边热区直接拖边距;
 * - 右侧 Tabs 保留结构化表单 (设置 / 封面 / 排版), 与画布同一份草稿, 双向联动。
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Copy, GripVertical, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { blankSection, isBuiltinTemplate, totalQuestions, totalScore } from '@/lib/exam-presets'
import { useExamTemplateStore, selectAllTemplates, type ExamTemplateDraft } from '@/stores/exam-template-store'
import { useT } from '@/i18n/use-t'
import { hasCoverContent, type ExamTemplateCover } from '@/lib/paper-cover'
import type { PaperPick } from '@/lib/paper-layout'
import type { ExamTemplateLayout } from '@/types'
import type {
  ExamOrderMode,
  ExamSampleMode,
  ExamTemplate,
  ExamTemplateSection,
  QuestionType,
} from '@/types'
import { TemplatePaperPreview } from '@/components/exam/TemplatePaperPreview'
import { CoverEditor } from '@/components/exam/CoverEditor'
import { PaperLayoutEditor } from '@/components/exam/PaperLayoutEditor'

const selectClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const ORDER_MODES: ExamOrderMode[] = ['section', 'shuffle']
const SAMPLE_MODES: ExamSampleMode[] = ['random', 'wrong_first', 'unseen_first', 'seq']

type EditTab = 'form' | 'cover' | 'layout'

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const { templates, isLoading, load, create, update, remove } = useExamTemplateStore()
  const all = useMemo(() => selectAllTemplates(templates), [templates])

  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  // 工作台状态: draftBase === null 且 workbench=false 为列表; workbench=true 时
  // draftBase: null=新建空白, 内置模板=另存为我的模板, 用户模板=直接编辑
  const [workbench, setWorkbench] = useState(false)
  const [draftBase, setDraftBase] = useState<ExamTemplate | null>(null)
  const [dirty, setDirty] = useState(false)

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
  const [error, setError] = useState('')
  const [tab, setTab] = useState<EditTab>('form')
  const [paperPick, setPaperPick] = useState<PaperPick | null>(null)

  useEffect(() => {
    if (userId) load(userId)
  }, [userId, load])

  // 学科/分类词典 (用于分区限定 & 新建模板的学科联想)
  useEffect(() => {
    let cancelled = false
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      if (cancelled) return
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
    }
    loadFilters()
    return () => { cancelled = true }
  }, [])

  const isBuiltinTarget = draftBase ? isBuiltinTemplate(draftBase.id) : false
  const isNewTarget = !draftBase
  const totals = useMemo(
    () => ({ questions: totalQuestions(sections), score: totalScore(sections) }),
    [sections],
  )
  const paperMeta = [
    subject || t('examTemplate.anySubject'),
    `${durationMin} ${t('exam.minutes')}`,
    `${t('examTemplate.totalScore')} ${totals.score}`,
  ].join(' · ')

  const blankDraft = () => {
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

  const copyDraftFrom = (src: ExamTemplate, keepParent = false) => {
    setName(src.name)
    setSubject(src.subject ?? '')
    setDurationMin(src.duration_min)
    setOrderMode(src.order_mode)
    setSampleMode(src.sample_mode)
    setSections(src.sections.length ? src.sections.map((s) => ({ ...s })) : [blankSection()])
    setCover(src.cover ? structuredClone(src.cover) : null)
    setPaperLayout(src.layout ? structuredClone(src.layout) : null)
    if (!keepParent) {
      // 内置模板另存时默认记下继承来源, 其余情况跟随原模板记录
      setParentId(isBuiltinTemplate(src.id) ? (src.parent_id ?? src.id) : (src.parent_id ?? null))
    }
  }

  const openWorkbench = (src: ExamTemplate | null) => {
    setDirty(false)
    setPaperPick(null)
    setError('')
    setTab('form')
    if (src) copyDraftFrom(src)
    else blankDraft()
    setWorkbench(true)
    setDraftBase(src)
  }

  const closeWorkbench = () => {
    if (workbench && dirty && !window.confirm(t('examTemplate.confirmDiscard'))) return
    setWorkbench(false)
    setDraftBase(null)
    setDirty(false)
    setPaperPick(null)
  }

  const patchSection = (id: string, patch: Partial<ExamTemplateSection>) => {
    setDirty(true)
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const moveSection = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    setDirty(true)
    setSections((prev) => {
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  const applyParent = (parent: ExamTemplate) => {
    copyDraftFrom(parent, true)
    setParentId(parent.id)
    if (!name.trim()) setName(parent.name)
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
      parent_id: isNewTarget || isBuiltinTarget ? (parentId ?? null) : undefined,
    }

    let ok = false
    if (isNewTarget || isBuiltinTarget) {
      const created = await create(userId, draft)
      ok = Boolean(created)
    } else if (draftBase) {
      await update(draftBase.id, draft)
      ok = !useExamTemplateStore.getState().error
    }
    setSaving(false)
    if (ok) {
      setDirty(false)
      closeWorkbench()
    } else {
      setError(useExamTemplateStore.getState().error ?? t('examTemplate.saveFailed'))
    }
  }

  const handleDelete = async (target: ExamTemplate) => {
    if (isBuiltinTemplate(target.id)) return
    await remove(target.id)
  }

  /* ================= 列表视图 ================= */
  if (!workbench) {
    const builtins = all.filter((x) => isBuiltinTemplate(x.id))
    const mine = all.filter((x) => !isBuiltinTemplate(x.id))
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Layers className="h-5 w-5 text-primary" />
              {t('nav.templateCanvas')}
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('examTemplate.canvasDesc')}</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => openWorkbench(null)}>
            <Plus className="h-4 w-4" />
            {t('examTemplate.new')}
          </Button>
        </div>

        {isLoading && all.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
            ))}
          </div>
        ) : (
          <>
            {builtins.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-medium text-muted-foreground">{t('examTemplate.builtinGroup')}</h2>
                <p className="text-[10px] text-muted-foreground">{t('examTemplate.builtinCopyNote')}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {builtins.map((x) => (
                    <TemplateCard key={x.id} x={x} openLabel={t('examTemplate.saveAs')} onOpen={() => openWorkbench(x)} />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">{t('examTemplate.myGroup')}</h2>
              {mine.length === 0 ? (
                <button
                  type="button"
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed py-10 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  onClick={() => openWorkbench(null)}
                >
                  <Plus className="h-5 w-5" />
                  {t('examTemplate.emptyLibrary')}
                </button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mine.map((x) => (
                    <TemplateCard
                      key={x.id}
                      x={x}
                      openLabel={t('examTemplate.edit')}
                      onOpen={() => openWorkbench(x)}
                      onDelete={() => handleDelete(x)}
                      deleteLabel={t('common.delete')}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    )
  }

  /* ================= 画布工作台 ================= */
  return (
    <div className="flex flex-col gap-3">
      {/* 工作台顶栏: 返回 + 名称 + 动作 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={closeWorkbench}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('examTemplate.backToLibrary')}
        </Button>
        <Input
          className="h-8 w-56 sm:w-72"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
          placeholder={t('examTemplate.namePlaceholder')}
        />
        {isBuiltinTarget && (
          <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('examTemplate.builtin')}</span>
        )}
        {!isNewTarget && parentId && (() => {
          const parentName = all.find((p) => p.id === parentId)?.name
          return parentName ? (
            <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t('examTemplate.inheritedBadge')} {parentName}
            </span>
          ) : null
        })()}
        <span className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          {dirty && <span className="hidden text-[10px] text-muted-foreground sm:inline">{t('examTemplate.unsaved')}</span>}
          {draftBase && !isBuiltinTarget && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive"
              onClick={async () => {
                await handleDelete(draftBase)
                closeWorkbench()
              }}
            >
              {t('common.delete')}
            </Button>
          )}
          <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
            {isBuiltinTarget || isNewTarget ? t('examTemplate.saveAs') : t('common.save')}
          </Button>
        </span>
      </div>

      {/* 主区: 左侧整张画布 + 右侧结构化表单 (同一份草稿) */}
      <div className="grid h-[calc(100dvh-15.5rem)] min-h-[560px] grid-cols-[minmax(0,1fr)_minmax(320px,380px)] gap-4">
        <div className="min-h-0 overflow-hidden rounded-xl border bg-background/40">
          <TemplatePaperPreview
            title={name}
            meta={paperMeta}
            sections={sections}
            cover={cover}
            layout={paperLayout}
            onLayoutChange={(next) => { setPaperLayout(next); setDirty(true) }}
            onCoverChange={(next) => { setCover(next); setDirty(true) }}
            pick={paperPick}
            onPick={setPaperPick}
          />
        </div>

        <div className="min-h-0 overflow-y-auto rounded-xl border bg-background/40 pr-1">
          <Tabs value={tab} onValueChange={(v) => setTab(v as EditTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="form">{t('examTemplate.formTab')}</TabsTrigger>
              <TabsTrigger value="cover">{t('examTemplate.coverTab')}</TabsTrigger>
              <TabsTrigger value="layout">{t('examTemplate.layoutTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="form" className="mt-3 space-y-4 px-3">
              {/* 新建时: 可继承一个父模板 (快照复制后独立编辑) */}
              {isNewTarget && (
                <div className="space-y-1.5 rounded-lg border border-dashed p-2">
                  <Label className="flex items-center gap-1 text-xs">{t('examTemplate.inheritFrom')}</Label>
                  <p className="text-[10px] text-muted-foreground">{t('examTemplate.inheritHint')}</p>
                  <select
                    className={selectClass}
                    value={parentId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value
                      const parent = id ? all.find((p) => p.id === id) : null
                      if (parent) {
                        applyParent(parent)
                      } else {
                        setParentId(null)
                        blankDraft()
                      }
                      setDirty(true)
                    }}
                  >
                    <option value="">{t('examTemplate.inheritNone')}</option>
                    {all.map((p) => (
                      <option key={p.id} value={p.id}>
                        {isBuiltinTemplate(p.id) ? `${p.name} (${t('examTemplate.builtin')})` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('examTemplate.subject')}</Label>
                  <AutocompleteInput
                    className="h-8 text-xs"
                    value={subject}
                    onChange={(v) => { setSubject(v); setDirty(true) }}
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
                    className="h-8 text-xs"
                    value={durationMin}
                    onChange={(e) => { setDurationMin(Number(e.target.value)); setDirty(true) }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('examTemplate.orderMode')}</Label>
                  <select
                    className={selectClass}
                    value={orderMode}
                    onChange={(e) => { setOrderMode(e.target.value as ExamOrderMode); setDirty(true) }}
                  >
                    {ORDER_MODES.map((m) => (
                      <option key={m} value={m}>{t(`examTemplate.order_${m}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('examTemplate.sampleMode')}</Label>
                  <select
                    className={selectClass}
                    value={sampleMode}
                    onChange={(e) => { setSampleMode(e.target.value as ExamSampleMode); setDirty(true) }}
                  >
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
                          onClick={() => moveSection(i, -1)}
                          title={t('examTemplate.moveUp')}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-6"
                          disabled={i === sections.length - 1}
                          onClick={() => moveSection(i, 1)}
                          title={t('examTemplate.moveDown')}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDirty(true)
                          setSections((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== s.id) : prev))
                        }}
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
                  onClick={() => { setDirty(true); setSections((prev) => [...prev, blankSection()]) }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('examTemplate.addSection')}
                </Button>
                <p className="text-[10px] text-muted-foreground">{t('examTemplate.sectionHint')}</p>
              </div>
            </TabsContent>

            <TabsContent value="cover" className="mt-3 px-3">
              <CoverEditor value={cover} onChange={(next) => { setCover(next); setDirty(true) }} />
            </TabsContent>

            <TabsContent value="layout" className="mt-3 px-3">
              <PaperLayoutEditor
                value={paperLayout}
                onChange={(next) => { setPaperLayout(next); setDirty(true) }}
                activePick={paperPick}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

/** 模板卡片: 点卡片进入画布; 我的模板额外提供删除 */
function TemplateCard({
  x,
  onOpen,
  onDelete,
  openLabel,
  deleteLabel,
}: {
  x: ExamTemplate
  onOpen: () => void
  onDelete?: () => void
  openLabel: string
  deleteLabel?: string
}) {
  const { t } = useT()
  const builtin = isBuiltinTemplate(x.id)
  const hasCover = hasCoverContent(x.cover)
  const q = totalQuestions(x.sections)
  const s = totalScore(x.sections)
  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:shadow-sm">
      <button type="button" className="absolute inset-0 z-0 rounded-xl" onClick={onOpen} aria-label={openLabel} />
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{x.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {x.subject || t('examTemplate.anySubject')} · {x.duration_min} {t('exam.minutes')}
          </p>
        </div>
        {builtin && (
          <span className="shrink-0 rounded border px-1 py-0.5 text-[9px] text-muted-foreground">{t('examTemplate.builtin')}</span>
        )}
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">
          {t('examTemplate.totalQuestions')} {q}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5">
          {t('examTemplate.totalScore')} {s}
        </span>
        {hasCover && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{t('examTemplate.coverTab')}</span>}
      </div>
      <div className="relative z-10 mt-1 flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 text-[11px]" onClick={onOpen}>
          {builtin ? <Copy className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {openLabel}
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title={deleteLabel}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
