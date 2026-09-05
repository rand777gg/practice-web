import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fetchQuestionsByIds } from '@/lib/exam-compose'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { ExamPaperReview } from './ExamPaperReview'
import { questionItemCount, questionCorrectItemCount } from '@/lib/answer-utils'
import type { ExamSession, UserAnswer, Question, CorrectAnswer } from '@/types'
import { RotateCcw, Home, FileText, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

interface Props {
  sessionId: string
}

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function viewBtnClass(on: boolean) {
  return cn(
    'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
    on ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent',
  )
}

export function ExamResultCard({ sessionId }: Props) {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [session, setSession] = useState<ExamSession | null>(null)
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [paperQuestions, setPaperQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [paperLoading, setPaperLoading] = useState(true)
  const [view, setView] = useState<'paper' | 'card'>('paper')

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

  // 卷面视角需要完整题目列表(含未作答的题), 按出卷顺序还原成一张卷子
  useEffect(() => {
    if (!session) return
    let cancelled = false
    setPaperLoading(true)
    fetchQuestionsByIds(session.question_ids ?? [])
      .then((qs) => { if (!cancelled) setPaperQuestions(qs) })
      .catch(() => { if (!cancelled) setPaperQuestions([]) })
      .finally(() => { if (!cancelled) setPaperLoading(false) })
    return () => { cancelled = true }
  }, [session])

  const answersMap = useMemo(
    () => new Map(answers.map((a) => [a.question_id, a.selected_answer] as [string, CorrectAnswer])),
    [answers],
  )
  const resultsMap = useMemo(
    () => new Map(answers.map((a) => [a.question_id, a.is_correct] as [string, boolean])),
    [answers],
  )
  const paperList = useMemo(
    () => (paperQuestions.length ? paperQuestions : answers.map((a) => a.questions).filter(Boolean)),
    [paperQuestions, answers],
  )

  const subjectStats = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>()
    for (const a of answers) {
      const q = a.questions
      if (!q) continue
      const s = q.subject || 'Other'
      const entry = map.get(s) || { total: 0, correct: 0 }
      // 案例分析题按小题口径统计(与得分口径一致)
      entry.total += questionItemCount(q)
      entry.correct += questionCorrectItemCount(q, a.selected_answer)
      map.set(s, entry)
    }
    return [...map.entries()].map(([name, v]) => ({ name, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
  }, [answers])

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

  const correct = session.correct_count
  const wrong = session.total_questions - correct
  const score = session.score ?? 0
  const avgSec = session.total_questions > 0
    ? Math.round(session.duration_ms / session.total_questions / 1000)
    : 0
  const rateColor =
    score >= 90
      ? 'text-emerald-600 dark:text-emerald-400'
      : score >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-6">
      {/* 成绩概览: 纯文本统计 */}
      <Card className="border-0 shadow-none">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
            <div className="min-w-[160px]">
              <p className="text-sm text-muted-foreground">{t('exam.score')}</p>
              <p className={cn('text-5xl font-bold tabular-nums leading-tight', rateColor)}>
                {score}
                <span className="ml-0.5 text-2xl font-semibold text-muted-foreground">%</span>
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('exam.correct')} {correct} · {t('exam.wrong')} {wrong}
              </p>
            </div>

            <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('exam.historyCorrectRate')}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {session.total_questions > 0 ? Math.round((correct / session.total_questions) * 100) : 0}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('exam.historyDuration')}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatDuration(session.duration_ms)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('exam.historyAvgTime')}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{avgSec}s</p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-xs text-muted-foreground">{t('exam.historyTime')}</p>
                <p className="mt-0.5 text-sm">
                  {session.completed_at ? new Date(session.completed_at).toLocaleString() : '-'}
                </p>
              </div>
            </div>
          </div>

          {subjectStats.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">各学科正确率</p>
              <div className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {subjectStats.map((s) => (
                  <div key={s.name} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">{s.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-medium">{s.rate}%</span>
                      <span className="text-xs text-muted-foreground"> ({s.correct}/{s.total})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{t('exam.reviewAnswers')}</h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView('paper')}
              className={viewBtnClass(view === 'paper')}
              title={t('examTemplate.paperMode')}
            >
              <FileText className="h-3 w-3" />
              {t('examTemplate.paperMode')}
            </button>
            <button
              type="button"
              onClick={() => setView('card')}
              className={viewBtnClass(view === 'card')}
              title={t('examTemplate.cardMode')}
            >
              <LayoutGrid className="h-3 w-3" />
              {t('examTemplate.cardMode')}
            </button>
          </div>
        </div>

        {view === 'paper' ? (
          paperLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="rounded-lg bg-muted/30">
              <ExamPaperReview
                title={t('exam.reviewPaperTitle')}
                meta={[
                  session.completed_at ? new Date(session.completed_at).toLocaleString() : '',
                  `${t('exam.score')} ${session.score ?? 0}%`,
                ].filter(Boolean).join(' · ')}
                questions={paperList}
                answers={answersMap}
                results={resultsMap}
              />
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {answers.map((ans) => (
              <QuestionCard
                key={ans.id}
                question={ans.questions}
                selectedAnswer={ans.selected_answer}
                showResult
                showEditLink={isAdmin}
              />
            ))}
          </div>
        )}
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
