import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { ExamTimer } from './ExamTimer'
import { ExamResultDialog } from './ExamResultDialog'
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
import { ChevronDown, ChevronLeft, ChevronRight, Play, Sparkles } from 'lucide-react'

import {
  EXAM_DEFAULT_COUNT,
  EXAM_MIN_COUNT,
  EXAM_MAX_COUNT,
  EXAM_DEFAULT_DURATION_MIN,
  EXAM_MIN_DURATION_MIN,
  EXAM_MAX_DURATION_MIN,
} from '@/lib/constants'
import type { ExamSession as ExamSessionType, QuestionType } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { suggestExamConfig, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
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

  const handleStart = async () => {
    if (!user) return
    const count = Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, questionCount || EXAM_DEFAULT_COUNT))
    const mins = Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, durationMin || EXAM_DEFAULT_DURATION_MIN))
    await startExam(user.id, count, mins * 60 * 1000, selectedSubjects.length ? selectedSubjects : undefined, selectedCategories.length ? selectedCategories : undefined, selectedTypes.length ? selectedTypes : undefined)
    const s = useExamStore.getState().session
    if (s) setSearchParams({ sessionId: s.id }, { replace: true })
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
        <Card className="max-w-2xl">
          <CardContent className="py-6 lg:py-8 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('exam.ready')}</h2>
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
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="questionCount" className="text-xs">{t('exam.questionCount')}</Label>
                    <Input
                      id="questionCount"
                      type="number"
                      min={EXAM_MIN_COUNT}
                      max={EXAM_MAX_COUNT}
                      value={questionCount}
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
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>

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
      {/* ── Left: Answer Sheet ────────────────────────────────── */}
      <div className="flex-[2] min-w-0 lg:border-r bg-muted/20 hidden lg:flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">答题卡</p>
            </div>
            <div className="flex items-center gap-2">
              <ExamTimer startedAt={session.started_at} durationMs={session.duration_ms} onExpire={handleTimerExpire} />
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

      {/* ── Center: Question ──────────────────────────────────── */}
      <div className="flex-[4] flex flex-col min-w-0 lg:overflow-hidden lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground">
          <span className="font-medium text-foreground">第 {currentIndex + 1} 题</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.subject || '未分类'}</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.question_type ? t(`questionTypes.${currentQuestion.question_type}` as any) : ''}</span>
          <span className="ml-auto">共 {questions.length} 题</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {currentQuestion && (
            <div className="max-w-2xl mx-auto space-y-6 lg:h-full flex flex-col">
              <div className="flex-1">
                <p className="text-base leading-relaxed whitespace-pre-wrap">{currentQuestion.question_text}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Answer Area ─────────────────────────────────── */}
      <div className="flex-[4] min-w-0 lg:border-l bg-muted/20 flex flex-col lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0">
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

            return (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {{ fill_blank: '填空题，输入答案', short_answer: '简答题，输入答案', judge_correct: '判断改错题，输入修正后的正确表述', analysis: '分析题，输入分析内容' }[type] || '请输入答案'}
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
