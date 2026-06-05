import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import type { UserAnswer, Question } from '@/types'
import { useT } from '@/i18n/use-t'

type FilterMode = 'all' | 'practice' | 'exam'

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const [mode, setMode] = useState<FilterMode>('all')
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchAnswers = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    let query = supabase
      .from('user_answers')
      .select('*, questions(*)')
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .order('answered_at', { ascending: false })

    if (mode !== 'all') {
      query = query.eq('mode', mode)
    }

    const { data } = await query
    setAnswers((data ?? []) as (UserAnswer & { questions: Question })[])
    setIsLoading(false)
  }, [user, mode])

  useEffect(() => {
    fetchAnswers()
  }, [fetchAnswers])

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">{t('review.title')}</h1>
        <div className="flex gap-1">
          {(['all', 'practice', 'exam'] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode(m)}
              className="text-xs h-8"
            >
              {t(`review.${m}`)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : answers.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t('review.noWrong')}</p>
      ) : (
        <div className="space-y-4">
          {answers.map((ans) => (
            <QuestionCard
              key={ans.id}
              question={ans.questions}
              selectedAnswer={ans.selected_answer}
              showResult
            />
          ))}
        </div>
      )}
    </div>
  )
}
