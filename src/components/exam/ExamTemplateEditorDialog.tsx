import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionSubjectPicker } from './SectionSubjectPicker'
import { PanelDivider } from '@/components/ui/panel-divider'
import { cn } from '@/lib/utils'
import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react'
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

/** Radix Select 不接受空字符串 value; 用此 token 表示"不继承" */
const NO_PARENT = '__none__'

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
  /** 整卷学科(可多选; 空 = 不限学科) */
  const [subjectsSel, setSubjectsSel] = useState<string[]>([])
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

  /** 桌面分栏: 右侧画布固定像素宽, 拖动分隔条调整(左侧表单至少保留约 340px) */
  const paneWrapRef = useRef<HTMLDivElement>(null)
  const [rightW, setRightW] = useState(540)
  /** 题型分区拖拽排序(拖左手柄): 拖动源 / 当前让位目标索引 */
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  /** 分区行行距(行高+间距), 让位挤开动画与目标行换算共用 */
  const listRef = useRef<HTMLDivElement>(null)
  const [rowStep, setRowStep] = useState(48)
  const measureRowStep = () => {
    const el = listRef.current
    if (!el || el.children.length === 0) return
    if (el.children.length >= 2) {
      const a = el.children[0] as HTMLElement
      const b = el.children[1] as HTMLElement
      setRowStep(b.getBoundingClientRect().top - a.getBoundingClientRect().top)
    } else {
      setRowStep((el.children[0] as HTMLElement).offsetHeight + 6)
    }
  }
  /** 指针拖拽会话: 源行索引/起始 Y/pointerId; over 同步到 ref 防事件闭包滞后 */
  const dragSessionRef = useRef<{ from: number; pointerId: number; startY: number } | null>(null)
  const overIdxRef = useRef<number | null>(null)

  const isBuiltin = template ? isBuiltinTemplate(template.id) : false
  const isNew = !template

  // 深拷贝父模板配置 (快照继承): sections 重新给 id, cover/layout 结构拷贝
  const applyParent = (parent: ExamTemplate) => {
    setName(parent.name)
    setSubjectsSel(parent.subject?.length ? [...parent.subject] : [])
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
      setSubjectsSel(template.subject?.length ? [...template.subject] : [])
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
      setSubjectsSel([])
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

  /** 分区学科候选的附加项: 整卷学科 + 所有分区已选学科(保证出现过的学科一定有选项) */
  const subjectExtraOptions = useMemo(() => {
    const out = new Set<string>()
    for (const x of subjectsSel) if (x.trim()) out.add(x.trim())
    for (const s of sections) for (const x of s.subject ?? []) if (x.trim()) out.add(x.trim())
    return [...out]
  }, [subjectsSel, sections])

  const patchSection = (id: string, patch: Partial<(typeof sections)[number]>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  /** 拖手排序: 把 from 行移动到 to 行位置 */
  const reorderSection = (from: number, to: number) => {
    if (from === to) return
    setSections((prev) => {
      const copy = [...prev]
      const [item] = copy.splice(from, 1)
      copy.splice(to, 0, item)
      return copy
    })
  }

  /** 按住拖手即进入排序: pointer capture 后 move/up 持续派发到手柄 */
  const beginSectionDrag = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (dragSessionRef.current) return
    measureRowStep()
    overIdxRef.current = i
    dragSessionRef.current = { from: i, pointerId: e.pointerId, startY: e.clientY }
    setDragIdx(i)
    setOverIdx(i)
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
  }

  /** 拖动中: 按位移换算目标行; 源行/让位行位移动画由 dragIdx/overIdx state 驱动 */
  const moveSectionDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = dragSessionRef.current
    if (!s || e.pointerId !== s.pointerId) return
    const step = rowStep || 48
    const t = Math.max(0, Math.min(sections.length - 1, s.from + Math.round((e.clientY - s.startY) / step)))
    if (t !== overIdxRef.current) {
      overIdxRef.current = t
      setOverIdx(t)
    }
    // 贴近可滚动祖先视口上下缘时自动滚动, 长列表也能拖到边缘
    let sc: HTMLElement | null = listRef.current
    while (sc && sc.scrollHeight <= sc.clientHeight + 2) sc = sc.parentElement
    if (!sc) return
    const r = sc.getBoundingClientRect()
    const edge = 56
    if (e.clientY < r.top + edge) sc.scrollTop -= 10
    else if (e.clientY > r.bottom - edge) sc.scrollTop += 10
  }

  /** 松手落位: 重排后复位(取消则不重排, transform 归零平滑回弹) */
  const endSectionDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = dragSessionRef.current
    if (!s || e.pointerId !== s.pointerId) return
    dragSessionRef.current = null
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.userSelect = ''
    const t = overIdxRef.current
    setDragIdx(null)
    setOverIdx(null)
    overIdxRef.current = null
    if (t !== null && t !== s.from) reorderSection(s.from, t)
  }

  /** 拖动分隔条: 画布在右, 鼠标右移(dx>0)时右栏变窄 */
  const handlePaneDrag = (dx: number) => {
    const wrap = paneWrapRef.current
    if (!wrap) return
    const max = Math.max(440, wrap.clientWidth - 340)
    setRightW((w) => Math.min(Math.max(w - dx, 380), max))
  }

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
      subject: subjectsSel.length ? subjectsSel : null,
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
          <Select
            value={parentId ?? NO_PARENT}
            onValueChange={(v) => {
              const id = v === NO_PARENT ? '' : v
              const parent = id ? parents.find((p) => p.id === id) : null
              setParentId(parent ? parent.id : null)
              if (parent) {
                applyParent(parent)
                // 提示用父名起名, 允许用户覆盖
                if (!name.trim()) setName(parent.name)
              } else {
                // 清空继承选择: 重置为空白
                setName('')
                setSubjectsSel([])
                setDurationMin(60)
                setOrderMode('section')
                setSampleMode('random')
                setSections([blankSection()])
                setCover(null)
                setPaperLayout(null)
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>{t('examTemplate.inheritNone')}</SelectItem>
              {parents.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {isBuiltinTemplate(p.id) ? `${p.name} (${t('examTemplate.builtin')})` : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('examTemplate.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('examTemplate.namePlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('examTemplate.subject')}</Label>
          <SectionSubjectPicker
            className="w-full"
            value={subjectsSel.length ? subjectsSel : null}
            subjects={subjects}
            extra={subjectExtraOptions}
            onChange={(next) => setSubjectsSel(next ?? [])}
            noneLabel={t('examTemplate.anySubject')}
            noneHint={t('examTemplate.anySubjectHint')}
            resetLabel={t('examTemplate.anySubject')}
            showNames
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
          <Select value={orderMode} onValueChange={(v) => setOrderMode(v as ExamOrderMode)}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_MODES.map((m) => (
                <SelectItem key={m} value={m}>{t(`examTemplate.order_${m}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">{t('examTemplate.sampleMode')}</Label>
          <Select value={sampleMode} onValueChange={(v) => setSampleMode(v as ExamSampleMode)}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SAMPLE_MODES.map((m) => (
                <SelectItem key={m} value={m}>{t(`examTemplate.sample_${m}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('examTemplate.sections')}</Label>
          <span className="text-xs text-muted-foreground">
            {t('examTemplate.totalQuestions')}: {totals.questions} · {t('examTemplate.totalScore')}: {totals.score}
          </span>
        </div>

        <div ref={listRef} className="space-y-1.5">
          {sections.map((s, i) => {
            const isSource = dragIdx === i
            const isOver = overIdx === i && dragIdx !== null && !isSource
            let ty = 0
            if (dragIdx !== null && overIdx !== null) {
              if (isSource) {
                // 源行滑向目标槽位
                ty = (overIdx - dragIdx) * rowStep
              } else if (dragIdx < overIdx && i > dragIdx && i <= overIdx) {
                ty = -rowStep // 中间行上移一个身位让位
              } else if (dragIdx > overIdx && i >= overIdx && i < dragIdx) {
                ty = rowStep // 中间行下移让位
              }
            }
            return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border p-1.5 transition-transform duration-150 ease-out',
                isSource && 'z-10 opacity-80 shadow-lg',
                isOver && 'border-primary',
              )}
              style={{ transform: `translateY(${ty}px)` }}
            >
              <button
                type="button"
                onPointerDown={beginSectionDrag(i)}
                onPointerMove={moveSectionDrag}
                onPointerUp={endSectionDrag}
                onPointerCancel={endSectionDrag}
                title={t('examTemplate.dragToReorder')}
                className="touch-none cursor-grab rounded p-0.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <Select value={s.type ?? ''} onValueChange={(v) => patchSection(s.id, { type: (v || null) as QuestionType | null })}>
                <SelectTrigger size="sm" className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <SectionSubjectPicker
                value={s.subject ?? null}
                subjects={subjects}
                extra={subjectExtraOptions}
                onChange={(next) => patchSection(s.id, { subject: next })}
              />
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
            )
          })}
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
    subjectsSel.length ? subjectsSel.join('、') : t('examTemplate.anySubject'),
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
          {/* 桌面: 左表单 tabs(设置/封面/排版) + 右侧常驻直调画布; 中间分隔条可拖动调两侧比例 */}
          <div ref={paneWrapRef} className="hidden h-full px-6 pb-4 lg:flex">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
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
            <PanelDivider onDrag={handlePaneDrag} onReset={() => setRightW(540)} />
            <div className="min-h-0 overflow-hidden" style={{ width: `${rightW}px` }}>
              <TemplatePaperPreview
                title={name}
                meta={paperMeta}
                sections={sections}
                cover={cover}
                layout={paperLayout}
                onLayoutChange={setPaperLayout}
                onCoverChange={setCover}
                onTitleChange={setName}
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