import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { AiExplainPanel } from '@/components/practice/AiExplainPanel'
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
import { normalizeDailyTargets, getPlanTargets } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

const PS_FILTERS = 'practice_filters'
const PS_SESSION = 'practice_session'

interface PracticeFilters {
  selectedSubjects: string[]
  selectedCategory: string
  selectedType: string
  selectedKeyPoint: string
  questionScope: string
  kpOrder?: boolean
}

function loadPsFilters(): PracticeFilters | null {
  try { const r = localStorage.getItem(PS_FILTERS); if (r) return JSON.parse(r) } catch { /* noop */ }
  return null
}
function savePsFilters(v: PracticeFilters) { try { localStorage.setItem(PS_FILTERS, JSON.stringify(v)) } catch { /* noop */ } }
function loadPsSession() {
  try { const r = localStorage.getItem(PS_SESSION); if (r) return JSON.parse(r) } catch { /* noop */ }
  return null
}
function savePsSession(v: Record<string, unknown>) { try { localStorage.setItem(PS_SESSION, JSON.stringify(v)) } catch { /* noop */ } }
function clearPsSession() { try { localStorage.removeItem(PS_SESSION) } catch { /* noop */ } }

export function PracticeSession() {
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const isEnabled = useSettingsStore((s) => s.isEnabled)
  const savedFilters = useRef(loadPsFilters())
  const savedSession = useRef(loadPsSession())
  const hasSession = !!savedSession.current?.question

  const [question, setQuestion] = useState<Question | null>(savedSession.current?.question ?? null)
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(savedSession.current?.selectedAnswer ?? null)
  const [isSubmitted, setIsSubmitted] = useState(savedSession.current?.isSubmitted ?? false)
  const [isLoading, setIsLoading] = useState(!hasSession)
  const [noQuestions, setNoQuestions] = useState(false)
  const [attemptCount, setAttemptCount] = useState(savedSession.current?.attemptCount ?? 0)
  const [wrongCount, setWrongCount] = useState(savedSession.current?.wrongCount ?? 0)
  const [answerId, setAnswerId] = useState<string | null>(savedSession.current?.answerId ?? null)
  const [note, setNote] = useState(savedSession.current?.note ?? '')
  const [isPublic, setIsPublic] = useState(savedSession.current?.isPublic ?? false)
  const [lastWrong, setLastWrong] = useState(savedSession.current?.lastWrong ?? false)
  const { saveAnswer, updateNote } = useUserAnswers()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()

  const planTargets = useMemo(
    () => getPlanTargets(profile),
    [profile?.plan_targets, profile?.plan_subjects, profile?.plan_categories, profile?.plan_key_points, profile?.plan_wrong_only],
  )
  const planSubjects = useMemo(() => [...new Set(planTargets.flatMap((t) => t.subjects))], [planTargets])
  const planCategories = useMemo(() => [...new Set(planTargets.flatMap((t) => t.categories))], [planTargets])
  const planKeyPoints = useMemo(() => [...new Set(planTargets.flatMap((t) => t.keyPoints))], [planTargets])

  const dailyTargetSubjects = useMemo(() => {
    if (!profile?.daily_targets) return [] as string[]
    try {
      const raw = normalizeDailyTargets(JSON.parse(profile.daily_targets))
      const planSet = new Set(planSubjects)
      return [...new Set(raw.flatMap((t) => t.subjects))].filter((s) => !planSet.has(s))
    } catch { return [] }
  }, [profile?.daily_targets, planSubjects])

  const planSubjectSet = useMemo(() => new Set([...planSubjects, ...dailyTargetSubjects]), [planSubjects, dailyTargetSubjects])
  const otherSubjects = useMemo(() => subjects.filter((s) => !planSubjectSet.has(s)), [subjects, planSubjectSet])

  const anyTargetWrongOnly = useMemo(() => {
    if (!profile?.daily_targets) return false
    try { return normalizeDailyTargets(JSON.parse(profile.daily_targets)).some((t) => t.wrongOnly) } catch { return false }
  }, [profile?.daily_targets])
  const reviewWrong = planTargets.some((t) => t.wrongOnly) || anyTargetWrongOnly

  const initRef = useRef(hasSession || savedFilters.current !== null)
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(savedFilters.current?.selectedSubjects ?? [])
  const [selectedCategory, setSelectedCategory] = useState(savedFilters.current?.selectedCategory ?? '')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>((savedFilters.current?.selectedType as QuestionType) ?? '')
  const [selectedKeyPoint, setSelectedKeyPoint] = useState(savedFilters.current?.selectedKeyPoint ?? '')
  const [kpBySubject, setKpBySubject] = useState<{ subject: string; keyPoints: string[] }[]>([])
  const [questionScope, setQuestionScope] = useState<'all' | 'favorites' | 'wrong'>((savedFilters.current?.questionScope as 'all' | 'favorites' | 'wrong') ?? 'all')
  const kpOrder = savedFilters.current?.kpOrder ?? false

  // Kp-ordered sequential queue
  const seqIds = useRef<string[]>([])
  const seqIdx = useRef(-1)

  useEffect(() => {
    if (!initRef.current && planSubjectSet.size > 0) {
      setSelectedSubjects([...planSubjectSet])
      initRef.current = true
    }
  }, [planSubjectSet])

  // Long-term / custom "review wrong" plan → default practice to wrong-only scope
  const wrongInitRef = useRef(hasSession || savedFilters.current !== null)
  useEffect(() => {
    if (!wrongInitRef.current && reviewWrong) {
      setQuestionScope('wrong')
      wrongInitRef.current = true
    }
  }, [reviewWrong])

  const filtersReady = useRef(hasSession || savedFilters.current !== null)

  useEffect(() => {
    updateFilteredCategories(selectedSubjects.length === 1 ? selectedSubjects[0] : '')
    if (filtersReady.current) {
      setSelectedCategory('')
    } else {
      filtersReady.current = true
    }
  }, [selectedSubjects, updateFilteredCategories])


  // Load distinct key_points for filter dropdown, grouped by subject
  useEffect(() => {
    let c = false
    ;(async () => {
      const PAGE = 1000
      const allRows: any[] = []
      let from = 0
      while (true) {
        const { data } = await supabase.from('questions').select('subject, key_points').not('key_points', 'is', null).range(from, from + PAGE - 1)
        if (c || !data || data.length === 0) break
        allRows.push(...data)
        from += PAGE
      }
      if (c) return
      const m = new Map<string, Set<string>>()
      for (const r of allRows) { const s = (r as any).subject || '其他'; if (!m.has(s)) m.set(s, new Set()); if ((r as any).key_points) for (const k of ((r as any).key_points as string).split(/[,，;；]/)) { const t = k.trim(); if (t) m.get(s)!.add(t) } }
      setKpBySubject([...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([s, ks]) => ({ subject: s, keyPoints: [...ks].sort((a2, b2) => a2.localeCompare(b2, 'zh-CN')) })))
    })()
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

  const buildKpQueue = useCallback(async () => {
    const scopeCats = selectedCategory ? [selectedCategory] : planCategories
    const scopeKps = selectedKeyPoint ? [selectedKeyPoint] : planKeyPoints
    const subjects = selectedSubjects.length > 0 ? selectedSubjects : [...planSubjectSet]

    const PAGE = 1000
    const rows: any[] = []
    let from = 0
    while (true) {
      let q = supabase.from('questions').select('id, key_points').range(from, from + PAGE - 1)
      if (subjects.length > 0) q = q.in('subject', subjects)
      if (scopeCats.length > 0) q = q.in('category', scopeCats)
      if (selectedType) q = q.eq('question_type', selectedType)
      const { data } = await q
      if (!data || data.length === 0) break
      rows.push(...(data as any[]))
      from += PAGE
    }
    // Filter by keyPoints (client-side substring match)
    const filtered = scopeKps.length > 0
      ? rows.filter((r) => scopeKps.some((k: string) => (r.key_points || '').includes(k)))
      : rows

    // Sort by first key_point
    filtered.sort((a, b) => {
      const akp = (a.key_points || '').split(/[,，;；]/)[0].trim()
      const bkp = (b.key_points || '').split(/[,，;；]/)[0].trim()
      if (!akp && !bkp) return 0
      if (!akp) return 1
      if (!bkp) return -1
      return akp.localeCompare(bkp, 'zh-CN')
    })

    seqIds.current = filtered.map((r) => r.id)
    seqIdx.current = -1
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, planCategories, planKeyPoints, planSubjectSet])

  const fetchRandomQuestion = useCallback(async () => {
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    setIsLoading(true)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)

    const currentUser = useAuthStore.getState().user

    // Kp-order mode: sequential by key_point
    if (kpOrder) {
      if (seqIds.current.length === 0) await buildKpQueue()
      if (fetchGenRef.current !== myGen) return
      seqIdx.current++
      if (seqIdx.current >= seqIds.current.length) {
        setNoQuestions(true)
        setIsLoading(false)
        return
      }
      const id = seqIds.current[seqIdx.current]
      const { data: qData, error: qErr } = await supabase.from('questions').select('*').eq('id', id).single()
      if (fetchGenRef.current !== myGen) return
      if (qErr || !qData) {
        setNoQuestions(true)
        setIsLoading(false)
        return
      }
      setQuestion(qData as unknown as Question)
      const { data: stats } = currentUser
        ? await supabase.from('user_answers').select('is_correct, note, is_public').eq('user_id', currentUser.id).eq('question_id', id).order('answered_at', { ascending: false })
        : { data: null }
      if (fetchGenRef.current !== myGen) return
      const total = stats?.length ?? 0
      setAttemptCount(total)
      setWrongCount(stats?.filter((a) => !a.is_correct).length ?? 0)
      setLastWrong(stats?.[0] ? !(stats[0] as any).is_correct : false)
      setNote(stats?.find((a) => a.note)?.note ?? '')
      setIsPublic(stats?.find((a) => a.note)?.is_public ?? false)
      setIsLoading(false)
      return
    }

    // Pick question based on scope + mode
    let pickedId: string | null = null

    // Plan categories/keyPoints act as baseline scope; user's single-select overrides
    const scopeCats = selectedCategory ? [selectedCategory] : planCategories
    const scopeKps = selectedKeyPoint ? [selectedKeyPoint] : planKeyPoints

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
        if (scopeCats.length) filtered = filtered.filter((r: any) => scopeCats.some((c) => r.questions?.category === c || (r.questions?.categories as string[])?.includes(c)))
        if (selectedType) filtered = filtered.filter((r: any) => r.questions?.question_type === selectedType)
        if (scopeKps.length) filtered = filtered.filter((r: any) => scopeKps.some((k) => (r.questions?.key_points || '').includes(k)))
        if (filtered.length > 0) pickedId = filtered[Math.floor(Math.random() * filtered.length)].question_id
      }
    }

    // Scope: wrong — pick from previously wrong-answered questions
    if (!pickedId && currentUser && questionScope === 'wrong') {
      const { data: wrongRows } = await supabase.from('user_answers')
        .select('question_id, questions!inner(subject, category, question_type, key_points)')
        .eq('user_id', currentUser.id)
        .eq('is_correct', false)
        .order('answered_at', { ascending: false })
        .limit(200)
      if (fetchGenRef.current !== myGen) return
      if (wrongRows?.length) {
        let filtered = wrongRows
        if (reviewWrong) {
          // Review mode: only push wrong questions not yet redone (answered again)
          const { data: allAns } = await supabase.from('user_answers')
            .select('question_id').eq('user_id', currentUser.id).limit(5000)
          if (fetchGenRef.current !== myGen) return
          const counts = new Map<string, number>()
          for (const a of allAns ?? []) counts.set(a.question_id, (counts.get(a.question_id) ?? 0) + 1)
          filtered = filtered.filter((r: any) => (counts.get(r.question_id) ?? 0) < 2)
        }
        if (selectedSubjects.length > 0) filtered = filtered.filter((r: any) => selectedSubjects.includes(r.questions?.subject))
        if (scopeCats.length) filtered = filtered.filter((r: any) => scopeCats.some((c) => r.questions?.category === c || (r.questions?.categories as string[])?.includes(c)))
        if (selectedType) filtered = filtered.filter((r: any) => r.questions?.question_type === selectedType)
        if (scopeKps.length) filtered = filtered.filter((r: any) => scopeKps.some((k) => (r.questions?.key_points || '').includes(k)))
        if (filtered.length > 0) pickedId = filtered[Math.floor(Math.random() * filtered.length)].question_id
      }
    }

    // Scope: all — RPC random pick
    if (!pickedId && currentUser && questionScope === 'all') {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('get_random_question_id', {
        p_user_id: currentUser.id,
        p_subjects: selectedSubjects.length > 0 ? selectedSubjects : planSubjectSet.size > 0 ? [...planSubjectSet] : null,
        p_categories: scopeCats.length > 0 ? scopeCats : null,
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

    // RPC doesn't filter by key_points — if no match, query directly
    if (scopeKps.length && qRes.data && !scopeKps.some((k) => (qRes.data.key_points || '').includes(k))) {
      let kpQuery = supabase.from('questions').select('*')
      if (selectedSubjects.length > 0) kpQuery = kpQuery.in('subject', selectedSubjects)
      if (scopeCats.length > 0) kpQuery = kpQuery.in('category', scopeCats)
      if (selectedType) kpQuery = kpQuery.eq('question_type', selectedType)
      kpQuery = kpQuery.or(scopeKps.map(k => `key_points.ilike.*${k}*`).join(','))
      const { data: kpData } = await kpQuery.limit(200)
      if (fetchGenRef.current !== myGen) return
      if (kpData?.length) {
        const kpQ = kpData[Math.floor(Math.random() * kpData.length)] as unknown as Question
        const { data: kpStats } = currentUser
          ? await supabase.from('user_answers')
              .select('is_correct, note, is_public')
              .eq('user_id', currentUser.id)
              .eq('question_id', kpQ.id)
              .order('answered_at', { ascending: false })
          : { data: null }
        if (fetchGenRef.current !== myGen) return
        setQuestion(kpQ)
        const total = kpStats?.length ?? 0
        setAttemptCount(total)
        setWrongCount(kpStats?.filter((a) => !a.is_correct).length ?? 0)
        setLastWrong(kpStats?.[0] ? !(kpStats[0] as any).is_correct : false)
        setNote(kpStats?.find((a) => a.note)?.note ?? '')
        setIsPublic(kpStats?.find((a) => a.note)?.is_public ?? false)
        setIsLoading(false)
        return
      }
      setNoQuestions(true)
      setIsLoading(false)
      return
    }

    if (qRes.error || !qRes.data) {
      if (fetchGenRef.current !== myGen) return
      const localQ = await getPrefetchedQuestion(pickedId!)
      if (localQ) {
        setQuestion(localQ as Question)
        setLastWrong(false)
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
    setLastWrong(statsData?.[0] ? !(statsData[0] as any).is_correct : false)
    const latestNote = statsData?.find((a) => a.note)?.note ?? ''
    const latestIsPublic = statsData?.find((a) => a.note)?.is_public ?? false
    setNote(latestNote)
    setIsPublic(latestIsPublic)

    setIsLoading(false)
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, planSubjectSet, questionScope, reviewWrong, planCategories, planKeyPoints])

  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (hasSession) return
    }
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  // Persist filters
  useEffect(() => {
    savePsFilters({ selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionScope })
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionScope])

  // Persist session
  const sessionRef = useRef({ question, selectedAnswer, isSubmitted, answerId, note, isPublic, attemptCount, wrongCount, lastWrong })
  sessionRef.current = { question, selectedAnswer, isSubmitted, answerId, note, isPublic, attemptCount, wrongCount, lastWrong }
  useEffect(() => {
    const timer = setTimeout(() => savePsSession(sessionRef.current as unknown as Record<string, unknown>), 300)
    return () => clearTimeout(timer)
  }, [question, selectedAnswer, isSubmitted, answerId, note, isPublic, attemptCount, wrongCount, lastWrong])

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
    clearPsSession()
    fetchRandomQuestion()
  }, [fetchRandomQuestion])

  const handlePrev = useCallback(() => {
    if (!kpOrder || seqIdx.current <= 0) return
    seqIdx.current -= 2 // will be incremented in fetchRandomQuestion
    clearPsSession()
    fetchRandomQuestion()
  }, [kpOrder, fetchRandomQuestion])

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: kpOrder ? handlePrev : undefined,
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
                    {t('common.other')}
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
                  {t('common.clearFilter')}
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
                    {t('common.pastExams')}
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
              {selectedKeyPoint || t('practice.keyPoint')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedKeyPoint('')}><span className="text-muted-foreground">{t('practice.noKeyPoint')}</span>{!selectedKeyPoint && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {kpBySubject.map(({ subject, keyPoints }) => (
              <DropdownMenuSub key={subject}><DropdownMenuSubTrigger className="text-xs">{subject}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{keyPoints.map(kp => <DropdownMenuItem key={kp} onClick={() => setSelectedKeyPoint(kp)}>{kp}{selectedKeyPoint === kp && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {{ all: t('practice.allQuestions'), favorites: t('practice.favoritesOnly'), wrong: t('practice.wrongOnly') }[questionScope]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setQuestionScope('all')}>
              {t('practice.allQuestions')}
              {questionScope === 'all' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('favorites')}>
              {t('practice.favoritesOnly')}
              {questionScope === 'favorites' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('wrong')}>
              {t('practice.wrongOnly')}
              {questionScope === 'wrong' && <Check className="h-4 w-4 ml-auto" />}
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
      ) : !question ? null : !isSubmitted ? (
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
              showResult={false}
              onSelect={handleSelect}
              disabled={false}
              showEditLink={isAdmin}
              attemptCount={attemptCount}
              wrongCount={wrongCount}
              lastWrong={lastWrong}
              note={note}
              isFavorited={question ? isFavorite(question.id) : false}
              onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined}
              onVerify={question && !question.verified ? async () => {
                await supabase.from('questions').update({ verified: true }).eq('id', question.id)
                setQuestion({ ...question, verified: true })
              } : undefined}
            />
          </div>
          <div className="flex gap-2 justify-end">
            {kpOrder && seqIdx.current > 0 && (
              <Button variant="outline" onClick={handlePrev}>
                {t('practice.prev')}
              </Button>
            )}
            {attemptCount > 0 && (
              <Button variant="outline" onClick={handleNext}>
                {t('practice.skip')}
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
              {t('practice.submitAnswer')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:flex-[6] space-y-4">
            <QuestionCard
              question={question}
              selectedAnswer={selectedAnswer}
              showResult={true}
              onSelect={handleSelect}
              disabled={true}
              showEditLink={isAdmin}
              attemptCount={attemptCount}
              wrongCount={wrongCount}
              lastWrong={lastWrong}
              note={note}
              isFavorited={question ? isFavorite(question.id) : false}
              onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined}
              onVerify={question && !question.verified ? async () => {
                await supabase.from('questions').update({ verified: true }).eq('id', question.id)
                setQuestion({ ...question, verified: true })
              } : undefined}
            />
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
            <div className="flex gap-2 justify-end">
              {kpOrder && seqIdx.current > 0 && (
                <Button variant="outline" onClick={handlePrev}>
                  {t('practice.prev')}
                </Button>
              )}
              <Button onClick={handleNext}>
                {kpOrder ? t('practice.nextQuestion') : <><Shuffle className="h-4 w-4" />{t('practice.nextQuestion')}</>}
              </Button>
            </div>
          </div>
          {isEnabled('explain') && (
            <div className="lg:flex-[4]">
              <AiExplainPanel
                key={question.id}
                question={question}
                userAnswer={selectedAnswer}
                isCorrect={isAnswerCorrect(selectedAnswer, question.correct_answer, question.question_type, question.allow_unordered)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
