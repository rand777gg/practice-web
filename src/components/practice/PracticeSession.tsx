import { useState, useEffect, useCallback, useRef } from 'react'
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
} from '@/components/ui/dropdown-menu'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Textarea } from '@/components/ui/textarea'
import { Check, ChevronDown, Shuffle, Sparkles } from 'lucide-react'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { getPrefetchedQuestionIds, getPrefetchedQuestion, getQuestionStat, upsertQuestionStat } from '@/lib/offline-db'
import { useEbbinghausReview } from '@/hooks/use-ebbinghaus-review'
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
  } catch { /* ignore */ }
  try {
    const plans = profile.plan_subjects ? JSON.parse(profile.plan_subjects) : []
    if (Array.isArray(plans)) for (const s of plans) subjects.add(s)
  } catch { /* ignore */ }
  return [...subjects]
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickRandomBatch<T>(arr: T[], count: number): T[] {
  if (count <= 0 || arr.length === 0) return []
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

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
  const { reviewItems, reviewCount, loading: reviewLoading } = useEbbinghausReview()
  const reviewItemsRef = useRef(reviewItems)
  reviewItemsRef.current = reviewItems // always current, no dep needed
  const [ebbinghausMode, setEbbinghausMode] = useState(false)
  const prefetchPromiseRef = useRef<Promise<void> | null>(null)

  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  useEffect(() => {
    updateFilteredCategories(selectedSubject)
    setSelectedCategory('')
  }, [selectedSubject, updateFilteredCategories])

  const loadQuestionFromLocal = useCallback(async (pickedId: string) => {
    const local = await getPrefetchedQuestion(pickedId)
    if (local) {
      // Already prefetched — set from IndexedDB instantly
      setQuestion(local as Question)
      // Note: skip server stats, use local stats
      const stat = await getQuestionStat(pickedId)
      setAttemptCount(stat?.attemptCount ?? 0)
      setWrongCount(stat?.wrongCount ?? 0)
      return true
    }
    return false
  }, [])

  const loadStatsFromServer = useCallback(async (pickedId: string) => {
    const currentUser = useAuthStore.getState().user
    if (!currentUser) return
    const { data: statsData } = await supabase
      .from('user_answers')
      .select('is_correct, note, is_public')
      .eq('user_id', currentUser.id)
      .eq('question_id', pickedId)
      .order('answered_at', { ascending: false })

    if (statsData && statsData.length > 0) {
      const total = statsData.length
      const wrong = statsData.filter((a) => !a.is_correct).length
      setAttemptCount(total)
      setWrongCount(wrong)
      const latestNote = statsData.find((a) => a.note)?.note ?? ''
      const latestIsPublic = statsData.find((a) => a.note)?.is_public ?? false
      setNote(latestNote)
      setIsPublic(latestIsPublic)
    }
  }, [])

  const fetchRandomQuestion = useCallback(async () => {
    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)

    // Step 1: get available question IDs — try local first, fallback to server
    const goalSubjects = getGoalSubjects(profile)
    const localIds = await getPrefetchedQuestionIds()

    let availableIds: string[] = []

    if (localIds.length > 0) {
      // Filter locally-prefetched IDs by the same filter criteria server-side
      // For now, use all local IDs — the server query below acts as fallback
      availableIds = localIds
    }

    // Always fetch server IDs for accuracy (filters, goal subjects)
    let idQuery = supabase.from('questions').select('id')
    if (goalSubjects.length > 0) {
      idQuery = selectedSubject
        ? idQuery.eq('subject', selectedSubject)
        : idQuery.in('subject', goalSubjects)
    } else if (selectedSubject) {
      idQuery = idQuery.eq('subject', selectedSubject)
    }
    if (selectedCategory) idQuery = idQuery.eq('category', selectedCategory)
    if (selectedType) idQuery = idQuery.eq('question_type', selectedType)

    const { data: serverIds } = await idQuery
    if (serverIds && serverIds.length > 0) {
      availableIds = serverIds.map((r: any) => r.id)
    }

    // Ebbinghaus review mode: prioritize at-risk questions (read from ref to avoid dep churn)
    const currentReviewItems = reviewItemsRef.current
    if (ebbinghausMode && currentReviewItems.length > 0) {
      const reviewIdSet = new Set(currentReviewItems.map((r) => r.questionId))
      const reviewPool = availableIds.filter((id) => reviewIdSet.has(id))
      const nonReviewPool = availableIds.filter((id) => !reviewIdSet.has(id))
      // Mix: 80% review + 20% fresh for variety
      if (reviewPool.length > 0) {
        availableIds = [...reviewPool, ...pickRandomBatch(nonReviewPool, Math.ceil(reviewPool.length * 0.25))]
      }
    }

    if (availableIds.length === 0) {
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    // Step 2: pick random, try local first, fallback to server fetch
    const pickedId = pickRandom(availableIds)
    const fromLocal = await loadQuestionFromLocal(pickedId)

    if (!fromLocal) {
      const { data: qData, error: qErr } = await supabase
        .from('questions').select('*').eq('id', pickedId).single()
      if (qErr || !qData) {
        setNoQuestions(true)
        setIsLoading(false)
        return
      }
      setQuestion(qData as unknown as Question)
    }

    // Load stats from server in background
    loadStatsFromServer(pickedId)

    setIsLoading(false)

    // Step 3: prefetch next question in background
    prefetchPromiseRef.current = (async () => {
      if (availableIds.length <= 1) return
      const nextId = pickRandom(availableIds.filter((id) => id !== pickedId))
      const alreadyHave = await getPrefetchedQuestion(nextId)
      if (alreadyHave) return
      const { data } = await supabase.from('questions').select('*').eq('id', nextId).single()
      if (data) {
        const { bulkPrefetchQuestions } = await import('@/lib/offline-db')
        await bulkPrefetchQuestions([{ id: nextId, data }])
      }
    })()
  }, [selectedSubject, selectedCategory, selectedType, ebbinghausMode, profile?.daily_targets, profile?.plan_subjects, loadQuestionFromLocal, loadStatsFromServer])

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

    // Update local stats
    await upsertQuestionStat({
      question_id: question.id,
      attemptCount: 1,
      wrongCount: isCorrect ? 0 : 1,
      lastAnsweredAt: new Date().toISOString(),
    })
    setAttemptCount((c) => c + 1)
    if (!isCorrect) setWrongCount((c) => c + 1)

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
    // Wait for background prefetch to settle if active
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

          {reviewCount > 0 && (
            <Button
              variant={ebbinghausMode ? 'default' : 'outline'}
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setEbbinghausMode((v) => !v)}
              disabled={reviewLoading}
            >
              <Sparkles className={`h-3.5 w-3.5 ${ebbinghausMode ? 'text-white' : 'text-amber-500'}`} />
              <span className="hidden sm:inline">艾宾浩斯</span>
              <span className="tabular-nums">({reviewCount})</span>
            </Button>
          )}
        </div>

        {ebbinghausMode && reviewCount > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-1.5">
            艾宾浩斯复习模式：优先展示 {reviewCount} 道临近遗忘的题目（80%复习 + 20%新题）
          </p>
        )}

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
