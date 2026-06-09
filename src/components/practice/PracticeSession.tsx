import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Textarea } from '@/components/ui/textarea'
import { Check, ChevronDown, Shuffle } from 'lucide-react'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { getPrefetchedQuestionIds, getPrefetchedQuestion } from '@/lib/offline-db'
import type { Question, CorrectAnswer, QuestionType } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'


export function PracticeSession() {
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
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
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()

  const planSubjects = useMemo(() => {
    if (!profile?.plan_subjects) return [] as string[]
    try { const p = JSON.parse(profile.plan_subjects); return Array.isArray(p) ? p : [] } catch { return [] }
  }, [profile?.plan_subjects])

  const dailyTargetSubjects = useMemo(() => {
    if (!profile?.daily_targets) return [] as string[]
    try {
      const raw = normalizeDailyTargets(JSON.parse(profile.daily_targets))
      const planSet = new Set(planSubjects)
      return [...new Set(raw.flatMap((t) => t.subjects.map((s) => s.subject)))].filter((s) => !planSet.has(s))
    } catch { return [] }
  }, [profile?.daily_targets, planSubjects])

  const planSubjectSet = useMemo(() => new Set([...planSubjects, ...dailyTargetSubjects]), [planSubjects, dailyTargetSubjects])
  const otherSubjects = useMemo(() => subjects.filter((s) => !planSubjectSet.has(s)), [subjects, planSubjectSet])

  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')
  useEffect(() => {
    updateFilteredCategories(selectedSubject)
    setSelectedCategory('')
  }, [selectedSubject, updateFilteredCategories])

  const yearCategories = useMemo(
    () => filteredCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)),
    [filteredCategories],
  )
  const nonYearCategories = useMemo(
    () => filteredCategories.filter((c) => !/^\d{4}年真题$/.test(c)),
    [filteredCategories],
  )

  const fetchGenRef = useRef(0)

  const fetchRandomQuestion = useCallback(async () => {
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)

    // Step 1: fetch only IDs (lightweight, ~100x smaller than fetching all columns)
    let idQuery = supabase.from('questions').select('id')
    if (selectedSubject) {
      idQuery = idQuery.eq('subject', selectedSubject)
    } else if (planSubjectSet.size > 0) {
      idQuery = idQuery.in('subject', [...planSubjectSet])
    }
    if (selectedCategory) idQuery = idQuery.eq('category', selectedCategory)
    if (selectedType) idQuery = idQuery.eq('question_type', selectedType)

    const { data: ids, error: idsErr } = await idQuery
    if (fetchGenRef.current !== myGen) return

    if (idsErr || !ids || ids.length === 0) {
      // Offline fallback: try IndexedDB prefetched questions
      if (fetchGenRef.current !== myGen) return
      const localIds = await getPrefetchedQuestionIds()
      if (localIds.length > 0) {
        const pickedId = localIds[Math.floor(Math.random() * localIds.length)]
        const localQ = await getPrefetchedQuestion(pickedId)
        if (localQ) {
          setQuestion(localQ as Question)
          setIsLoading(false)
          return
        }
      }
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    // Step 2: prioritize unanswered questions, then pick random from the best pool
    const allIds = ids.map((r) => r.id)
    const currentUser = useAuthStore.getState().user

    let pickPool = allIds
    if (currentUser) {
      // Find IDs the user has already answered
      const { data: answered } = await supabase.from('user_answers')
        .select('question_id')
        .eq('user_id', currentUser.id)
        .in('question_id', allIds)
      const answeredSet = new Set((answered || []).map((a) => a.question_id))
      const unanswered = allIds.filter((id) => !answeredSet.has(id))
      if (unanswered.length > 0) pickPool = unanswered
    }

    const pickedId = pickPool[Math.floor(Math.random() * pickPool.length)]

    const [qRes, statsRes] = await Promise.all([
      supabase.from('questions').select('*').eq('id', pickedId).single(),
      currentUser
        ? supabase.from('user_answers')
            .select('is_correct, note, is_public')
            .eq('user_id', currentUser.id)
            .eq('question_id', pickedId)
            .order('answered_at', { ascending: false })
        : Promise.resolve(null),
    ])
    if (fetchGenRef.current !== myGen) return

    if (qRes.error || !qRes.data) {
      // Offline fallback: try IndexedDB
      if (fetchGenRef.current !== myGen) return
      const localQ = await getPrefetchedQuestion(pickedId)
      if (localQ) {
        setQuestion(localQ as Question)
        setIsLoading(false)
        return
      }
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    setQuestion(qRes.data as unknown as Question)

    const statsData = statsRes?.data
    const total = statsData?.length ?? 0
    const wrong = statsData?.filter((a) => !a.is_correct).length ?? 0
    setAttemptCount(total)
    setWrongCount(wrong)
    const latestNote = statsData?.find((a) => a.note)?.note ?? ''
    const latestIsPublic = statsData?.find((a) => a.note)?.is_public ?? false
    setNote(latestNote)
    setIsPublic(latestIsPublic)

    setIsLoading(false)
  }, [selectedSubject, selectedCategory, selectedType, planSubjectSet])

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
            {planSubjects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {t('plan.longTerm')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {planSubjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                        {s}
                        {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {dailyTargetSubjects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {t('plan.dailyTarget')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {dailyTargetSubjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                        {s}
                        {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {otherSubjects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    其他
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {otherSubjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                        {s}
                        {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
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
            {yearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    历年真题
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {yearCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                        {c}
                        {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {nonYearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {nonYearCategories.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                    {c}
                    {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
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
