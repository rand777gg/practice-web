import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchQuestionsByIds } from '@/lib/exam-compose'
import { useAuthStore } from '@/stores/auth-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { ExamPaperReview } from './ExamPaperReview'
import type { ExamSession, UserAnswer, Question, CorrectAnswer } from '@/types'
import { RotateCcw, FileText, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

interface Props {
  sessionId: string
  open: boolean
  onClose: () => void
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

export function ExamResultDialog({ sessionId, open, onClose }: Props) {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [session, setSession] = useState<ExamSession | null>(null)
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [paperQuestions, setPaperQuestions] = useState<Question[]>([])
  const [paperLoading, setPaperLoading] = useState(true)
  const [view, setView] = useState<'paper' | 'card'>('paper')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    async function load() {
      const [{ data: sData }, { data: aData }] = await Promise.all([
        supabase.from('exam_sessions').select('*').eq('id', sessionId).single(),
        supabase
          .from('user_answers')
          .select('*, questions(*)')
          .eq('exam_session_id', sessionId)
          .order('answered_at', { ascending: true }),
      ])
      if (sData) setSession(sData as ExamSession)
      if (aData) setAnswers(aData as (UserAnswer & { questions: Question })[])
      setIsLoading(false)
    }
    load()
  }, [sessionId, open])

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

  const handleNewExam = () => {
    onClose()
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('exam.score')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !session ? (
          <p className="text-muted-foreground text-center py-4">{t('exam.sessionNotFound')}</p>
        ) : (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-4xl font-bold">{session.score}%</p>
              <p className="text-muted-foreground text-sm">
                {session.correct_count} / {session.total_questions} {t('exam.correct')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('exam.historyErrorRate')}: {session.total_questions > 0
                  ? Math.round(((session.total_questions - session.correct_count) / session.total_questions) * 100)
                  : 0}%
                &nbsp;|&nbsp;
                {t('exam.historyDuration')}: {formatDuration(session.duration_ms)}
              </p>
            </div>

            <div className="flex items-center gap-1">
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

            {view === 'paper' ? (
              paperLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <div className="rounded-lg bg-muted/30">
                  <ExamPaperReview
                    title={t('exam.reviewPaperTitle')}
                    meta={`${t('exam.score')} ${session.score ?? 0}%`}
                    questions={paperList}
                    answers={answersMap}
                    results={resultsMap}
                  />
                </div>
              )
            ) : (
              <div className="space-y-3">
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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                {t('exam.backDashboard')}
              </Button>
              <Button onClick={handleNewExam}>
                <RotateCcw className="h-4 w-4" />
                {t('exam.newExam')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
