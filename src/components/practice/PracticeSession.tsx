import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Shuffle } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function PracticeSession() {
  const { t } = useT()
  const [question, setQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [noQuestions, setNoQuestions] = useState(false)
  const { saveAnswer } = useUserAnswers()

  const fetchRandomQuestion = useCallback(async () => {
    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)

    const { data, count } = await supabase
      .from('questions')
      .select('*', { count: 'exact' })

    if (!data || data.length === 0) {
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    const total = count ?? data.length
    const randomIndex = Math.floor(Math.random() * total)
    const { data: randomQ } = await supabase
      .from('questions')
      .select('*')
      .range(randomIndex, randomIndex)
      .single()

    setQuestion(randomQ as unknown as Question)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  const handleSelect = (index: number) => {
    if (isSubmitted) return
    setSelectedAnswer(index)
  }

  const handleSubmit = async () => {
    if (!question || selectedAnswer === null) return
    const isCorrect = selectedAnswer === question.correct_answer
    await saveAnswer(question.id, selectedAnswer, isCorrect, 'practice')
    setIsSubmitted(true)
  }

  const handleNext = () => {
    fetchRandomQuestion()
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (noQuestions) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">{t('practice.noQuestions')}</p>
        <Button variant="outline" onClick={fetchRandomQuestion}>
          <Shuffle className="h-4 w-4" />
          {t('practice.tryAgain')}
        </Button>
      </div>
    )
  }

  if (!question) return null

  return (
    <div className="space-y-4">
      <QuestionCard
        question={question}
        selectedAnswer={selectedAnswer}
        showResult={isSubmitted}
        onSelect={handleSelect}
        disabled={isSubmitted}
      />
      <div className="flex gap-2 justify-end">
        {!isSubmitted ? (
          <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
            {t('practice.submitAnswer')}
          </Button>
        ) : (
          <Button onClick={handleNext}>
            <Shuffle className="h-4 w-4" />
            {t('practice.nextQuestion')}
          </Button>
        )}
      </div>
    </div>
  )
}
