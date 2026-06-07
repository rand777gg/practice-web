import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Textarea } from '@/components/ui/textarea'
import { Check, ChevronDown, Shuffle } from 'lucide-react'
import { isAnswerCorrect } from '@/lib/answer-utils'
import type { Question, CorrectAnswer, Profile, QuestionType } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

function getGoalSubjects(profile: Profile | null): string[] {
  if (!profile) return []
  const subjects = new Set<string>()

  try {
    const raw = profile.daily_targets ? JSON.parse(profile.daily_targets) : []
    for (const t of normalizeDailyTargets(raw)) {
      for (const s of t.subjects) subjects.add(s.subject)
    }
  } catch { /* ignore parse errors */ }

  try {
    const plans = profile.plan_subjects ? JSON.parse(profile.plan_subjects) : []
    if (Array.isArray(plans)) for (const s of plans) subjects.add(s)
  } catch { /* ignore parse errors */ }

  return [...subjects]
}

export function PracticeSession() {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [question, setQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [noQuestions, setNoQuestions] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const { saveAnswer, updateNote } = useUserAnswers()
  const { isFavorite, toggleFavorite } = useFavorites()

  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filteredCategories, setFilteredCategories] = useState<string[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      const goalSubjects = getGoalSubjects(profile)
      if (goalSubjects.length > 0) {
        // When goals are set, limit subject options to goal subjects only
        const goalSet = new Set(goalSubjects)
        setSubjects(goalSubjects.filter((s) => subs.has(s)).sort())
        const goalCats = new Set<string>()
        for (const row of data ?? []) {
          if (row.subject && goalSet.has(row.subject) && row.category) goalCats.add(row.category)
        }
        setCategories(goalCats.size > 0 ? [...goalCats].sort() : [...cats].sort())
        setFilteredCategories(goalCats.size > 0 ? [...goalCats].sort() : [...cats].sort())
      } else {
        setSubjects([...subs].sort())
        setCategories([...cats].sort())
        setFilteredCategories([...cats].sort())
      }
    }
    loadFilters()
  }, [profile])

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
    setAnswerId(null)

    const goalSubjects = getGoalSubjects(profile)

    let query = supabase.from('questions').select('*', { count: 'exact' })
    if (goalSubjects.length > 0) {
      // Scoped to goal subjects: manual pick narrows further, otherwise all goal subjects
      query = selectedSubject
        ? query.eq('subject', selectedSubject)
        : query.in('subject', goalSubjects)
    } else if (selectedSubject) {
      query = query.eq('subject', selectedSubject)
    }
    if (selectedCategory) query = query.eq('category', selectedCategory)
    if (selectedType) query = query.eq('question_type', selectedType)

    const { data } = await query

    if (!data || data.length === 0) {
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    const randomIndex = Math.floor(Math.random() * data.length)
    const picked = data[randomIndex] as unknown as Question
    setQuestion(picked)

    const currentUser = useAuthStore.getState().user
    if (currentUser) {
      const { data: statsData } = await supabase
        .from('user_answers')
        .select('is_correct, note, is_public')
        .eq('user_id', currentUser.id)
        .eq('question_id', picked.id)
        .order('answered_at', { ascending: false })

      const total = statsData?.length ?? 0
      const wrong = statsData?.filter((a) => !a.is_correct).length ?? 0
      setAttemptCount(total)
      setWrongCount(wrong)

      const latestNote = statsData?.find((a) => a.note)?.note ?? ''
      const latestIsPublic = statsData?.find((a) => a.note)?.is_public ?? false
      setNote(latestNote)
      setIsPublic(latestIsPublic)
    }

    setIsLoading(false)
  }, [selectedSubject, selectedCategory, selectedType, profile])

  useEffect(() => {
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  const handleSelect = (answer: CorrectAnswer) => {
    if (isSubmitted) return
    setSelectedAnswer(answer)
  }

  const bumpRefresh = useRefreshStore((s) => s.bump)

  const handleSubmit = async () => {
    if (!question || selectedAnswer === null) return
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correct_answer, question.question_type)
    const id = await saveAnswer(question.id, selectedAnswer, isCorrect, 'practice')
    setAnswerId(id)
    bumpRefresh()
    setIsSubmitted(true)
  }

  const handleNoteChange = async (value: string, pub?: boolean) => {
    setNote(value)
    if (answerId) {
      await updateNote(answerId, value, pub !== undefined ? pub : isPublic)
    }
  }

  const handlePublicToggle = async (pub: boolean) => {
    setIsPublic(pub)
    if (answerId) {
      await updateNote(answerId, note, pub)
    }
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedType ? t(`questionTypes.${selectedType}` as any) : t('questions.questionType')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}>
              <span className="text-muted-foreground">{t('questions.questionType')}</span>
              {!selectedType && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>
                {t(`questionTypes.${o.value}` as any)}
                {selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <LoadingTips className="py-12" compact />
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
              note={note}
              isFavorited={question ? isFavorite(question.id) : false}
              onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined}
            />
          </div>
          {isSubmitted && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
              <Textarea
                placeholder={t('practice.notePlaceholder')}
                value={note}
                onChange={(e) => handleNoteChange(e.target.value)}
                rows={3}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => handlePublicToggle(e.target.checked)}
                  className="rounded"
                />
                {t('notes.makePublic')}
              </label>
            </div>
          )}
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
