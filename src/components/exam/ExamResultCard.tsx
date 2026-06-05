import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QuestionCard } from '@/components/questions/QuestionCard'
import type { ExamSession, UserAnswer, Question } from '@/types'
import { RotateCcw, Home } from 'lucide-react'
import { useT } from '@/i18n/use-t'

interface Props {
  sessionId: string
}

export function ExamResultCard({ sessionId }: Props) {
  const { t } = useT()
  const [session, setSession] = useState<ExamSession | null>(null)
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sData } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sData) {
        setSession(sData as ExamSession)
      }

      const { data: aData } = await supabase
        .from('user_answers')
        .select('*, questions(*)')
        .eq('exam_session_id', sessionId)
        .order('answered_at', { ascending: true })

      if (aData) {
        setAnswers(aData as (UserAnswer & { questions: Question })[])
      }

      setIsLoading(false)
    }
    load()
  }, [sessionId])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (!session) {
    return <p className="text-muted-foreground">{t('exam.sessionNotFound')}</p>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('exam.score')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl lg:text-4xl font-bold">{session.score}%</p>
          <p className="text-muted-foreground">
            {session.correct_count} / {session.total_questions} {t('exam.correct')}
          </p>
          {session.completed_at && (
            <p className="text-sm text-muted-foreground">
              {new Date(session.completed_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('exam.reviewAnswers')}</h2>
        {answers.map((ans) => (
          <QuestionCard
            key={ans.id}
            question={ans.questions}
            selectedAnswer={ans.selected_answer}
            showResult
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/exam">
            <RotateCcw className="h-4 w-4" />
            {t('exam.newExam')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">
            <Home className="h-4 w-4" />
            {t('exam.backDashboard')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
