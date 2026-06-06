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
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useSwipe } from '@/hooks/use-swipe'
import {
  EXAM_DEFAULT_COUNT,
  EXAM_MIN_COUNT,
  EXAM_MAX_COUNT,
  EXAM_DEFAULT_DURATION_MIN,
  EXAM_MIN_DURATION_MIN,
  EXAM_MAX_DURATION_MIN,
} from '@/lib/constants'
import type { ExamSession as ExamSessionType } from '@/types'
import { useT } from '@/i18n/use-t'

export function ExamSession() {
  const { t } = useT()
  const { user } = useAuthStore()
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
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

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
    if (!selectedSubject) {
      setFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category')
          .eq('subject', selectedSubject)
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
        }
        setFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    setSelectedCategory('')
  }, [selectedSubject, categories])

  useEffect(() => {
    const sessionId = searchParams.get('sessionId')
    if (sessionId && user) {
      resumeExam(sessionId).then(() => {
        setShowStart(false)
        setHasStarted(true)
      })
      return
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
        if (data) {
          setPendingSession(data as unknown as ExamSessionType)
          setShowResumeDialog(true)
        }
        setCheckingSession(false)
      })
  }, [searchParams, user, resumeExam])

  const handleStart = async () => {
    if (!user) return
    const count = Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, questionCount || EXAM_DEFAULT_COUNT))
    const mins = Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, durationMin || EXAM_DEFAULT_DURATION_MIN))
    await startExam(user.id, count, mins * 60 * 1000, selectedSubject || undefined, selectedCategory || undefined)
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
    return <LoadingTips className="py-12" compact />
  }

  if (showStart) {
    return (
      <>
        <Card className="max-w-2xl">
          <CardContent className="py-6 lg:py-8 space-y-5">
            <h2 className="text-lg font-semibold">{t('exam.ready')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Left: filters + rules */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">{t('plan.selectSubjects')}</p>
                <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        {selectedSubject || t('questions.subject')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      <DropdownMenuItem onClick={() => setSelectedSubject('')}>
                        <span className="text-muted-foreground">{t('questions.subject')}</span>
                        {!selectedSubject && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                      {subjects.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                          {s}
                          {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        {selectedCategory || t('questions.category')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      <DropdownMenuItem onClick={() => setSelectedCategory('')}>
                        <span className="text-muted-foreground">{t('questions.category')}</span>
                        {!selectedCategory && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                      {filteredCategories.map((c) => (
                        <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                          {c}
                          {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>{t('exam.rule3')}</p>
                  <p>{t('exam.rule4')}</p>
                </div>
              </div>

              {/* Right: count + duration */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="questionCount">{t('exam.questionCount')}</Label>
                  <Input
                    id="questionCount"
                    type="number"
                    min={EXAM_MIN_COUNT}
                    max={EXAM_MAX_COUNT}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">{EXAM_MIN_COUNT}-{EXAM_MAX_COUNT}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">{t('exam.duration')}</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={EXAM_MIN_DURATION_MIN}
                    max={EXAM_MAX_DURATION_MIN}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">{EXAM_MIN_DURATION_MIN}-{EXAM_MAX_DURATION_MIN} {t('exam.minutes')}</p>
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
    return <LoadingTips className="py-12" compact />
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
