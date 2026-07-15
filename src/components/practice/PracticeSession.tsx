import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useSequentialStore } from '@/stores/sequential-store'
import { usePlanStore } from '@/stores/plan-store'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { KpSelectDialog } from '@/components/practice/KpSelectDialog'
import { SequentialProgressBar } from '@/components/practice/SequentialProgressBar'
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
import { Checkbox } from '@/components/ui/checkbox'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { getPrefetchedQuestionIds, getPrefetchedQuestion } from '@/lib/offline-db'
import type { Question, CorrectAnswer, QuestionType } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

const PS_FILTERS = 'practice_filters'

interface PracticeFilters {
  selectedSubjects: string[]
  selectedCategory: string
  selectedType: string
  selectedKeyPoint: string
  questionMode: string
  questionScope: string
}

function loadFilters(): PracticeFilters | null {
  try { const r = localStorage.getItem(PS_FILTERS); return r ? JSON.parse(r) : null } catch { return null }
}
function saveFilters(v: PracticeFilters) { try { localStorage.setItem(PS_FILTERS, JSON.stringify(v)) } catch {/* noop */} }

export function PracticeSession() {
  const saved = useRef(loadFilters())
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
  const seqActive = useSequentialStore((s) => s.isActive)
  const seqQuestionIds = useSequentialStore((s) => s.questionIds)
  const seqIndex = useSequentialStore((s) => s.currentIndex)
  const seqKps = useSequentialStore((s) => s.selectedKps)
  const seqNext = useSequentialStore((s) => s.nextQuestion)
  const seqStart = useSequentialStore((s) => s.startSequential)
  const seqReset = useSequentialStore((s) => s.reset)
  const seqLoadFromDb = useSequentialStore((s) => s.loadFromDb)
  const seqGetCurrentKpInfo = useSequentialStore((s) => s.getCurrentKpInfo)

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
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(saved.current?.selectedSubjects ?? [])
  const [selectedCategory, setSelectedCategory] = useState(saved.current?.selectedCategory ?? '')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>((saved.current?.selectedType as QuestionType) ?? '')
  const [selectedKeyPoint, setSelectedKeyPoint] = useState(saved.current?.selectedKeyPoint ?? '')
  const [kpBySubject, setKpBySubject] = useState<{ subject: string; keyPoints: string[] }[]>([])
  const [questionMode, setQuestionMode] = useState<'new' | 'wrong' | 'mixed' | 'sequential'>((saved.current?.questionMode as any) ?? 'mixed')
  const [questionScope, setQuestionScope] = useState<'all' | 'favorites' | 'wrong'>((saved.current?.questionScope as any) ?? 'all')
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false)

  // Persist filters to localStorage
  useEffect(() => {
    saveFilters({ selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope })
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope])

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

  useEffect(() => { kpRetryRef.current = 0 }, [selectedKeyPoint])

  // Load distinct key_points for filter dropdown, grouped by subject
  useEffect(() => {
    let c = false
    supabase.from('questions').select('subject, key_points').not('key_points', 'is', null).then(({ data }) => {
      if (c) return
      const m = new Map<string, Set<string>>()
      for (const r of (data ?? [])) { const s = (r as any).subject || '其他'; if (!m.has(s)) m.set(s, new Set()); if ((r as any).key_points) for (const k of ((r as any).key_points as string).split(/[,，;；]/)) { const t = k.trim(); if (t) m.get(s)!.add(t) } }
      setKpBySubject([...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([s, ks]) => ({ subject: s, keyPoints: [...ks].sort((a2, b2) => a2.localeCompare(b2, 'zh-CN')) })))
    })
    return () => { c = true }
  }, [])

  const yearCategories = useMemo(
    () => filteredCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)),
    [filteredCategories],
  )
  const nonYearCategories = useMemo(
    () => filteredCategories.filter((c) => !/^\d{4}年真题$/.test(c)),
    [filteredCategories],
  )

  const fetchGenRef = useRef(0)
  const kpRetryRef = useRef(0)

  const fetchRandomQuestion = useCallback(async () => {
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)

    const currentUser = useAuthStore.getState().user

    // Pick question based on scope + mode
    let pickedId: string | null = null

    // Scope: favorites — pick from user's favorited questions
    if (currentUser && questionScope === 'favorites') {
      const { data: favRows } = await supabase.from('favorites')
        .select('question_id, questions!inner(subject, category, question_type, key_points)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (fetchGenRef.current !== myGen) return
      if (favRows?.length) {
        let filtered = favRows
        if (selectedSubjects.length > 0) filtered = filtered.filter((r: any) => selectedSubjects.includes(r.questions?.subject))
        if (selectedCategory) filtered = filtered.filter((r: any) => r.questions?.category === selectedCategory || (r.questions?.categories as string[])?.includes(selectedCategory))
        if (selectedType) filtered = filtered.filter((r: any) => r.questions?.question_type === selectedType)
        if (selectedKeyPoint) filtered = filtered.filter((r: any) => (r.questions?.key_points || '').includes(selectedKeyPoint))
        if (filtered.length > 0) pickedId = filtered[Math.floor(Math.random() * filtered.length)].question_id
      }
    }

    // Scope: wrong — pick from previously wrong-answered questions
    if (!pickedId && currentUser && (questionScope === 'wrong' || (questionScope === 'all' && questionMode === 'wrong'))) {
      const { data: wrongRows } = await supabase.from('user_answers')
        .select('question_id, questions!inner(subject, category, question_type, key_points)')
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
        if (selectedKeyPoint) filtered = filtered.filter((r: any) => (r.questions?.key_points || '').includes(selectedKeyPoint))
        if (filtered.length > 0) pickedId = filtered[Math.floor(Math.random() * filtered.length)].question_id
      }
    }

    // Scope: all with mixed/new mode — RPC random pick
    if (!pickedId && currentUser && questionScope === 'all' && questionMode !== 'wrong') {
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

    // RPC doesn't filter by key_points, check post-fetch and retry up to 5 times
    const kpRetry = kpRetryRef.current
    if (selectedKeyPoint && !(qRes.data?.key_points || '').includes(selectedKeyPoint) && kpRetry < 5) {
      kpRetryRef.current = kpRetry + 1
      fetchRandomQuestion()
      return
    }

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
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, planSubjectSet, questionMode, questionScope])

  const seqFetchGenRef = useRef(0)
  const loadSequentialQuestion = useCallback(async (index: number) => {
    seqFetchGenRef.current++; const myGen = seqFetchGenRef.current
    setIsLoading(true); setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null)
    const ids = useSequentialStore.getState().questionIds
    if (index >= ids.length) { setNoQuestions(true); setIsLoading(false); return }
    const currentUser = useAuthStore.getState().user
    const [qRes, statsRes] = await Promise.all([
      supabase.from('questions').select('*').eq('id', ids[index]).single(),
      currentUser ? supabase.from('user_answers').select('is_correct, note, is_public').eq('user_id', currentUser.id).eq('question_id', ids[index]).order('answered_at', { ascending: false }) : Promise.resolve(null),
    ])
    if (seqFetchGenRef.current !== myGen) return
    if (qRes.error || !qRes.data) { setNoQuestions(true); setIsLoading(false); return }
    setQuestion(qRes.data as unknown as Question)
    const sd = statsRes?.data; setAttemptCount(sd?.length ?? 0); setWrongCount(sd?.filter((a: any) => !a.is_correct).length ?? 0)
    setNote(sd?.find((a: any) => a.note)?.note ?? ''); setIsPublic(sd?.find((a: any) => a.note)?.is_public ?? false)
    setIsLoading(false)
  }, [])

  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (questionMode === 'sequential' && seqActive) loadSequentialQuestion(seqIndex)
    else fetchRandomQuestion()
  }, [fetchRandomQuestion, questionMode, seqActive, seqIndex])

  const handleKpConfirm = useCallback(async (kps: string[]) => {
    const user = useAuthStore.getState().user; if (!user || kps.length === 0) return
    await seqStart(user.id, kps, selectedSubjects.length > 0 ? selectedSubjects : [...planSubjectSet], selectedType)
    loadSequentialQuestion(0)
  }, [selectedSubjects, selectedType, planSubjectSet, seqStart, loadSequentialQuestion])

  const prevModeRef = useRef(questionMode)
  useEffect(() => { const p = prevModeRef.current; prevModeRef.current = questionMode; if (p === questionMode) return
    if (questionMode === 'sequential') { const user = useAuthStore.getState().user; if (user) { seqLoadFromDb(user.id).then(r => { const s = useSequentialStore.getState(); if (r && s.selectedKps.length > 0 && s.questionIds.length > 0) loadSequentialQuestion(s.currentIndex); else setSequentialDialogOpen(true) }) } else setSequentialDialogOpen(true) }
    else { seqReset(); fetchRandomQuestion() }
  }, [questionMode])

  const handleSelect = useCallback((answer: CorrectAnswer) => {
    if (isSubmitted) return
    setSelectedAnswer(answer)
  }, [isSubmitted])

  const bumpRefresh = useRefreshStore((s) => s.bump)

  const handleSubmit = async () => {
    if (!question || selectedAnswer === null) return
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correct_answer, question.question_type, question.allow_unordered)
    const id = await saveAnswer(question.id, selectedAnswer, isCorrect, 'practice')
    setAnswerId(id)
    bumpRefresh()
    if (question) usePlanStore.getState().addDone(question.subject || 'Other')
    if (questionMode === 'sequential') { const s = useSequentialStore.getState(); supabase.from('practice_sequential_state').upsert({ user_id: useAuthStore.getState().user!.id, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, updated_at: new Date().toISOString() }).then(() => {}) }
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
    if (questionMode === 'sequential') { seqNext(); const s = useSequentialStore.getState(); const u = useAuthStore.getState().user; if (u) supabase.from('practice_sequential_state').upsert({ user_id: u.id, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, updated_at: new Date().toISOString() }).then(() => {}); loadSequentialQuestion(s.currentIndex) }
    else fetchRandomQuestion()
  }, [questionMode, seqNext, fetchRandomQuestion, loadSequentialQuestion])

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedKeyPoint || '知识点'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedKeyPoint('')}><span className="text-muted-foreground">不限知识点</span>{!selectedKeyPoint && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {kpBySubject.map(({ subject, keyPoints }) => (
              <DropdownMenuSub key={subject}><DropdownMenuSubTrigger className="text-xs">{subject}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{keyPoints.map(kp => <DropdownMenuItem key={kp} onClick={() => setSelectedKeyPoint(kp)}>{kp}{selectedKeyPoint === kp && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {questionMode !== 'sequential' && (<>
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {{ all: '全部题目', favorites: '仅收藏题目', wrong: '仅错题' }[questionScope]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setQuestionScope('all')}>全部题目{questionScope === 'all' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('favorites')}>仅收藏题目{questionScope === 'favorites' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('wrong')}>仅错题{questionScope === 'wrong' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </>)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {{ new: '新题优先', wrong: '错题优先', mixed: '混合模式', sequential: '顺序刷题' }[questionMode]}
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setQuestionMode('sequential')}>
              顺序刷题
              {questionMode === 'sequential' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {questionMode === 'sequential' && (<> <span className="w-px h-4 bg-border mx-1 hidden sm:block" /> <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setSequentialDialogOpen(true)}>{seqKps.length > 0 ? `${seqKps.length}个知识点` : '选择知识点'}<ChevronDown className="h-3 w-3" /></Button> </>)}
      </div>

      <KpSelectDialog open={sequentialDialogOpen} onOpenChange={setSequentialDialogOpen} kpBySubject={kpBySubject} planSubjects={[...planSubjectSet]} selectedKps={seqKps} onConfirm={handleKpConfirm} />

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
      ) : noQuestions && questionMode === 'sequential' ? (
        <div className="text-center py-12 space-y-4">
          <Check className="h-12 w-12 mx-auto text-green-500" />
          <p className="text-lg font-medium">{t('practice.sequentialDone')}</p>
          <p className="text-muted-foreground">{t('practice.sequentialDoneDesc')}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => { setQuestionMode('mixed'); seqReset() }}>{t('practice.backToNormalMode')}</Button>
            <Button onClick={() => { const u = useAuthStore.getState().user; if (u) { seqStart(u.id, seqKps, selectedSubjects.length > 0 ? selectedSubjects : [...planSubjectSet], selectedType).then(() => loadSequentialQuestion(0)) } }}><Shuffle className="h-4 w-4" />{t('practice.tryAgain')}</Button>
          </div>
        </div>
      ) : noQuestions ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{t('practice.noQuestions')}</p>
          <Button variant="outline" onClick={fetchRandomQuestion}>
            <Shuffle className="h-4 w-4" />
            {t('practice.tryAgain')}
          </Button>
        </div>
      ) : !question ? null : questionMode === 'sequential' ? (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="order-2 lg:order-1 lg:flex-[6] space-y-4">
            <div className="touch-pan-y select-none" style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
              <QuestionCard question={question} selectedAnswer={selectedAnswer} showResult={isSubmitted} onSelect={handleSelect} disabled={isSubmitted} showEditLink={isAdmin} attemptCount={attemptCount} wrongCount={wrongCount} note={note} isFavorited={question ? isFavorite(question.id) : false} onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined} onVerify={question && !question.verified ? async () => { await supabase.from('questions').update({ verified: true }).eq('id', question.id); setQuestion({ ...question, verified: true }) } : undefined} />
            </div>
            {isSubmitted && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
                <NoteEditor placeholder={t('practice.notePlaceholder')} value={note} onChange={setNote} />
                <div className="flex items-center justify-between"><div><p className="text-sm">{t('notes.makePublic')}</p><p className="text-xs text-muted-foreground">{isPublic ? t('notes.publicLabel') : t('notes.privateLabel')}</p></div><Checkbox checked={isPublic} onCheckedChange={(v) => handlePublicToggle(v === true)} /></div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              {!isSubmitted ? (<>{attemptCount > 0 && <Button variant="outline" onClick={handleNext}>{t('practice.skip')}</Button>}<Button onClick={handleSubmit} disabled={selectedAnswer === null}>{t('practice.submitAnswer')}</Button></>) : (<Button onClick={handleNext}><Shuffle className="h-4 w-4" />{t('practice.nextQuestion')}</Button>)}
            </div>
          </div>
          {seqActive && seqQuestionIds.length > 0 && (
            <div className="order-1 lg:order-2 lg:flex-[4] lg:max-h-[calc(100vh-10rem)] overflow-auto">
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h4 className="text-sm font-medium">{t('dashboard.kpProgress')}</h4>
                {(() => { const ki = seqGetCurrentKpInfo(); const qKp = question?.key_points?.split(/[,，;；]/)[0]?.trim(); return <SequentialProgressBar currentIndex={seqIndex} total={seqQuestionIds.length} kpCurrent={ki.kpCurrent || 0} kpTotal={ki.kpTotal || 0} kpName={ki.kpName || qKp || null} /> })()}
              </div>
            </div>
          )}
        </div>
      ) : (
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
              onVerify={question && !question.verified ? async () => {
                await supabase.from('questions').update({ verified: true }).eq('id', question.id)
                setQuestion({ ...question, verified: true })
              } : undefined}
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{t('notes.makePublic')}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPublic ? t('notes.publicLabel') : t('notes.privateLabel')}
                  </p>
                </div>
                <Checkbox checked={isPublic} onCheckedChange={(v) => handlePublicToggle(v === true)} />
              </div>
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
