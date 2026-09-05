import { useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { ExamTimer } from './ExamTimer'
import { ExamResultDialog } from './ExamResultDialog'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronLeft, ChevronRight, FileText, LayoutGrid, Play, Sparkles, PanelLeftClose, PanelLeftOpen, Columns2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExamTemplatePanel } from './ExamTemplatePanel'
import { ExamHistory } from './ExamHistory'
import { ExamSchedulePanel } from './ExamSchedulePanel'
import { PaperPreview } from './PaperPreview'
import { PaperOutline } from './PaperOutline'
import { buildPaperSections } from '@/lib/exam-compose'

import {
  EXAM_DEFAULT_COUNT,
  EXAM_MIN_COUNT,
  EXAM_MAX_COUNT,
  EXAM_DEFAULT_DURATION_MIN,
  EXAM_MIN_DURATION_MIN,
  EXAM_MAX_DURATION_MIN,
} from '@/lib/constants'
import type { ExamSession as ExamSessionType, ExamTemplate, QuestionType, CaseAnswer, CorrectAnswer } from '@/types'
import { QUESTION_TYPE_OPTIONS, OPTION_LABELS } from '@/lib/constants'
import { suggestExamConfig, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/i18n/use-t'

export function ExamSession() {
  const { t } = useT()
  const { user } = useAuthStore()
  const { isEnabled } = useSettingsStore()
  const {
    session,
    questions,
    currentIndex,
    answers,
    isLoading,
    isSubmitting,
    error,
    startExam,
    resumeExam,
    answerQuestion,
    nextQuestion,
    previousQuestion,
    jumpTo,
    submitExam,
  } = useExamStore()

  const [searchParams, setSearchParams] = useSearchParams()
  const [hasStarted, setHasStarted] = useState(false)
  const [showStart, setShowStart] = useState(true)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [questionCount, setQuestionCount] = useState(EXAM_DEFAULT_COUNT)
  const [durationMin, setDurationMin] = useState(EXAM_DEFAULT_DURATION_MIN)

  const [pendingSession, setPendingSession] = useState<ExamSessionType | null>(null)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)

  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filteredCategories, setFilteredCategories] = useState<string[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGlow, setAiGlow] = useState(false)
  const [aiFade, setAiFade] = useState(false)
  const [aiReason, setAiReason] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [template, setTemplate] = useState<ExamTemplate | null>(null)
  const [paperMode, setPaperMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(true)          // 桌面答题卡展开/收起
  const [paperLayout, setPaperLayout] = useState<'sheet' | 'spread'>('sheet') // 卷面 单页摊开/双页摊开
  const [tab, setTab] = useState<'settings' | 'history'>('settings')
  const [paperNotice, setPaperNotice] = useState('')
  // 双页视图查看工具栏(缩放/平移/全屏)锚点: 桌面端挂在顶栏模板名右侧; 移动端回退浮层
  const [spreadToolbarEl, setSpreadToolbarEl] = useState<HTMLElement | null>(null)
  const isMobile = useIsMobile()
  const { setSidebarCollapsed } = useSettingsStore()

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
      setFilteredCategories([...cats].sort())
    }
    loadFilters()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (selectedSubjects.length === 0) {
      setFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category')
          .in('subject', selectedSubjects)
        if (cancelled) return
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
        }
        setFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    return () => { cancelled = true }
  }, [selectedSubjects, categories])

  useEffect(() => {
    let cancelled = false
    const sessionId = searchParams.get('sessionId')
    if (sessionId && user) {
      // Optimistically show exam UI immediately to avoid flash
      setShowStart(false)
      setHasStarted(true)
      resumeExam(sessionId).catch(() => {
        if (!cancelled) { setShowStart(true); setHasStarted(false) }
      })
      return () => { cancelled = true }
    }

    if (!user) return
    const urlHasSession = searchParams.has('sessionId')
    if (urlHasSession) return
    setCheckingSession(true)
    supabase
      .from('exam_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setPendingSession(data as unknown as ExamSessionType)
          setShowResumeDialog(true)
        }
        setCheckingSession(false)
      })
    return () => { cancelled = true }
  }, [searchParams, user?.id, resumeExam])

  const filterArgs = {
    subjects: selectedSubjects.length ? selectedSubjects : undefined,
    categories: selectedCategories.length ? selectedCategories : undefined,
    questionTypes: selectedTypes.length ? selectedTypes : undefined,
  }

  const handleStart = async () => {
    if (!user) return
    const count = Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, questionCount || EXAM_DEFAULT_COUNT))
    const mins = Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, durationMin || EXAM_DEFAULT_DURATION_MIN))
    const result = await startExam({
      userId: user.id,
      questionCount: count,
      durationMs: mins * 60 * 1000,
      template,
      ...filterArgs,
    })
    const s = useExamStore.getState().session
    if (!s) return
    setPaperNotice(result.stats?.some((x) => x.got < x.requested) ? t('examTemplate.insufficient') : '')
    setSearchParams({ sessionId: s.id }, { replace: true })
    setSidebarCollapsed(true)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleResume = async () => {
    if (!pendingSession) return
    setShowResumeDialog(false)
    setSearchParams({ sessionId: pendingSession.id }, { replace: true })
    await resumeExam(pendingSession.id)
    setSidebarCollapsed(true)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleDiscard = async () => {
    if (pendingSession) {
      await supabase.from('exam_sessions').delete().eq('id', pendingSession.id)
    }
    setShowResumeDialog(false)
    setPendingSession(null)
    setSidebarCollapsed(false)
    setSearchParams({}, { replace: true })
  }

  const handleSubmitExam = async () => {
    const s = useExamStore.getState().session
    if (!s || s.status === 'completed' || isSubmitting) return
    await submitExam()
    setResultDialogOpen(true)
  }

  const handleTimerExpire = () => {
    handleSubmitExam()
    setSearchParams({}, { replace: true })
  }

  // 收起答题卡 → 卷面自动切成「多栏摊开」吃满腾出的宽度(内容随收起拉伸);
  // 展开答题卡 → 回到收起前的布局(若该 spread 是由收起自动带来的则回单栏 sheet)。
  const sheetAutoSpreadRef = useRef(false)
  const setSheetCollapsed = (collapsed: boolean) => {
    setSheetOpen(!collapsed)
    if (paperMode) {
      if (collapsed) {
        sheetAutoSpreadRef.current = true
        setPaperLayout('spread')
      } else if (sheetAutoSpreadRef.current) {
        sheetAutoSpreadRef.current = false
        setPaperLayout('sheet')
      }
    }
  }

  // 在卡片模式先收起答题卡、之后再切进卷面: 此时答题卡处于收起态 → 只在「进入卷面」瞬间摊开填满;
  // 之后用户手动点「单页/双页」切换以用户选择为准, 不再被拉回 spread。
  const prevPaperModeRef = useRef(paperMode)
  useEffect(() => {
    const entering = paperMode && !prevPaperModeRef.current
    prevPaperModeRef.current = paperMode
    if (entering && !sheetOpen && paperLayout === 'sheet') {
      sheetAutoSpreadRef.current = true
      setPaperLayout('spread')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperMode, sheetOpen])

  const handleCloseResult = () => {
    setResultDialogOpen(false)
    useExamStore.getState().reset()
    setSidebarCollapsed(false)
    setSearchParams({}, { replace: true })
    setShowStart(true)
    setHasStarted(false)
  }

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions])

  if (checkingSession) {
    return (
      <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  if (showStart) {
    return (
      <>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              {t('exam.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('exam.setupDesc')}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'settings' | 'history')}>
          <TabsList>
            <TabsTrigger value="settings">{t('exam.tabSetup')}</TabsTrigger>
            <TabsTrigger value="history">{t('exam.tabHistory')}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
              <Card className="min-w-0 overflow-hidden xl:sticky xl:top-24">
                <CardContent className="space-y-5 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{t('exam.ready')}</h2>
                    {hasAiConfig() && isEnabled('exam') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={aiLoading}
                  onClick={async () => {
                    if (!user) return
                    setAiLoading(true)
                    setAiGlow(true)
                    try {
                      const { data: history } = await supabase
                        .from('user_answers')
                        .select('is_correct, questions(subject, category, question_type)')
                        .eq('user_id', user.id)

                      const wrongBySubject = new Map<string, { wrong: number; total: number }>()
                      const wrongByCategory = new Map<string, number>()
                      const wrongByType = new Map<string, number>()
                      for (const r of (history ?? [])) {
                        const q = (r.questions as any)
                        if (!q) continue
                        const s = q.subject || 'Other'
                        const c = q.category || 'Other'
                        const t = q.question_type || 'single_choice'
                        const se = wrongBySubject.get(s) || { wrong: 0, total: 0 }
                        se.total++
                        if (!r.is_correct) { se.wrong++; wrongByCategory.set(c, (wrongByCategory.get(c) ?? 0) + 1); wrongByType.set(t, (wrongByType.get(t) ?? 0) + 1) }
                        wrongBySubject.set(s, se)
                      }

                      const result = await suggestExamConfig({
                        totalPractice: (history ?? []).length,
                        wrongBySubject: [...wrongBySubject.entries()].map(([subject, v]) => ({ subject, ...v })),
                        wrongByCategory: [...wrongByCategory.entries()].map(([category, wrong]) => ({ category, wrong })),
                        wrongByType: [...wrongByType.entries()].map(([type, wrong]) => ({ type, wrong })),
                        availableSubjects: subjects,
                        availableCategories: categories,
                        availableTypes: QUESTION_TYPE_OPTIONS.map(o => o.value),
                      })

                      setSelectedSubjects(result.subjects.filter(s => subjects.includes(s)))
                      setSelectedCategories(result.categories.filter(c => categories.includes(c)))
                      setSelectedTypes(result.types.filter(t => QUESTION_TYPE_OPTIONS.some(o => o.value === t)) as QuestionType[])
                      setQuestionCount(Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, result.questionCount)))
                      setDurationMin(Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, result.durationMin)))
                      setAiReason(result.reason)
                    } catch (e) {
                      console.error('AI suggest exam failed:', e)
                      setAiReason('AI 推荐失败，请手动设置参数')
                    }
                    setAiLoading(false)
                    setTimeout(() => {
                      setAiFade(true)
                      requestAnimationFrame(() => {
                        setAiGlow(false)
                        setTimeout(() => setAiFade(false), 1500)
                      })
                    }, 500)
                  }}
                >
                  <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? 'animate-pulse' : ''}`} />
                  AI 智能出题
                </Button>
              )}
            </div>
            <div className="space-y-4">
              {aiLoading && (
                <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-1">
                  {[...'正在为您智能出题'].map((ch, i) => (
                    <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.04}s` }}>{ch}</span>
                  ))}
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_0.2s_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_0.4s_infinite]" />
                  </span>
                </p>
              )}
              {aiReason && (
                <p className="text-xs text-muted-foreground">
                  {[...aiReason].map((ch, i) => (
                    <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.03}s` }}>{ch}</span>
                  ))}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedSubjects.length ? `学科(${selectedSubjects.length})` : t('questions.subject')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {subjects.map((s) => {
                        const checked = selectedSubjects.includes(s)
                        return (
                          <DropdownMenuCheckboxItem key={s} checked={checked} onCheckedChange={() => {
                            setSelectedSubjects(prev => checked ? prev.filter(x => x !== s) : [...prev, s])
                          }}>
                            {s}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedCategories.length ? `分类(${selectedCategories.length})` : t('questions.category')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {(selectedSubjects.length ? filteredCategories : categories).map((c) => {
                        const checked = selectedCategories.includes(c)
                        return (
                          <DropdownMenuCheckboxItem key={c} checked={checked} onCheckedChange={() => {
                            setSelectedCategories(prev => checked ? prev.filter(x => x !== c) : [...prev, c])
                          }}>
                            {c}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedTypes.length ? `类型(${selectedTypes.length})` : t('questions.questionType')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {QUESTION_TYPE_OPTIONS.map((o) => {
                        const checked = selectedTypes.includes(o.value)
                        return (
                          <DropdownMenuCheckboxItem key={o.value} checked={checked} onCheckedChange={() => {
                            setSelectedTypes(prev => checked ? prev.filter(x => x !== o.value) : [...prev, o.value])
                          }}>
                            {t(`questionTypes.${o.value}` as any)}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t('examTemplate.sections')}</Label>
                  {user && (
                    <ExamTemplatePanel
                      userId={user.id}
                      subjects={subjects}
                      categories={categories}
                      value={template}
                      onChange={(next) => {
                        setTemplate(next)
                        if (next) setDurationMin(next.duration_min)
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="questionCount" className="text-xs">{t('exam.questionCount')}</Label>
                    <Input
                      id="questionCount"
                      type="number"
                      min={EXAM_MIN_COUNT}
                      max={EXAM_MAX_COUNT}
                      value={questionCount}
                      disabled={!!template}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className={`transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}
                    />
                    <p className="text-[10px] text-muted-foreground">{EXAM_MIN_COUNT}-{EXAM_MAX_COUNT}</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="duration" className="text-xs">{t('exam.duration')}</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={EXAM_MIN_DURATION_MIN}
                      max={EXAM_MAX_DURATION_MIN}
                      value={durationMin}
                      onChange={(e) => setDurationMin(Number(e.target.value))}
                      className={`transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}
                    />
                    <p className="text-[10px] text-muted-foreground">{EXAM_MIN_DURATION_MIN}-{EXAM_MAX_DURATION_MIN} {t('exam.minutes')}</p>
                  </div>
                </div>
            </div>
            <Button onClick={handleStart} disabled={isLoading} size="lg" className="w-full">
              {isLoading ? <Spinner /> : <Play className="h-4 w-4" />}
              {t('exam.startExam')}
            </Button>
            {paperNotice && <p className="text-xs text-amber-600 dark:text-amber-500">{paperNotice}</p>}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
                </CardContent>
              </Card>

              {/* ── 右侧: 卷面占位预览(仅选中模板后显示; 复用模板编辑的骨架占位, 不抽取题库) ── */}
              <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/30">
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background/70 px-3 py-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">{t('examTemplate.preview')}</h2>
                  <span className="hidden text-[10px] text-muted-foreground lg:inline">{t('exam.previewPaneHint')}</span>
                </header>
                <div className="flex-1 overflow-auto bg-neutral-200/40 p-3 dark:bg-neutral-950/40">
                  {!template ? (
                    <div className="flex min-h-[380px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                      {t('exam.previewRequiresTemplate')}
                    </div>
                  ) : (
                    <div className="flex min-h-[380px] justify-center">
                      <PaperOutline
                        compact
                        title={template.name}
                        meta={[
                          template.subject?.length ? template.subject.join('、') : '',
                          `${durationMin} ${t('exam.minutes')}`,
                        ].filter(Boolean).join(' · ')}
                        sections={template.sections}
                        cover={template.cover ?? null}
                        paperLayout={template.layout ?? null}
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>

            {user && (
              <div className="mt-5">
                <ExamSchedulePanel userId={user.id} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ExamHistory />
          </TabsContent>
        </Tabs>

        <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('exam.resumeTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild className="space-y-2">
                <div>
                  <div>{t('exam.resumeDesc')}</div>
                  {pendingSession && (
                    <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                      <div>{t('exam.resumeTotal')}: {pendingSession.question_ids.length} {t('questions.total')}</div>
                      <div>{t('exam.resumeProgress')}: {pendingSession.current_index + 1} / {pendingSession.question_ids.length}</div>
                      <div>{t('exam.resumeStarted')}: {new Date(pendingSession.started_at).toLocaleString()}</div>
                      <div>{t('exam.resumeTime')}: {Math.ceil(Math.max(0, pendingSession.duration_ms - (Date.now() - new Date(pendingSession.started_at).getTime())) / 60000)} {t('exam.minutes')}</div>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleDiscard}>{t('exam.resumeDiscard')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleResume}>{t('exam.resumeContinue')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  if (error && !hasStarted) {
    return <p className="text-destructive">{error}</p>
  }

  if (!session || questions.length === 0) {
    return <p className="text-muted-foreground">{t('exam.noExam')}</p>
  }

  if (session.status === 'completed' || resultDialogOpen) {
    return (
      <ExamResultDialog
        sessionId={session.id}
        open={resultDialogOpen || session.status === 'completed'}
        onClose={handleCloseResult}
      />
    )
  }

  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers.get(currentQuestion.id) ?? null : null
  const currentAnswered = currentAnswer !== null
  const answeredCount = questionIds.filter(id => answers.has(id)).length

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:h-[calc(100vh-7rem)]">
      {/* ── Left: Answer Sheet (desktop, collapsible) ─────────── */}
      <aside
        className={cn(
          'hidden lg:flex shrink-0 flex-col border-r bg-muted/20 overflow-hidden transition-[width] duration-300 ease-in-out',
          sheetOpen ? 'w-[300px]' : 'w-14',
        )}
      >
        {sheetOpen ? (
          <div className="flex h-full min-h-0 w-[300px] flex-col">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">答题卡</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <ExamTimer startedAt={session.started_at} durationMs={session.duration_ms} onExpire={handleTimerExpire} />
                  <button
                    type="button"
                    onClick={() => setSheetCollapsed(true)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={t('exam.collapseSheet')}
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />已答</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted border border-dashed border-muted-foreground/20" />未答</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-2 content-start">
                {questionIds.map((id, i) => {
                  const isAnswered = answers.has(id)
                  const isCurrent = i === currentIndex
                  return (
                    <button key={id}
                      onClick={() => jumpTo(i)}
                      className={cn(
                        'w-8 h-8 rounded text-xs tabular-nums transition-all border border-dashed flex items-center justify-center',
                        isCurrent && 'bg-primary text-primary-foreground border-primary',
                        !isCurrent && isAnswered && 'bg-emerald-500/80 text-white border-emerald-500',
                        !isCurrent && !isAnswered && 'text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40',
                      )}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="p-3 border-t space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">进度</span>
                  <span className="tabular-nums">{answeredCount}/{questions.length}</span>
                </div>
                <Progress value={(answeredCount / questions.length) * 100} className="h-2 [&>div]:bg-emerald-500" />
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleSubmitExam} disabled={isSubmitting}>
                {isSubmitting ? t('exam.submitting') : '交卷'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-14 flex-col items-center gap-5 py-3">
            <button
              type="button"
              onClick={() => setSheetCollapsed(false)}
              className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground"
              title={t('exam.expandSheet')}
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-emerald-600">{answeredCount}</span>
              <span>/</span>
              <span>{questions.length}</span>
            </div>
            <button
              type="button"
              onClick={handleSubmitExam}
              disabled={isSubmitting}
              className="rotate-0 text-[10px] text-muted-foreground hover:text-destructive"
              title="交卷"
            >
              {isSubmitting ? '…' : '交卷'}
            </button>
          </div>
        )}
      </aside>

      {paperMode && (
        <div key="paper" className="wb-slide-in-right flex-1 min-w-0 flex flex-col bg-neutral-200/60 dark:bg-neutral-950/40">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <span
              className="min-w-0 max-w-[34%] truncate font-medium text-foreground"
              title={template?.name ?? t('exam.title')}
            >
              {template?.name ?? t('exam.title')}
            </span>
            {/* 双页视图查看工具栏(缩放/平移/全屏)锚点 */}
            {paperLayout === 'spread' && !isMobile && (
              <span ref={setSpreadToolbarEl} className="flex shrink-0 items-center" />
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <span className="mr-1">共 {questions.length} 题</span>
              <button
                type="button"
                onClick={() => {
                  // 手动切换以用户为准, 清除“收起自动摊开”带来的展开还原标记
                  sheetAutoSpreadRef.current = false
                  setPaperLayout(paperLayout === 'spread' ? 'sheet' : 'spread')
                }}
                className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                title={paperLayout === 'spread' ? t('examTemplate.singlePage') : t('examTemplate.spreadPage')}
              >
                {paperLayout === 'spread'
                  ? <><FileText className="h-3 w-3" />{t('examTemplate.singlePage')}</>
                  : <><Columns2 className="h-3 w-3" />{t('examTemplate.spreadPage')}</>}
              </button>
              <button
                type="button"
                onClick={() => setPaperMode(false)}
                className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
              >
                <LayoutGrid className="h-3 w-3" />
                {t('examTemplate.cardMode')}
              </button>
            </div>
          </div>
          {/* 单页长卷由外层滚动; 双页摊开由 PaperSpreadView 内部 scroller 滚动, 外层不再滚动, 避免右侧叠两根滚动条 */}
          <div
            key={paperLayout}
            className={cn('wb-fade-in flex-1 min-h-0', paperLayout === 'spread' ? 'overflow-hidden' : 'overflow-y-auto')}
          >
            <PaperPreview
              title={template?.name ?? t('exam.title')}
              meta={`${Math.round(session.duration_ms / 60000)} ${t('exam.minutes')} · 共 ${questions.length} 题`}
              sections={buildPaperSections(questions, template)}
              answers={answers}
              onAnswer={answerQuestion}
              currentQuestionId={currentQuestion?.id ?? null}
              onFocus={(id) => {
                const i = questionIds.indexOf(id)
                if (i >= 0 && i !== currentIndex) jumpTo(i)
              }}
              layout={paperLayout}
              cover={template?.cover ?? null}
              paperLayout={template?.layout ?? null}
              spreadToolbarAnchor={paperLayout === 'spread' && !isMobile ? spreadToolbarEl : null}
            />
          </div>
        </div>
      )}
      {!paperMode && (
        <div key="card" className="wb-slide-in-right flex-1 min-w-0 flex flex-col lg:flex-row">
      {/* ── Center: Question ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground">
          <span className="font-medium text-foreground">第 {currentIndex + 1} 题</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.subject || '未分类'}</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.question_type ? t(`questionTypes.${currentQuestion.question_type}` as any) : ''}</span>
          <span className="ml-auto">共 {questions.length} 题</span>
          <button
            type="button"
            onClick={() => setPaperMode(true)}
            className="ml-2 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
            title={t('examTemplate.paperMode')}
          >
            <FileText className="h-3 w-3" />
            {t('examTemplate.paperMode')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {currentQuestion && (
            <div className="max-w-2xl mx-auto space-y-6 lg:h-full flex flex-col">
              <div className="flex-1">
                <MarkdownRenderer content={currentQuestion.question_text} className="text-base leading-relaxed" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Answer Area ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 lg:border-l bg-muted/20 flex flex-col lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">作答区</p>
          <span className="text-xs text-muted-foreground">
            {currentAnswered ? `已作答 ${currentIndex + 1}/${questions.length}` : `${currentIndex + 1}/${questions.length}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {currentQuestion && (() => {
            const q = currentQuestion
            const type = q.question_type

            if (type === 'single_choice' || type === 'multi_select') {
              const isMulti = type === 'multi_select'
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">{isMulti ? '多选题，点击选项选中/取消' : '单选题，点击选项选择'}</p>
                  {q.options.map((opt, i) => {
                    const selected = currentAnswer
                    const checked = isMulti
                      ? Array.isArray(selected) && (selected as number[]).includes(i)
                      : selected === i
                    return (
                      <button key={i}
                        onClick={() => {
                          if (isMulti) {
                            const prev = (Array.isArray(selected) ? selected as number[] : [])
                            answerQuestion(q.id, prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
                          } else {
                            answerQuestion(q.id, i)
                          }
                        }}
                        className={cn(
                          'w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-all text-sm',
                          checked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-accent/50',
                        )}
                      >
                        <span className={cn(
                          'w-5 h-5 border-2 flex items-center justify-center shrink-0 text-[10px] font-bold',
                          isMulti ? 'rounded' : 'rounded-full',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                        )}>
                          {checked ? (isMulti ? '✓' : '●') : String.fromCharCode(65 + i)}
                        </span>
                        <span>{opt}</span>
                      </button>
                    )
                  })}
                </div>
              )
            }

            if (type === 'fill_blank') {
              const blankCount = (q.question_text.match(/_{2,}/g) || []).length || 1
              const answers = (Array.isArray(currentAnswer) ? currentAnswer as string[] : typeof currentAnswer === 'string' ? [currentAnswer] : new Array(blankCount).fill('')) as string[]
              return (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">填空题，共 {blankCount} 个空</p>
                  {Array.from({ length: blankCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">({i + 1})</span>
                      <input
                        type="text"
                        className="flex-1 h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={`第 ${i + 1} 个空`}
                        value={answers[i] || ''}
                        onChange={(e) => {
                          const next = [...answers]
                          next[i] = e.target.value
                          answerQuestion(q.id, next.filter(Boolean).length ? next : next)
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'true_false') {
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">判断题，点击选择答案</p>
                  <div className="flex gap-3">
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={() => answerQuestion(q.id, v)}
                        className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                          currentAnswer === v ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                      >{v ? '✓ 正确' : '✗ 错误'}</button>
                    ))}
                  </div>
                </div>
              )
            }

            if (type === 'judge_correct') {
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">判断改错题，先判断对错，若错误请输入修正后的正确表述</p>
                  <div className="flex gap-3">
                    <button onClick={() => answerQuestion(q.id, true)}
                      className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                        currentAnswer === true ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                    >✓ 正确</button>
                    <button onClick={() => answerQuestion(q.id, '')}
                      className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                        currentAnswer !== null && currentAnswer !== true ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                    >✗ 错误</button>
                  </div>
                  {currentAnswer !== null && currentAnswer !== true && (
                    <input
                      type="text"
                      className="w-full h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="输入修正后的正确表述"
                      value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                      onChange={(e) => answerQuestion(q.id, e.target.value)}
                    />
                  )}
                </div>
              )
            }

            if (type === 'case_analysis') {
              const subs = q.case_questions ?? []
              const cur: CaseAnswer =
                currentAnswer && typeof currentAnswer === 'object' && !Array.isArray(currentAnswer) && 'subs' in currentAnswer
                  ? (currentAnswer as CaseAnswer)
                  : { subs: [] }
              const subValue = (id: string) => cur.subs.find((s) => s.id === id)?.value
              const setSub = (id: string, value: CorrectAnswer) => {
                answerQuestion(q.id, { subs: [...cur.subs.filter((s) => s.id !== id), { id, value }] })
              }
              const inputCls = 'w-full h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring'
              return (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">案例分析题 · 共 {subs.length} 个小题，均基于上方材料作答</p>
                  {subs.length === 0 && <p className="text-sm text-muted-foreground">该案例尚未配置小题</p>}
                  {subs.map((sub, si) => {
                    const val = subValue(sub.id)
                    const isSingle = sub.type === 'single_choice'
                    const isMulti = sub.type === 'multi_select'
                    const isTF = sub.type === 'true_false'
                    const isJudge = sub.type === 'judge_correct'
                    const isFill = sub.type === 'fill_blank'
                    const isShort = sub.type === 'short_answer'
                    const choice = isSingle || isMulti
                    const blanks = isFill ? Math.max(1, (sub.text.match(/_{2,}/g) || []).length) : 0
                    const blankVals = Array.isArray(val) ? (val as string[]) : val ? [String(val)] : Array(blanks).fill('')
                    return (
                      <div key={sub.id} className="space-y-2 rounded-lg border p-3">
                        <p className="text-sm leading-relaxed"><span className="mr-1.5 font-semibold text-muted-foreground">({si + 1})</span>{sub.text}</p>
                        {choice && (
                          <div className="space-y-1.5">
                            {sub.options.map((opt, oi) => {
                              const checked = isSingle ? val === oi : Array.isArray(val) && (val as number[]).includes(oi)
                              return (
                                <button key={oi} onClick={() => {
                                  if (isSingle) setSub(sub.id, oi)
                                  else {
                                    const arr = Array.isArray(val) ? [...(val as number[])] : []
                                    setSub(sub.id, arr.includes(oi) ? arr.filter((x) => x !== oi) : [...arr, oi])
                                  }
                                }}
                                  className={cn('w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all text-sm',
                                    checked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-accent/50')}>
                                  <span className={cn('w-5 h-5 border-2 flex items-center justify-center shrink-0 text-[10px] font-bold',
                                    isMulti ? 'rounded' : 'rounded-full',
                                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30')}>
                                    {checked ? (isMulti ? '✓' : '●') : OPTION_LABELS[oi]}
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {(isTF || isJudge) && (
                          <div className="flex gap-3">
                            {[true, false].map((v) => {
                              const on = v ? val === true : isTF ? val === false : val !== null && val !== undefined && val !== true
                              return (
                                <button key={String(v)} onClick={() => setSub(sub.id, v ? true : (isJudge ? '' : false))}
                                  className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                    on ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}>
                                  {v ? '✓ 正确' : '✗ 错误'}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {isJudge && val !== null && val !== undefined && val !== true && (
                          <input className={inputCls} value={typeof val === 'string' ? val : ''}
                            onChange={(e) => setSub(sub.id, e.target.value)} placeholder="输入修正后的正确表述" />
                        )}
                        {isFill && (
                          <div className="space-y-2">
                            {Array.from({ length: blanks }).map((_, bi) => (
                              <div key={bi} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-6 shrink-0">({bi + 1})</span>
                                <input className={inputCls} value={blankVals[bi] ?? ''}
                                  onChange={(e) => {
                                    const next = [...(Array.isArray(val) ? (val as string[]) : Array(blanks).fill(''))]
                                    next[bi] = e.target.value
                                    setSub(sub.id, next)
                                  }} placeholder={`第 ${bi + 1} 个空`} />
                              </div>
                            ))}
                          </div>
                        )}
                        {isShort && (
                          <input className={inputCls} value={typeof val === 'string' ? val : ''}
                            onChange={(e) => setSub(sub.id, e.target.value)} placeholder="输入简答答案" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            }

            return (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {{ fill_blank: '填空题，输入答案', short_answer: '简答题，输入答案', analysis: '分析题，输入分析内容', coding: '编程题，编写代码并运行测试' }[type] || '请输入答案'}
                </p>
                <textarea
                  className="w-full min-h-[200px] p-3 rounded-lg border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="请输入答案..."
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(e) => answerQuestion(q.id, e.target.value)}
                />
              </div>
            )
          })()}
        </div>
        <div className="p-3 border-t">
          <Button
            size="sm"
            className="w-full"
            disabled={!currentAnswered}
            onClick={() => {
              if (currentIndex < questions.length - 1) nextQuestion()
            }}
          >
            {currentAnswered ? '提交本题作答' : '请先作答'}
          </Button>
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={previousQuestion} disabled={currentIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />上一题
            </Button>
            <span className="text-xs text-muted-foreground">{currentIndex + 1}/{questions.length}</span>
            {currentIndex < questions.length - 1 ? (
              <Button variant="ghost" size="sm" onClick={nextQuestion}>
                下一题<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      </div>)}
      {/* Mobile answer sheet floating button */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <Button size="sm" className="shadow-lg gap-1 rounded-full px-4" onClick={() => setShowSheet(true)}>
          <span className="text-xs">答题卡</span>
          <span className="tabular-nums text-[10px] opacity-70">{answeredCount}/{questions.length}</span>
        </Button>
      </div>

      {/* Mobile answer sheet — bottom drawer */}
      {showSheet && <div className="lg:hidden fixed inset-0 z-50" onClick={() => setShowSheet(false)}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-0 inset-x-0 bg-background rounded-t-2xl p-4 pb-8 safe-area-bottom max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">答题卡</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/80" />已答</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted border border-dashed" />未答</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>进度</span><span>{answeredCount}/{questions.length}</span>
              </div>
              <Progress value={(answeredCount / questions.length) * 100} className="h-2 [&>div]:bg-emerald-500" />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {questionIds.map((id, i) => {
                const isAnswered = answers.has(id)
                const isCurrent = i === currentIndex
                return (
                  <button key={id} onClick={() => { jumpTo(i); setShowSheet(false) }}
                    className={cn('w-8 h-8 rounded text-xs tabular-nums border border-dashed flex items-center justify-center transition-all',
                      isCurrent && 'bg-primary text-primary-foreground border-primary',
                      !isCurrent && isAnswered && 'bg-emerald-500/80 text-white border-emerald-500',
                      !isCurrent && !isAnswered && 'text-muted-foreground border-muted-foreground/20')}>
                    {i + 1}
                  </button>
              )})}
            </div>
            <Button size="sm" className="w-full" onClick={handleSubmitExam} disabled={isSubmitting}>
              {isSubmitting ? t('exam.submitting') : '交卷'}
            </Button>
          </div>
        </div>
      </div>}
    </div>
  )
}
