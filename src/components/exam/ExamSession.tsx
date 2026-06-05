import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { ExamTimer } from './ExamTimer'
import { ExamProgress } from './ExamProgress'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
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
    submitExam,
  } = useExamStore()

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [hasStarted, setHasStarted] = useState(false)
  const [showStart, setShowStart] = useState(true)

  useEffect(() => {
    const sessionId = searchParams.get('sessionId')
    if (sessionId && user) {
      resumeExam(sessionId).then(() => {
        setShowStart(false)
        setHasStarted(true)
      })
    }
  }, [searchParams, user, resumeExam])

  const handleStart = async () => {
    if (!user) return
    await startExam(user.id)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleSubmitExam = async () => {
    await submitExam()
    if (session) {
      navigate(`/exam/result/${session.id}`)
    }
  }

  const handleTimerExpire = () => {
    handleSubmitExam()
  }

  if (showStart) {
    return (
      <Card>
        <CardContent className="py-6 lg:py-8 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t('exam.ready')}</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>{t('exam.rule1')}</li>
              <li>{t('exam.rule2')}</li>
              <li>{t('exam.rule3')}</li>
              <li>{t('exam.rule4')}</li>
            </ul>
          </div>
          <Button onClick={handleStart} disabled={isLoading} size="lg">
            {isLoading ? <Spinner /> : <Play className="h-4 w-4" />}
            {t('exam.startExam')}
          </Button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (error && !hasStarted) {
    return <p className="text-destructive">{error}</p>
  }

  if (!session || questions.length === 0) {
    return <p className="text-muted-foreground">{t('exam.noExam')}</p>
  }

  if (session.status === 'completed') {
    navigate(`/exam/result/${session.id}`)
    return null
  }

  const currentQuestion = questions[currentIndex]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <ExamTimer startedAt={session.started_at} onExpire={handleTimerExpire} />
        <ExamProgress
          current={currentIndex}
          total={questions.length}
          answers={answers}
          questionIds={questions.map((q) => q.id)}
        />
      </div>

      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          selectedAnswer={answers.get(currentQuestion.id) ?? null}
          onSelect={(index) => answerQuestion(currentQuestion.id, index)}
        />
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
