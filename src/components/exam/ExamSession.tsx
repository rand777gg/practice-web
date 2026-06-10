import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { ExamTimer } from './ExamTimer'
import { ExamProgress } from './ExamProgress'
import { ExamResultDialog } from './ExamResultDialog'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { LoadingTips } from '@/components/layout/LoadingTips'
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
import { ChevronDown, ChevronLeft, ChevronRight, Play, Sparkles } from 'lucide-react'
import { useSwipe } from '@/hooks/use-swipe'
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

  const [searchParams] = useSearchParams()
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
      resumeExam(sessionId).then(() => {
        if (cancelled) return
        setShowStart(false)
        setHasStarted(true)
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
    setShowStart(false)
    setHasStarted(true)
  }

  const handleResume = async () => {
    if (!pendingSession) return
    setShowResumeDialog(false)
    await resumeExam(pendingSession.id)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleDiscard = async () => {
    if (pendingSession) {
      await supabase.from('exam_sessions').delete().eq('id', pendingSession.id)
    }
    setShowResumeDialog(false)
    setPendingSession(null)
  }

  const handleSubmitExam = async () => {
    const s = useExamStore.getState().session
    if (!s || s.status === 'completed' || isSubmitting) return
    await submitExam()
    setResultDialogOpen(true)
  }

  const handleTimerExpire = () => {
    handleSubmitExam()
  }

  const handleCloseResult = () => {
    setResultDialogOpen(false)
    useExamStore.getState().reset()
    setShowStart(true)
    setHasStarted(false)
  }

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: nextQuestion,
    onSwipeRight: previousQuestion,
  })

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
                    } catch { /* ignore */ }
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
              <AlertDialogDescription className="space-y-2">
                <p>{t('exam.resumeDesc')}</p>
                {pendingSession && (
                  <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                    <p>{t('exam.resumeTotal')}: {pendingSession.question_ids.length} {t('questions.total')}</p>
                    <p>{t('exam.resumeProgress')}: {pendingSession.current_index + 1} / {pendingSession.question_ids.length}</p>
                    <p>{t('exam.resumeStarted')}: {new Date(pendingSession.started_at).toLocaleString()}</p>
                    <p>{t('exam.resumeTime')}: {Math.ceil(Math.max(0, pendingSession.duration_ms - (Date.now() - new Date(pendingSession.started_at).getTime())) / 60000)} {t('exam.minutes')}</p>
                  </div>
                )}
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <ExamTimer
          startedAt={session.started_at}
          durationMs={session.duration_ms}
          onExpire={handleTimerExpire}
        />
        <ExamProgress
          current={currentIndex}
          total={questions.length}
          answers={answers}
          questionIds={questions.map((q) => q.id)}
          onJumpTo={jumpTo}
        />
      </div>

      {currentQuestion && (
        <div
          className="touch-pan-y select-none"
          style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <QuestionCard
            question={currentQuestion}
            selectedAnswer={answers.get(currentQuestion.id) ?? null}
            onSelect={(index) => answerQuestion(currentQuestion.id, index)}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={previousQuestion}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">{t('exam.previous')}</span>
        </Button>

        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {currentIndex + 1} / {questions.length}
        </span>

        {currentIndex < questions.length - 1 ? (
          <Button size="sm" onClick={nextQuestion}>
            <span className="hidden sm:inline mr-1">{t('exam.next')}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={handleSubmitExam} disabled={isSubmitting}>
            {isSubmitting ? t('exam.submitting') : t('exam.submitExam')}
          </Button>
        )}
      </div>
    </div>
  )
}
