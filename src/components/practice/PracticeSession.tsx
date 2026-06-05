import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { Check, ChevronDown, Shuffle } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function PracticeSession() {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [question, setQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [noQuestions, setNoQuestions] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const { saveAnswer } = useUserAnswers()
  const user = useAuthStore((s) => s.user)

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

  const fetchRandomQuestion = useCallback(async () => {
    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)

    let query = supabase.from('questions').select('*', { count: 'exact' })
    if (selectedSubject) query = query.eq('subject', selectedSubject)
    if (selectedCategory) query = query.eq('category', selectedCategory)

    const { data } = await query

    if (!data || data.length === 0) {
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    const randomIndex = Math.floor(Math.random() * data.length)
    const picked = data[randomIndex] as unknown as Question
    setQuestion(picked)

    if (user) {
      const { data: statsData } = await supabase
        .from('user_answers')
        .select('is_correct')
        .eq('user_id', user.id)
        .eq('question_id', picked.id)
      const total = statsData?.length ?? 0
      const wrong = statsData?.filter((a) => !a.is_correct).length ?? 0
      setAttemptCount(total)
      setWrongCount(wrong)
    }

    setIsLoading(false)
  }, [selectedSubject, selectedCategory, user])

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

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: handleNext,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : noQuestions ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{t('practice.noQuestions')}</p>
          <Button variant="outline" onClick={fetchRandomQuestion}>
            <Shuffle className="h-4 w-4" />
            {t('practice.tryAgain')}
          </Button>
        </div>
      ) : !question ? null : (
        <>
          <div
            className="touch-pan-y select-none"
            style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <QuestionCard
              question={question}
              selectedAnswer={selectedAnswer}
              showResult={isSubmitted}
              onSelect={handleSelect}
              disabled={isSubmitted}
              showEditLink={isAdmin}
              attemptCount={attemptCount}
              wrongCount={wrongCount}
            />
          </div>
          <div className="flex gap-2 justify-end">
            {!isSubmitted ? (
              <>
                {attemptCount > 0 && (
                  <Button variant="outline" onClick={handleNext}>
                    {t('practice.skip')}
                  </Button>
                )}
                <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                  {t('practice.submitAnswer')}
                </Button>
              </>
            ) : (
              <Button onClick={handleNext}>
                <Shuffle className="h-4 w-4" />
                {t('practice.nextQuestion')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
