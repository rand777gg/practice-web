import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useSequentialStore } from '@/stores/sequential-store'

import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { KpSelectDialog } from '@/components/practice/KpSelectDialog'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Check, ChevronDown, Plus, Shuffle } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { naturalSort } from '@/lib/utils'
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
let dbSaveTimer: ReturnType<typeof setTimeout> | null = null
function saveFiltersToDb(userId: string, v: PracticeFilters) {
  if (dbSaveTimer) clearTimeout(dbSaveTimer)
  dbSaveTimer = setTimeout(() => {
    supabase.from('user_preferences').upsert({
      user_id: userId, practice_filters: v, updated_at: new Date().toISOString(),
    }).then(() => {})
  }, 500)
}

export function PracticeSession() {
  const saved = useRef(loadFilters())
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  // Restore cached question on mount for instant display
  const [question, setQuestionState] = useState<Question | null>(() => {
    try { const raw = localStorage.getItem('lastPracticeQuestion'); if (raw) return JSON.parse(raw) as Question } catch { return null }
  })
  const setQuestion = useCallback((q: Question | null) => {
    setQuestionState(q)
    if (q) { try { localStorage.setItem('lastPracticeQuestion', JSON.stringify(q)) } catch {} }
  }, [])
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (isLoading && !showSkeleton) {
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 400)
    }
    if (!isLoading) { clearTimeout(skeletonTimerRef.current); setShowSkeleton(false) }
    return () => clearTimeout(skeletonTimerRef.current)
  }, [isLoading])
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
  const seqSessions = useSequentialStore((s) => s.sessions)
  const seqLoadSessions = useSequentialStore((s) => s.loadSessions)
  const seqSwitchSession = useSequentialStore((s) => s.switchSession)
  const seqSessionKey = useSequentialStore((s) => s.sessionKey)
  const seqMergeKps = useSequentialStore((s) => s.mergeKps)
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
  const [questionMode, setQuestionMode] = useState<'new' | 'wrong' | 'sequential'>((saved.current?.questionMode as any) ?? 'sequential')
  const [questionScope, setQuestionScope] = useState<'all' | 'favorites' | 'wrong'>((saved.current?.questionScope as any) ?? 'all')
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false)
  const subjectPosRef = useRef<Record<string, number>>({})
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)

  // Build KP → subject map from selected KPs + kpBySubject
  const kpToSubject = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of kpBySubject) for (const k of s.keyPoints) m.set(k, s.subject)
    return m
  }, [kpBySubject])

  const seqQuestionKps = useSequentialStore((s) => s.questionKps)
  const seqSelectedKps = useSequentialStore((s) => s.selectedKps)

  // Build kp→subject map JUST from selected KPs
  const selectedKpToSubject = useMemo(() => {
    const m = new Map<string, string>()
    for (const kp of seqSelectedKps) {
      const subj = kpToSubject.get(kp)
      if (subj) m.set(kp, subj)
    }
    return m
  }, [seqSelectedKps, kpToSubject])

  const subjectBlocks = useMemo(() => {
    if (!seqActive || seqQuestionKps.length === 0) return [] as { subject: string; start: number; end: number; count: number }[]
    // Determine subject for each question by checking its KP against selected KPs
    const qSubjects = seqQuestionKps.map(kp => {
      if (!kp) return '_unknown_'
      return selectedKpToSubject.get(kp) || kpToSubject.get(kp) || '_unknown_'
    })
    const blocks: { subject: string; start: number; end: number; count: number }[] = []
    let curSubj = qSubjects[0]
    let start = 0
    for (let i = 1; i <= qSubjects.length; i++) {
      const subj = i < qSubjects.length ? qSubjects[i] : null
      if (subj !== curSubj) {
        blocks.push({ subject: curSubj, start, end: i - 1, count: i - start })
        curSubj = subj!
        start = i
      }
    }
    return blocks
  }, [seqActive, seqQuestionKps, selectedKpToSubject, kpToSubject])

  // Auto-select active subject based on current question's KP
  const currentSubject = useMemo(() => {
    if (!seqActive || seqIndex >= seqQuestionKps.length) return null
    const kp = seqQuestionKps[seqIndex]
    if (!kp) return null
    return selectedKpToSubject.get(kp) || kpToSubject.get(kp) || null
  }, [seqActive, seqIndex, seqQuestionKps, selectedKpToSubject, kpToSubject])

  const kpBySubjectRef = useRef(kpBySubject)
  kpBySubjectRef.current = kpBySubject
  const kpToSubjectRef = useRef(kpToSubject)
  kpToSubjectRef.current = kpToSubject

  // Persist filters to localStorage + DB
  useEffect(() => {
    const filters = { selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope }
    saveFilters(filters)
    const user = useAuthStore.getState().user
    if (user) saveFiltersToDb(user.id, filters)
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope])

  // Load filters from DB on mount, fallback to localStorage
  const dbFiltersRef = useRef(false)
  useEffect(() => {
    if (dbFiltersRef.current) return
    dbFiltersRef.current = true
    const user = useAuthStore.getState().user
    if (!user) return
    supabase.from('user_preferences').select('practice_filters').eq('user_id', user.id).single().then(({ data }) => {
      if (data?.practice_filters) {
        const f = data.practice_filters as PracticeFilters
        if (f.selectedSubjects?.length) setSelectedSubjects(f.selectedSubjects)
        if (f.selectedCategory) setSelectedCategory(f.selectedCategory)
        if (f.selectedType) setSelectedType(f.selectedType as QuestionType)
        if (f.selectedKeyPoint) setSelectedKeyPoint(f.selectedKeyPoint)
        if (f.questionMode) setQuestionMode(f.questionMode as any)
        if (f.questionScope) setQuestionScope(f.questionScope as any)
      }
    })
  }, [])

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
      setKpBySubject([...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([s, ks]) => ({ subject: s, keyPoints: [...ks].sort(naturalSort) })))
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
  const preloadRef = useRef<{ index: number; question: Question; attempts: number; wrongs: number; note: string; isPublic: boolean } | null>(null)

  const preloadNext = useCallback(async (nextIdx: number, ids: string[], myGen: number) => {
    if (nextIdx >= ids.length) return
    const currentUser = useAuthStore.getState().user
    const [qRes, statsRes] = await Promise.all([
      supabase.from('questions').select('*').eq('id', ids[nextIdx]).single(),
      currentUser ? supabase.from('user_answers').select('is_correct, note, is_public').eq('user_id', currentUser.id).eq('question_id', ids[nextIdx]).order('answered_at', { ascending: false }) : Promise.resolve(null),
    ])
    if (seqFetchGenRef.current !== myGen) return
    if (qRes.error || !qRes.data) return
    const sd = statsRes?.data
    preloadRef.current = {
      index: nextIdx,
      question: qRes.data as unknown as Question,
      attempts: sd?.length ?? 0,
      wrongs: sd?.filter((a: any) => !a.is_correct).length ?? 0,
      note: sd?.find((a: any) => a.note)?.note ?? '',
      isPublic: sd?.find((a: any) => a.note)?.is_public ?? false,
    }
  }, [])

  const loadSequentialQuestion = useCallback(async (index: number) => {
    const s = useSequentialStore.getState()
    // Save position for current subject before navigating away
    const curKp = s.questionKps[s.currentIndex]
    if (curKp && index !== s.currentIndex) {
      const curSubj = kpBySubjectRef.current.find(x => x.keyPoints.includes(curKp))?.subject || kpToSubjectRef.current.get(curKp)
      if (curSubj) subjectPosRef.current[curSubj] = s.currentIndex
    }
    useSequentialStore.setState({ currentIndex: index })
    seqFetchGenRef.current++; const myGen = seqFetchGenRef.current
    const ids = useSequentialStore.getState().questionIds
    if (index >= ids.length) { setNoQuestions(true); setIsLoading(false); return }

    // Use preloaded data if available — no loading flash
    const preloaded = preloadRef.current
    if (preloaded && preloaded.index === index) {
      preloadRef.current = null
      setQuestion(preloaded.question)
      setAttemptCount(preloaded.attempts)
      setWrongCount(preloaded.wrongs)
      setNote(preloaded.note)
      setIsPublic(preloaded.isPublic)
      setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null)
      preloadNext(index + 1, ids, myGen)
      return
    }

    setIsLoading(true); setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null)
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

    // Preload next question in background
    preloadNext(index + 1, ids, myGen)
  }, [preloadNext])

  const switchToSubject = useCallback((block: { subject: string; start: number; end: number; count: number }) => {
    if (currentSubject) subjectPosRef.current[currentSubject] = seqIndex
    const saved = subjectPosRef.current[block.subject]
    const target = saved != null && saved >= block.start && saved <= block.end ? saved : block.start
    loadSequentialQuestion(target)
  }, [currentSubject, seqIndex, loadSequentialQuestion])

  const saveCurrentSession = useCallback(() => {
    const s = useSequentialStore.getState()
    if (!s.isActive || !s.sessionKey) return
    const u = useAuthStore.getState().user
    if (!u) return
    supabase.from('practice_sequential_state').upsert({
      user_id: u.id, session_key: s.sessionKey, selected_kps: s.selectedKps,
      question_ids: s.questionIds, current_index: s.currentIndex, updated_at: new Date().toISOString(),
    }).then(() => {})
  }, [])

  const handleKpConfirm = useCallback(async (kps: string[]) => {
    const user = useAuthStore.getState().user; if (!user || kps.length === 0) return
    const s = useSequentialStore.getState()
    const subs = selectedSubjects.length > 0 ? selectedSubjects : [...planSubjectSet]
    if (s.isActive && s.sessionKey) {
      // Active session — merge new KPs to preserve current position
      await seqMergeKps(user.id, kps, subs, selectedType)
      seqLoadSessions(user.id)
      loadSequentialQuestion(useSequentialStore.getState().currentIndex)
    } else {
      saveCurrentSession()
      await seqStart(user.id, kps, subs, selectedType)
      seqLoadSessions(user.id)
      loadSequentialQuestion(0)
    }
  }, [selectedSubjects, selectedType, planSubjectSet, seqStart, seqMergeKps, loadSequentialQuestion, saveCurrentSession, seqLoadSessions])

  const modeInitRef = useRef(false)
  useEffect(() => {
    if (questionMode === 'sequential') {
      const user = useAuthStore.getState().user
      if (!user) { setSequentialDialogOpen(true); return }
      seqLoadSessions(user.id).then(() => {
        const sessions = useSequentialStore.getState().sessions
        if (sessions.length > 0) {
          const latest = sessions[0]
          seqLoadFromDb(user.id, latest.sessionKey).then(r => {
            const s = useSequentialStore.getState()
            if (r && s.questionIds.length > 0) loadSequentialQuestion(s.currentIndex)
            else setSequentialDialogOpen(true)
          })
        } else {
          setSequentialDialogOpen(true)
        }
      })
    } else {
      seqReset(); fetchRandomQuestion()
    }
    modeInitRef.current = true
  }, [questionMode])

  const subFetchRef = useRef(false)
  useEffect(() => {
    if (!subFetchRef.current) { subFetchRef.current = true; return }
    if (questionMode !== 'sequential') fetchRandomQuestion()
  }, [fetchRandomQuestion, questionMode])

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
    useDashboardStore.getState().invalidatePlanCache()

    if (questionMode === 'sequential') { const s = useSequentialStore.getState(); supabase.from('practice_sequential_state').upsert({ user_id: useAuthStore.getState().user!.id, session_key: s.sessionKey, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, updated_at: new Date().toISOString() }).then(() => {}) }
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
    if (questionMode === 'sequential') { seqNext(); const s = useSequentialStore.getState(); const u = useAuthStore.getState().user; if (u) supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s.sessionKey, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, updated_at: new Date().toISOString() }).then(() => {}); loadSequentialQuestion(s.currentIndex) }
    else fetchRandomQuestion()
  }, [questionMode, seqNext, fetchRandomQuestion, loadSequentialQuestion])

  const handleMarkTooEasy = useCallback(async () => {
    if (!question) return
    const u = useAuthStore.getState().user; if (!u) return
    await supabase.from('user_excluded_questions').upsert({ user_id: u.id, question_id: question.id }, { onConflict: 'user_id, question_id' })
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
    window.dispatchEvent(new Event('plan-progress-refresh'))
    if (questionMode === 'sequential') {
      // Remove excluded question from current session
      const s = useSequentialStore.getState()
      const idx = s.questionIds.indexOf(question.id)
      if (idx >= 0) {
        const newIds = s.questionIds.filter((_, i) => i !== idx)
        const newKps = s.questionKps.filter((_, i) => i !== idx)
        const newIndex = idx <= s.currentIndex && s.currentIndex > 0 ? s.currentIndex - 1 : s.currentIndex
        useSequentialStore.setState({ questionIds: newIds, questionKps: newKps, currentIndex: newIndex })
        supabase.from('practice_sequential_state').upsert({
          user_id: u.id, session_key: s.sessionKey, selected_kps: s.selectedKps,
          question_ids: newIds, current_index: newIndex, updated_at: new Date().toISOString(),
        }).then(() => {})
      }
      loadSequentialQuestion(useSequentialStore.getState().currentIndex)
    } else fetchRandomQuestion()
  }, [question, questionMode, loadSequentialQuestion, fetchRandomQuestion, bumpRefresh])

  const handleMarkUnsure = useCallback(async () => {
    if (!question) return
    const id = await saveAnswer(question.id, [], false, 'practice')
    setAnswerId(id)
    setIsSubmitted(true)
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
    window.dispatchEvent(new Event('plan-progress-refresh'))
  }, [question, saveAnswer, bumpRefresh])

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
            <DropdownMenuItem onClick={() => setQuestionMode('sequential')}>
              顺序刷题
              {questionMode === 'sequential' && <Check className="h-4 w-4 ml-auto" />}
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
        {questionMode === 'sequential' && (<> <span className="w-px h-4 bg-border mx-1 hidden sm:block" /> <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{seqKps.length > 0 ? `${seqKps.length}个知识点` : '选择知识点'}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><div className="text-xs text-muted-foreground px-2 py-1.5">已保存的会话</div>{seqSessions.length === 0 && <div className="text-xs text-muted-foreground px-2 py-1">暂无</div>}{seqSessions.map(s => { const kpCount = s.selectedKps.length; const progress = s.questionIds.length > 0 ? Math.round((s.currentIndex / s.questionIds.length) * 100) : 0; const isActive = s.sessionKey === seqSessionKey; const subjCounts: Record<string, number> = {}; for (const kp of s.selectedKps) { const subj = kpToSubjectRef.current.get(kp); if (subj) subjCounts[subj] = (subjCounts[subj] || 0) + 1 } const subjText = Object.entries(subjCounts).map(([subj, n]) => `${subj} ${n}个`).join(' · ') || `${kpCount}个知识点`; return (<DropdownMenuItem key={s.sessionKey} onSelect={async (e) => { e.preventDefault(); const u = useAuthStore.getState().user; if (u) { if (isActive) { setSequentialDialogOpen(true); return } saveCurrentSession(); await seqSwitchSession(u.id, s.sessionKey); loadSequentialQuestion(useSequentialStore.getState().currentIndex); } }} className={isActive ? 'bg-accent' : ''}><div className="flex items-center justify-between w-full"><div className="flex flex-col gap-0.5"><span className="text-xs font-medium">{subjText}</span><span className="text-[10px] text-muted-foreground">{progress}% ({s.currentIndex}/{s.questionIds.length})</span></div><Button variant="outline" size="sm" className="h-6 text-[10px] text-destructive hover:bg-destructive/10 shrink-0 ml-2" onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); setDeleteSessionKey(s.sessionKey) }}>删除</Button></div></DropdownMenuItem>)})}<DropdownMenuSeparator /><DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSequentialDialogOpen(true) }} className="text-xs"><Plus className="h-3 w-3 mr-1" />新建会话</DropdownMenuItem></DropdownMenuContent></DropdownMenu> </>)}
      </div>

      <KpSelectDialog open={sequentialDialogOpen} onOpenChange={setSequentialDialogOpen} kpBySubject={kpBySubject} planSubjects={[...planSubjectSet]} selectedKps={seqKps} onConfirm={handleKpConfirm} />

      <AlertDialog open={deleteSessionKey !== null} onOpenChange={(open) => { if (!open) setDeleteSessionKey(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后将无法恢复，该会话的刷题进度将丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const key = deleteSessionKey; if (!key) return
                const u = useAuthStore.getState().user; if (!u) return
                const isActive = key === useSequentialStore.getState().sessionKey
                await supabase.from('practice_sequential_state').delete().eq('user_id', u.id).eq('session_key', key)
                if (isActive) { seqReset(); fetchRandomQuestion() }
                seqLoadSessions(u.id)
                setDeleteSessionKey(null)
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showSkeleton ? (
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
            <Button variant="outline" onClick={() => { setQuestionMode('new'); seqReset(); fetchRandomQuestion() }}>{t('practice.backToNormalMode')}</Button>
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
      ) : !question ? null : (
        <div className="space-y-4">
          {questionMode === 'sequential' && (
            <div className="rounded-xl border bg-card p-3 space-y-2 relative">
            {!seqActive || seqQuestionIds.length === 0 ? (
              <div className="space-y-2">
                <div className="flex gap-1.5"><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-16 rounded-md" /></div>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {subjectBlocks.map(b => {
                    const isActive = b.subject === currentSubject
                    return (
                      <button
                        key={b.subject}
                        type="button"
                        onClick={() => switchToSubject(b)}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        }`}
                      >
                        {b.subject} ({b.count})
                      </button>
                    )
                  })}
                </div>
              )}
              {(() => {
                const block = currentSubject ? subjectBlocks.find(b => b.subject === currentSubject) : null
                const ci = seqIndex
                const total = block ? block.count : seqQuestionIds.length
                const offset = block ? block.start : 0
                const relIndex = block ? ci - offset : ci
                const ki = seqGetCurrentKpInfo()
                const qKp = question?.key_points?.split(/[,，;；]/)[0]?.trim()
                const ua = navigator.userAgent
                const devIcon = /Windows/i.test(ua) ? 'mingcute:windows-line' : /Mac/i.test(ua) ? 'mingcute:macos-line' : /Android/i.test(ua) ? 'mingcute:android-line' : /Linux/i.test(ua) ? 'mingcute:linux-line' : /iPhone|iPad/i.test(ua) ? 'mingcute:ios-line' : 'mingcute:computer-line'
                let devName = ''
                try { const uad = (navigator as any).userAgentData; if (uad?.platform) devName = uad.platform + (uad.platformVersion ? ' ' + uad.platformVersion : '') } catch {}
                const lastSync = [...seqSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt
                const syncStr = lastSync ? (() => { const d = new Date(lastSync); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` })() : null
                return <SequentialProgressBar currentIndex={relIndex} total={total} kpCurrent={ki.kpCurrent || 0} kpTotal={ki.kpTotal || 0} kpName={ki.kpName || qKp || null} deviceIcon={devIcon} deviceName={devName} syncText={syncStr} />
              })()}
            </div>
            )}
            </div>
          )}
          <div className="touch-pan-y select-none" style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <QuestionCard question={question} selectedAnswer={selectedAnswer} showResult={isSubmitted} onSelect={handleSelect} disabled={isSubmitted} showEditLink={isAdmin} attemptCount={attemptCount} wrongCount={wrongCount} note={note} isFavorited={question ? isFavorite(question.id) : false} onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined} onMarkTooEasy={question && !isSubmitted ? handleMarkTooEasy : undefined} onMarkUnsure={question && !isSubmitted ? handleMarkUnsure : undefined} onVerify={question && !question.verified ? async () => { await supabase.from('questions').update({ verified: true }).eq('id', question.id); setQuestion({ ...question, verified: true }) } : undefined} />
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
      )}
    </div>
  )
}
