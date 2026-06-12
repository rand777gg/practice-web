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
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { NoteEditor } from '@/components/notes/NoteEditor'
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

  const initRef = useRef(false)
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')
  const [questionMode, setQuestionMode] = useState<'new' | 'wrong' | 'mixed'>('mixed')

  useEffect(() => {
    if (!initRef.current && planSubjectSet.size > 0) {
      setSelectedSubjects([...planSubjectSet])
      initRef.current = true
    }
  }, [planSubjectSet])

  useEffect(() => {
    updateFilteredCategories(selectedSubjects.length === 1 ? selectedSubjects[0] : '')
    setSelectedCategory('')
  }, [selectedSubjects, updateFilteredCategories])

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

    const currentUser = useAuthStore.getState().user

    // Pick question based on mode
    let pickedId: string | null = null

    if (currentUser && questionMode === 'wrong') {
      // Wrong mode: pick from previously wrong-answered questions
      const { data: wrongRows } = await supabase.from('user_answers')
        .select('question_id, questions!inner(subject, category, question_type)')
        .eq('user_id', currentUser.id)
        .eq('is_correct', false)
        .order('answered_at', { ascending: false })
        .limit(200)
      if (fetchGenRef.current !== myGen) return
      if (wrongRows?.length) {
        let filtered = wrongRows
        if (selectedSubjects.length > 0) filtered = filtered.filter((r: any) => selectedSubjects.includes(r.questions?.subject))
        if (selectedCategory) filtered = filtered.filter((r: any) => r.questions?.category === selectedCategory || (r.questions?.categories as string[])?.includes(selectedCategory))
        if (selectedType) filtered = filtered.filter((r: any) => r.questions?.question_type === selectedType)
        if (filtered.length > 0) pickedId = filtered[Math.floor(Math.random() * filtered.length)].question_id
      }
    }

    if (!pickedId && currentUser) {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('get_random_question_id', {
        p_user_id: currentUser.id,
        p_subjects: selectedSubjects.length > 0 ? selectedSubjects : planSubjectSet.size > 0 ? [...planSubjectSet] : null,
        p_categories: selectedCategory ? [selectedCategory] : null,
        p_question_type: selectedType || null,
      })
      if (fetchGenRef.current !== myGen) return

      if (!rpcErr && rpcId) {
        pickedId = rpcId
      }
    }

    if (fetchGenRef.current !== myGen) return

    // Offline fallback: try IndexedDB prefetched questions
    if (!pickedId) {
      const localIds = await getPrefetchedQuestionIds()
      if (localIds.length > 0) {
        pickedId = localIds[Math.floor(Math.random() * localIds.length)]
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
      if (fetchGenRef.current !== myGen) return
      const localQ = await getPrefetchedQuestion(pickedId!)
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
  }, [selectedSubjects, selectedCategory, selectedType, planSubjectSet])

  useEffect(() => {
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  const handleSelect = useCallback((answer: CorrectAnswer) => {
    if (isSubmitted) return
    setSelectedAnswer(answer)
  }, [isSubmitted])

  const bumpRefresh = useRefreshStore((s) => s.bump)

  const handleSubmit = async () => {
    if (!question || selectedAnswer === null) return
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correct_answer, question.question_type)
    const id = await saveAnswer(question.id, selectedAnswer, isCorrect, 'practice')
    setAnswerId(id)
    bumpRefresh()
    setIsSubmitted(true)
  }

  const noteSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPublicRef = useRef(isPublic)
  isPublicRef.current = isPublic

  useEffect(() => {
    if (!answerId) return
    if (noteSaveRef.current) clearTimeout(noteSaveRef.current)
    noteSaveRef.current = setTimeout(() => {
      updateNote(answerId, note, isPublicRef.current)
    }, 1000)
    return () => { if (noteSaveRef.current) clearTimeout(noteSaveRef.current) }
  }, [note, answerId, updateNote])

  const handlePublicToggle = useCallback(async (pub: boolean) => {
    setIsPublic(pub)
    if (answerId) {
      await updateNote(answerId, note, pub)
    }
  }, [answerId, note, updateNote])

  const handleNext = useCallback(() => {
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: handleNext,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedSubjects.length > 0 ? `${t('questions.subject')}(${selectedSubjects.length})` : t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {planSubjects.length > 0 && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {t('plan.longTerm')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {planSubjects.map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={selectedSubjects.includes(s)}
                        onCheckedChange={() => {
                          setSelectedSubjects((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }}
                      >
                        {s}
                      </DropdownMenuCheckboxItem>
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
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={selectedSubjects.includes(s)}
                        onCheckedChange={() => {
                          setSelectedSubjects((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }}
                      >
                        {s}
                      </DropdownMenuCheckboxItem>
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
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={selectedSubjects.includes(s)}
                        onCheckedChange={() => {
                          setSelectedSubjects((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }}
                      >
                        {s}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {selectedSubjects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedSubjects([])} className="text-muted-foreground">
                  清除筛选
                </DropdownMenuItem>
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
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {{ new: '新题优先', wrong: '错题优先', mixed: '混合模式' }[questionMode]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setQuestionMode('mixed')}>
              混合模式
              {questionMode === 'mixed' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionMode('new')}>
              新题优先
              {questionMode === 'new' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionMode('wrong')}>
              错题优先
              {questionMode === 'wrong' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
          <Skeleton className="h-6 w-3/4" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-32" />
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
              note={note}
              isFavorited={question ? isFavorite(question.id) : false}
              onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined}
            />
          </div>
          {isSubmitted && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
              <NoteEditor
                placeholder={t('practice.notePlaceholder')}
                value={note}
                onChange={setNote}
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
