import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
import type { ExamSession, UserAnswer, Question } from '@/types'
import { RotateCcw } from 'lucide-react'
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

export function ExamResultDialog({ sessionId, open, onClose }: Props) {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [session, setSession] = useState<ExamSession | null>(null)
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
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

  const handleNewExam = () => {
    onClose()
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
