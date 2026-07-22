import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useSequentialStore, markPracticeSync } from '@/stores/sequential-store'

import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { KpSelectDialog } from '@/components/practice/KpSelectDialog'
import { PlanDialog } from '@/components/layout/PlanDialog'

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
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Filter, GraduationCap, Plus, Shuffle, Trash2 } from 'lucide-react'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { Kbd } from '@/components/ui/kbd'
import { Checkbox } from '@/components/ui/checkbox'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { cn, naturalSort } from '@/lib/utils'
import { getPrefetchedQuestionIds, getPrefetchedQuestion } from '@/lib/offline-db'
import type { Question, CorrectAnswer, QuestionType } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

const PS_FILTERS = 'practice_filters'

// Module-level KP cache (P3: avoid repeated question_meta_cache queries across mounts)
let kpCache: { subject: string; keyPoints: string[] }[] | null = null

function sameSubjects(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((subject) => rightSet.has(subject))
}

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

function FilterBtn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between text-xs h-8 font-normal truncate">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-0.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PracticeSession() {
  const saved = useRef(loadFilters())
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  // Restore cached question on mount for instant display
  const [question, setQuestionState] = useState<Question | null>(() => {
    try { const raw = localStorage.getItem('lastPracticeQuestion'); if (raw) return JSON.parse(raw) as Question; return null } catch { return null }
  })
  const setQuestion = useCallback((q: Question | null) => {
    setQuestionState(q)
    if (q) { try { localStorage.setItem('lastPracticeQuestion', JSON.stringify(q)) } catch {} }
  }, [])
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [questionReady, setQuestionReady] = useState(true)
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const skeletonVisibleRef = useRef(false)
  useEffect(() => { skeletonVisibleRef.current = showSkeleton }, [showSkeleton])
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isLoading && !showSkeleton && (isInitialMount.current || !question)) {
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 150)
    }
    if (!isLoading) {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current)
      setShowSkeleton(false)
      isInitialMount.current = false
    }
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current) }
  }, [isLoading, question])
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
  const seqStart = useSequentialStore((s) => s.startSequential)
  const seqReset = useSequentialStore((s) => s.reset)
  const seqLoadFromDb = useSequentialStore((s) => s.loadFromDb)
  const seqSessions = useSequentialStore((s) => s.sessions)
  const seqLoadSessions = useSequentialStore((s) => s.loadSessions)
  const seqSwitchSession = useSequentialStore((s) => s.switchSession)
  const seqSessionKey = useSequentialStore((s) => s.sessionKey)
  const seqGetCurrentKpInfo = useSequentialStore((s) => s.getCurrentKpInfo)
  const seqSyncStatus = useSequentialStore((s) => s.syncStatus)
  const seqLastSyncAt = useSequentialStore((s) => s.lastSyncAt)
  const seqStartSync = useSequentialStore((s) => s.startSync)
  const seqStopSync = useSequentialStore((s) => s.stopSync)

  // Realtime cross-device sync: start on mount, stop on unmount
  useEffect(() => {
    const user = useAuthStore.getState().user
    if (user) seqStartSync(user.id)
    return () => { seqStopSync() }
  }, [seqStartSync, seqStopSync])

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
  const planSessionScope = useMemo(() => JSON.stringify([...planSubjectSet].sort()), [planSubjectSet])
  const planSubjectSetRef = useRef(planSubjectSet)
  planSubjectSetRef.current = planSubjectSet
  const otherSubjects = useMemo(() => subjects.filter((s) => !planSubjectSet.has(s)), [subjects, planSubjectSet])

  const initRef = useRef(false)
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(saved.current?.selectedSubjects ?? [])
  const [selectedCategory, setSelectedCategory] = useState(saved.current?.selectedCategory ?? '')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>((saved.current?.selectedType as QuestionType) ?? '')
  const [selectedKeyPoint, setSelectedKeyPoint] = useState(saved.current?.selectedKeyPoint ?? '')
  const [kpBySubject, setKpBySubject] = useState<{ subject: string; keyPoints: string[] }[]>([])
  const [questionMode, setQuestionMode] = useState<'new' | 'wrong' | 'sequential'>(() => {
    const urlMode = searchParams.get('mode')
    if (urlMode === 'seq') return 'sequential'
    if (urlMode === 'random') return 'new'
    return (saved.current?.questionMode as any) ?? 'sequential'
  })
  const [questionScope, setQuestionScope] = useState<'all' | 'favorites' | 'wrong'>((saved.current?.questionScope as any) ?? 'all')
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const subjectPosRef = useRef<Record<string, number>>({})
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const answeredThisSession = useRef<Set<string>>(new Set())
  const sessionStateRef = useRef<Map<string, { answer: CorrectAnswer | null; answerId: string | null; note: string; isPublic: boolean; attempts: number; wrongs: number }>>(new Map())
  const historyRef = useRef<{ question: Question; answer: CorrectAnswer | null; submitted: boolean; note: string; isPublic: boolean; answerId: string | null; attempts: number; wrongs: number }[]>([])
  const snapRef = useRef<{ question: Question | null; answer: CorrectAnswer | null; submitted: boolean; note: string; isPublic: boolean; answerId: string | null; attempts: number; wrongs: number }>({ question: null, answer: null, submitted: false, note: '', isPublic: false, answerId: null, attempts: 0, wrongs: 0 })
  useEffect(() => { snapRef.current = { question, answer: selectedAnswer, submitted: isSubmitted, note, isPublic, answerId, attempts: attemptCount, wrongs: wrongCount } })
  const [blockSkipOpen, setBlockSkipOpen] = useState(false)
  const isMobile = useIsMobile()

  // Persist per-subject positions to localStorage keyed by sessionKey
  useEffect(() => {
    const key = seqSessionKey
    if (!key) return
    // Prefer store (from DB), fall back to localStorage
    const storePos = useSequentialStore.getState().subjectPositions
    if (storePos && Object.keys(storePos).length > 0) {
      subjectPosRef.current = { ...storePos }
    } else {
      try {
        const saved = localStorage.getItem(`sp_${key}`)
        if (saved) subjectPosRef.current = JSON.parse(saved)
      } catch {}
    }
  }, [seqSessionKey])

  const saveSubjectPos = useCallback(() => {
    const key = useSequentialStore.getState().sessionKey
    if (!key) return
    try { localStorage.setItem(`sp_${key}`, JSON.stringify(subjectPosRef.current)) } catch {}
    useSequentialStore.setState({ subjectPositions: { ...subjectPosRef.current } })
  }, [])

  // Build KP → subject map from selected KPs + kpBySubject
  const kpToSubject = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of kpBySubject) for (const k of s.keyPoints) m.set(k, s.subject)
    return m
  }, [kpBySubject])

  // Sequential mode must scope questions to the subjects the chosen KPs actually
  // belong to — the unrelated "学科" filter dropdown can point at a different
  // subject and would otherwise filter out every matched question.
  const subjectsForKps = useCallback((kps: string[]) => {
    const subs = [...new Set(kps.map((k) => kpToSubjectRef.current.get(k)).filter((s): s is string => Boolean(s)))]
    return subs.length > 0 ? subs : [...planSubjectSet]
  }, [planSubjectSet])

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

  const seqQuestionSubjects = useSequentialStore((s) => s.questionSubjects)

  const subjectBlocks = useMemo(() => {
    if (!seqActive || seqQuestionKps.length === 0) return [] as { subject: string; start: number; end: number; count: number }[]
    // Use stored questionSubjects (from DB query) as primary source, fallback to KP→subject map
    const qSubjects = seqQuestionKps.map((kp, i) => {
      const fromStore = seqQuestionSubjects[i]
      if (fromStore) return fromStore
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
  }, [seqActive, seqQuestionKps, seqQuestionSubjects, selectedKpToSubject, kpToSubject])
  const subjectBlocksRef = useRef(subjectBlocks)
  subjectBlocksRef.current = subjectBlocks

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

  // Sync questionMode to URL param
  useEffect(() => {
    const mode = questionMode === 'sequential' ? 'seq' : 'random'
    if (searchParams.get('mode') !== mode) {
      setSearchParams(prev => { prev.set('mode', mode); return prev }, { replace: true })
    }
  }, [questionMode])

  // Load filters from DB on mount, fallback to localStorage
  const dbFiltersRef = useRef(false)
  const urlModeRef = useRef(searchParams.get('mode'))
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
        if (f.questionMode && !urlModeRef.current) setQuestionMode(f.questionMode as any)
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

  // Load distinct key_points from cached meta (single row, no full table scan)
  // P3: module-level cache avoids repeated queries across page navigations
  const [kpVersion, setKpVersion] = useState(0)
  const triggerKpRefresh = useCallback(() => { kpCache = null; setKpVersion(v => v + 1) }, [])
  useEffect(() => {
    let c = false
    if (kpCache) {
      setKpBySubject(kpCache)
      return
    }
    supabase.from('question_meta_cache').select('key_points_by_subject').single().then(({ data }) => {
      if (c) return
      const items = (data?.key_points_by_subject ?? []) as { subject: string; key_points: string[] }[]
      const result = items
        .map(item => ({ subject: item.subject || '其他', keyPoints: [...item.key_points].sort(naturalSort) }))
        .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN'))
      kpCache = result
      setKpBySubject(result)
    })
    return () => { c = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpVersion])
  // Refresh KPs when plan subjects change
  useEffect(() => { triggerKpRefresh() }, [profile?.daily_targets, profile?.plan_subjects, triggerKpRefresh])

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
    const snap = snapRef.current
    if (snap.question && questionMode !== 'sequential') {
      historyRef.current.push({ question: snap.question, answer: snap.answer, submitted: snap.submitted, note: snap.note, isPublic: snap.isPublic, answerId: snap.answerId, attempts: snap.attempts, wrongs: snap.wrongs })
    }
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    setIsLoading(true)
    setQuestionReady(false)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)
    setNoQuestions(false)

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
    const effectiveSubjects = selectedSubjects.length > 0 ? selectedSubjects : [...planSubjectSet]
    if (!pickedId && currentUser && questionScope === 'all' && questionMode !== 'wrong' && effectiveSubjects.length > 0) {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('get_random_question_id', {
        p_user_id: currentUser.id,
        p_subjects: effectiveSubjects,
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

    if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
    if (fetchGenRef.current !== myGen) return

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
    if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
    if (fetchGenRef.current !== myGen) return
    setQuestionReady(true)
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
    // Save current question state to session cache before navigating away
    if (s.currentIndex !== index) {
      const snap = snapRef.current
      if (snap.question && snap.submitted) {
        sessionStateRef.current.set(snap.question.id, { answer: snap.answer, answerId: snap.answerId, note: snap.note, isPublic: snap.isPublic, attempts: snap.attempts, wrongs: snap.wrongs })
      }
    }
    // Save position for current subject before navigating away
    const curKp = s.questionKps[s.currentIndex]
    if (curKp && index !== s.currentIndex) {
      const curSubj = kpBySubjectRef.current.find(x => x.keyPoints.includes(curKp))?.subject || kpToSubjectRef.current.get(curKp)
      if (curSubj) { subjectPosRef.current[curSubj] = s.currentIndex; saveSubjectPos() }
    }
    useSequentialStore.setState({ currentIndex: index })
    seqFetchGenRef.current++; const myGen = seqFetchGenRef.current
    const ids = useSequentialStore.getState().questionIds
    if (index >= ids.length) { setNoQuestions(true); setIsLoading(false); return }

    // P1: Check for preloaded question from load_practice_session RPC (skip 1 round-trip)
    const rpcPreloaded = useSequentialStore.getState().consumePreloaded()
    if (rpcPreloaded?.question && index === useSequentialStore.getState().currentIndex) {
      setIsLoading(true); setQuestionReady(false); setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null); setNoQuestions(false)
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestion(rpcPreloaded.question as unknown as Question)
      setAttemptCount(rpcPreloaded.stats?.total ?? 0)
      setWrongCount(rpcPreloaded.stats?.wrong ?? 0)
      setNote(rpcPreloaded.stats?.note ?? '')
      setIsPublic(rpcPreloaded.stats?.isPublic ?? false)
      setIsLoading(false)
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestionReady(true)
      preloadNext(index + 1, ids, myGen)
      return
    }

    // Use preloaded data if available
    const preloaded = preloadRef.current
    if (preloaded && preloaded.index === index) {
      preloadRef.current = null
      setIsLoading(true); setQuestionReady(false); setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null); setNoQuestions(false)
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestion(preloaded.question)
      setAttemptCount(preloaded.attempts)
      setWrongCount(preloaded.wrongs)
      setNote(preloaded.note)
      setIsPublic(preloaded.isPublic)
      setIsLoading(false)
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestionReady(true)
      preloadNext(index + 1, ids, myGen)
      return
    }

    setIsLoading(true); setQuestionReady(false); setSelectedAnswer(null); setIsSubmitted(false); setAnswerId(null); setNoQuestions(false)

    const cached = sessionStateRef.current.get(ids[index])
    if (cached) {
      const currentUser = useAuthStore.getState().user
      const [qRes] = await Promise.all([
        supabase.from('questions').select('*').eq('id', ids[index]).single(),
      ])
      if (seqFetchGenRef.current !== myGen) return
      if (qRes.error || !qRes.data) { setNoQuestions(true); setIsLoading(false); return }
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestion(qRes.data as unknown as Question)
      setSelectedAnswer(cached.answer)
      setIsSubmitted(true)
      setAnswerId(cached.answerId)
      setNote(cached.note)
      setIsPublic(cached.isPublic)
      setAttemptCount(cached.attempts)
      setWrongCount(cached.wrongs)
      setIsLoading(false)
      if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
      if (seqFetchGenRef.current !== myGen) return
      setQuestionReady(true)
      preloadNext(index + 1, ids, myGen)
      return
    }

    const currentUser = useAuthStore.getState().user
    const [qRes, statsRes] = await Promise.all([
      supabase.from('questions').select('*').eq('id', ids[index]).single(),
      currentUser ? supabase.from('user_answers').select('is_correct, note, is_public').eq('user_id', currentUser.id).eq('question_id', ids[index]).order('answered_at', { ascending: false }) : Promise.resolve(null),
    ])
    if (seqFetchGenRef.current !== myGen) return
    if (qRes.error || !qRes.data) { setNoQuestions(true); setIsLoading(false); return }
    if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
    if (seqFetchGenRef.current !== myGen) return
    setQuestion(qRes.data as unknown as Question)
    const sd = statsRes?.data; setAttemptCount(sd?.length ?? 0); setWrongCount(sd?.filter((a: any) => !a.is_correct).length ?? 0)
    setNote(sd?.find((a: any) => a.note)?.note ?? ''); setIsPublic(sd?.find((a: any) => a.note)?.is_public ?? false)
    setIsLoading(false)
    if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
    if (seqFetchGenRef.current !== myGen) return
    setQuestionReady(true)

    // Preload next question in background
    preloadNext(index + 1, ids, myGen)
  }, [preloadNext])

  const switchToSubject = useCallback((block: { subject: string; start: number; end: number; count: number }) => {
    if (currentSubject) { subjectPosRef.current[currentSubject] = seqIndex; saveSubjectPos() }
    const saved = subjectPosRef.current[block.subject]
    const target = saved != null && saved >= block.start && saved <= block.end ? saved : block.start
    loadSequentialQuestion(target)
  }, [currentSubject, seqIndex, loadSequentialQuestion])

  const saveCurrentSession = useCallback(() => {
    const s = useSequentialStore.getState()
    if (!s.isActive || !s.sessionKey) return
    const u = useAuthStore.getState().user
    if (!u) return
    markPracticeSync()
    supabase.from('practice_sequential_state').upsert({
      user_id: u.id, session_key: s.sessionKey, selected_kps: s.selectedKps,
      plan_subjects: s.planSubjects, question_ids: s.questionIds, current_index: s.currentIndex, subject_positions: s.subjectPositions, updated_at: new Date().toISOString(),
    }).then(() => {})
  }, [])

  const handleKpConfirm = useCallback(async (kps: string[]) => {
    const user = useAuthStore.getState().user; if (!user || kps.length === 0) return
    triggerKpRefresh()
    const s = useSequentialStore.getState()
    const subs = subjectsForKps(kps)
    saveCurrentSession()
    if (s.isActive && s.sessionKey) {
      // Save current subject position before merging
      if (currentSubject) { subjectPosRef.current[currentSubject] = s.currentIndex; saveSubjectPos() }
      // Active session — merge new KPs to preserve current position
      await seqStart(user.id, kps, subs, '')
      seqLoadSessions(user.id)
      loadSequentialQuestion(useSequentialStore.getState().currentIndex)
    } else {
      saveCurrentSession()
      await seqStart(user.id, kps, subs, '')
      seqLoadSessions(user.id)
      loadSequentialQuestion(useSequentialStore.getState().currentIndex)
    }
  }, [subjectsForKps, seqStart, loadSequentialQuestion, saveCurrentSession, seqLoadSessions, currentSubject, saveSubjectPos, triggerKpRefresh])

  const modeInitRef = useRef(false)
  useEffect(() => {
    if (questionMode === 'sequential') {
      const user = useAuthStore.getState().user
      if (!user) { setIsLoading(false); setSequentialDialogOpen(true); return }
      const currentPlanSubjects = [...planSubjectSetRef.current]
      if (currentPlanSubjects.length === 0) { seqReset(); setIsLoading(false); return }
      const s = useSequentialStore.getState()
      if (s.isActive && s.questionIds.length > 0 && sameSubjects(s.planSubjects, currentPlanSubjects)) {
        loadSequentialQuestion(s.currentIndex); return
      }
      if (s.isActive) seqReset()
      seqLoadSessions(user.id).then(() => {
        const sessions = useSequentialStore.getState().sessions
        const validSession = sessions.find((session) =>
          (session.questionIds?.length ?? 0) > 0 && sameSubjects(session.planSubjects, currentPlanSubjects),
        )
        if (validSession) {
          seqLoadFromDb(user.id, validSession.sessionKey).then(r => {
            const s2 = useSequentialStore.getState()
            if (r && s2.questionIds.length > 0) loadSequentialQuestion(s2.currentIndex)
            else { setIsLoading(false); setSequentialDialogOpen(true) }
          })
        } else {
          setIsLoading(false)
          setSequentialDialogOpen(true)
        }
      })
    } else {
      seqReset(); fetchRandomQuestion()
    }
    modeInitRef.current = true
  }, [questionMode, planSessionScope])

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

    if (questionMode === 'sequential') { markPracticeSync(); const s = useSequentialStore.getState(); supabase.from('practice_sequential_state').upsert({ user_id: useAuthStore.getState().user!.id, session_key: s.sessionKey, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, subject_positions: s.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
    answeredThisSession.current.add(question.id)
    sessionStateRef.current.set(question.id, { answer: selectedAnswer, answerId: id, note, isPublic, attempts: attemptCount, wrongs: wrongCount })
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

  const handlePrev = useCallback(async () => {
    if (questionMode === 'sequential') {
      const s = useSequentialStore.getState()
      if (s.currentIndex <= 0) return
      await loadSequentialQuestion(s.currentIndex - 1)
      const s2 = useSequentialStore.getState()
      const u = useAuthStore.getState().user
      if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
    } else {
      const hist = historyRef.current
      if (hist.length === 0) return
      const prev = hist.pop()!
      setQuestion(prev.question)
      setSelectedAnswer(prev.answer)
      setIsSubmitted(prev.submitted)
      setNote(prev.note)
      setIsPublic(prev.isPublic)
      setAnswerId(prev.answerId)
      setAttemptCount(prev.attempts)
      setWrongCount(prev.wrongs)
      setNoQuestions(false)
      setIsLoading(false)
      setQuestionReady(true)
    }
  }, [questionMode, loadSequentialQuestion, setQuestion])

  const hasPrev = useMemo(() => {
    if (questionMode === 'sequential') return seqIndex > 0
    return historyRef.current.length > 0
  }, [questionMode, seqIndex, question])

  const handleNext = useCallback(async () => {
    if (questionMode === 'sequential') {
      // Block skip if current question not answered in this session
      if (!isSubmitted && question && !answeredThisSession.current.has(question.id)) {
        setBlockSkipOpen(true)
        return
      }
      const s = useSequentialStore.getState()
      const nextIdx = s.currentIndex + 1
      if (nextIdx >= s.questionIds.length) { setNoQuestions(true); setIsLoading(false); return }
      await loadSequentialQuestion(nextIdx)
      // Save to DB after successful load
      const s2 = useSequentialStore.getState()
      const u = useAuthStore.getState().user
      if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
    }
    else fetchRandomQuestion()
  }, [questionMode, isSubmitted, question, fetchRandomQuestion, loadSequentialQuestion])

  const prevRef = useRef(handlePrev)
  const nextRef = useRef(handleNext)
  const submitRef = useRef(handleSubmit)
  useEffect(() => { prevRef.current = handlePrev; nextRef.current = handleNext; submitRef.current = handleSubmit })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (isLoading || showSkeleton) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevRef.current() }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextRef.current() }
      if (e.key === 'Enter' && !isSubmitted && selectedAnswer !== null) { e.preventDefault(); submitRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSubmitted, selectedAnswer, isLoading, showSkeleton])

  const handleMarkTooEasy = useCallback(async () => {
    if (!question) return
    const u = useAuthStore.getState().user; if (!u) return
    await supabase.from('user_excluded_questions').upsert({ user_id: u.id, question_id: question.id }, { onConflict: 'user_id, question_id' })
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
    if (questionMode === 'sequential') {
      // Remove excluded question from current session
      const s = useSequentialStore.getState()
      const idx = s.questionIds.indexOf(question.id)
      if (idx >= 0) {
        const newIds = s.questionIds.filter((_, i) => i !== idx)
        const newKps = s.questionKps.filter((_, i) => i !== idx)
        const newIndex = idx < s.currentIndex ? s.currentIndex - 1 : s.currentIndex
        useSequentialStore.setState({ questionIds: newIds, questionKps: newKps, currentIndex: newIndex })
        markPracticeSync()
        supabase.from('practice_sequential_state').upsert({
          user_id: u.id, session_key: s.sessionKey, selected_kps: s.selectedKps,
          question_ids: newIds, current_index: newIndex, subject_positions: s.subjectPositions, updated_at: new Date().toISOString(),
        }).then(() => {})
      }
      loadSequentialQuestion(useSequentialStore.getState().currentIndex)
    } else fetchRandomQuestion()
  }, [question, questionMode, loadSequentialQuestion, fetchRandomQuestion, bumpRefresh])

  const handleMarkUnsure = useCallback(async () => {
    if (!question) return
    const id = await saveAnswer(question.id, [], false, 'practice')
    setAnswerId(id)
    answeredThisSession.current.add(question.id)
    sessionStateRef.current.set(question.id, { answer: [], answerId: id, note, isPublic, attempts: attemptCount, wrongs: wrongCount })
    setIsSubmitted(true)
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
  }, [question, saveAnswer, bumpRefresh])

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  })

  return (
    <div className="space-y-3">
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction={isMobile ? 'bottom' : 'right'}>
          <DrawerContent className={isMobile ? '' : '!inset-y-0 !right-0 !left-auto !top-0 !mt-0 !h-full w-[400px] max-w-[85vw] !rounded-l-[10px] !rounded-t-none'}>
            <DrawerHeader>
              <DrawerTitle>筛选条件</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 scroll-fade overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2">
                <FilterBtn label={selectedSubjects.length > 0 ? `学科(${selectedSubjects.length})` : '学科'}>
                  {planSubjects.length > 0 && <><DropdownMenuSub><DropdownMenuSubTrigger className="text-xs">{t('plan.longTerm')}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{planSubjects.map((s) => (<DropdownMenuCheckboxItem key={s} checked={selectedSubjects.includes(s)} onCheckedChange={() => setSelectedSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}>{s}</DropdownMenuCheckboxItem>))}</DropdownMenuSubContent></DropdownMenuSub></>}
                  {dailyTargetSubjects.length > 0 && <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger className="text-xs">{t('plan.dailyTarget')}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{dailyTargetSubjects.map((s) => (<DropdownMenuCheckboxItem key={s} checked={selectedSubjects.includes(s)} onCheckedChange={() => setSelectedSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}>{s}</DropdownMenuCheckboxItem>))}</DropdownMenuSubContent></DropdownMenuSub></>}
                  {otherSubjects.length > 0 && <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger className="text-xs">其他</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{otherSubjects.map((s) => (<DropdownMenuCheckboxItem key={s} checked={selectedSubjects.includes(s)} onCheckedChange={() => setSelectedSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}>{s}</DropdownMenuCheckboxItem>))}</DropdownMenuSubContent></DropdownMenuSub></>}
                  {selectedSubjects.length > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSelectedSubjects([])} className="text-muted-foreground text-xs">清除学科</DropdownMenuItem></>}
                </FilterBtn>
                <FilterBtn label={selectedCategory || '分类'}>
                  <DropdownMenuItem onClick={() => setSelectedCategory('')}><span className="text-muted-foreground">不限</span>{!selectedCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  {yearCategories.length > 0 && <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger className="text-xs">历年真题</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{yearCategories.map((c) => (<DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}</DropdownMenuSubContent></DropdownMenuSub></>}
                  {nonYearCategories.map((c) => (<DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
                </FilterBtn>
                <FilterBtn label={selectedType ? t(`questionTypes.${selectedType}` as any) : '题型'}>
                  <DropdownMenuItem onClick={() => setSelectedType('')}><span className="text-muted-foreground">不限</span>{!selectedType && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  {QUESTION_TYPE_OPTIONS.map((o) => (<DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>{t(`questionTypes.${o.value}` as any)}{selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
                </FilterBtn>
                <FilterBtn label={selectedKeyPoint || '知识点'}>
                  <DropdownMenuItem onClick={() => setSelectedKeyPoint('')}><span className="text-muted-foreground">不限</span>{!selectedKeyPoint && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  {kpBySubject.length === 0 ? <div className="px-2 py-3 space-y-1.5">{[1,2,3].map(i => <Skeleton key={i} className="h-4 w-full" />)}</div> : kpBySubject.map(({ subject, keyPoints }) => (<DropdownMenuSub key={subject}><DropdownMenuSubTrigger className="text-xs">{subject} ({keyPoints.length})</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{keyPoints.map(kp => <DropdownMenuItem key={kp} onClick={() => setSelectedKeyPoint(kp)}>{kp}{selectedKeyPoint === kp && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>))}
                </FilterBtn>
                <FilterBtn label={questionMode === 'sequential' ? '顺序刷题' : ({ all: '全部', favorites: '收藏', wrong: '错题' } as Record<string, string>)[questionScope]}>
                  <DropdownMenuItem onClick={() => setQuestionScope('all')}>全部{questionScope === 'all' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuestionScope('favorites')}>仅收藏{questionScope === 'favorites' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuestionScope('wrong')}>仅错题{questionScope === 'wrong' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                </FilterBtn>
                <FilterBtn label={{ new: '新题优先', wrong: '错题优先', sequential: '顺序刷题' }[questionMode] || '模式'}>
                  <DropdownMenuItem onClick={() => setQuestionMode('sequential')}>顺序刷题{questionMode === 'sequential' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setQuestionMode('new')}>新题优先{questionMode === 'new' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuestionMode('wrong')}>错题优先{questionMode === 'wrong' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                </FilterBtn>
              </div>
              {questionMode === 'sequential' && (
                <>
                  <hr className="my-4 border-dashed border-border" />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">刷题会话</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSequentialDialogOpen(true); setDrawerOpen(false) }}><Plus className="h-3 w-3 mr-1" />新建</Button>
                  </div>
                  {seqSessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">暂无会话</p>
                  ) : (
                    <div className="space-y-1.5">
                      {seqSessions.map(s => {
                        const progress = s.questionIds.length > 0 ? Math.round((s.currentIndex / s.questionIds.length) * 100) : 0
                        const isActive = s.sessionKey === seqSessionKey
                        const subjCounts: Record<string, number> = {}
                        for (const kp of s.selectedKps) { const subj = kpToSubjectRef.current.get(kp); if (subj) subjCounts[subj] = (subjCounts[subj] || 0) + 1 }
                        const subjEntries = Object.entries(subjCounts)
                        return (
                          <div key={s.sessionKey} role="button" tabIndex={0} className={cn('w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-accent cursor-pointer', isActive && 'border-primary/50 bg-primary/5')}
                            onClick={async () => {
                              const u = useAuthStore.getState().user; if (!u) return
                              if (isActive) { setSequentialDialogOpen(true); setDrawerOpen(false); return }
                              saveCurrentSession()
                              await seqSwitchSession(u.id, s.sessionKey)
                              loadSequentialQuestion(useSequentialStore.getState().currentIndex)
                              setDrawerOpen(false)
                            }}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); (ev.currentTarget as HTMLElement).click() } }}>
                            <div className="flex items-center gap-1.5 mb-1">
                              {subjEntries.length > 0 ? subjEntries.map(([subj, n], idx) => (
                                <span key={subj} className="inline-flex items-center gap-1.5">
                                  {idx > 0 && <Separator orientation="vertical" className="h-3" />}
                                  <span className="text-xs font-medium">{subj}</span>
                                  <span className="text-[10px] text-muted-foreground">{n}个</span>
                                </span>
                              )) : <span className="text-xs text-muted-foreground">{s.selectedKps.length}个知识点</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mb-1.5">{new Date(s.createdAt || s.updatedAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} 创建</p>
                            <div className="flex items-center gap-2">
                              <Progress value={progress} className="h-1 flex-1" />
                              <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">{s.currentIndex}/{s.questionIds.length}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive/60 hover:text-destructive"
                                onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); setDeleteSessionKey(s.sessionKey) }}
                                title="删除会话">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <DrawerFooter>
              <DrawerClose asChild><Button variant="outline" className="w-full">关闭</Button></DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

      {planSubjectSet.size > 0 && (
        <KpSelectDialog open={sequentialDialogOpen} onOpenChange={setSequentialDialogOpen} kpBySubject={kpBySubject} planSubjects={[...planSubjectSet]} selectedKps={seqKps} onConfirm={handleKpConfirm} />
      )}
      <PlanDialog open={planDialogOpen} onOpenChange={setPlanDialogOpen} />

      <AlertDialog open={blockSkipOpen} onOpenChange={setBlockSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>此题还未作答</AlertDialogTitle>
            <AlertDialogDescription>
              请先完成当前题目，或选择"太简单"跳过、选择"不确定"标记后继续。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBlockSkipOpen(false)}>继续作答</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setBlockSkipOpen(false); handleMarkTooEasy() }} className="bg-muted text-foreground hover:bg-muted/80">太简单</AlertDialogAction>
            <AlertDialogAction onClick={() => { setBlockSkipOpen(false); handleMarkUnsure() }}>不确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {planSubjectSet.size === 0 && (questionMode === 'sequential' || selectedSubjects.length === 0) && !isLoading ? (
        <div className="text-center py-12 space-y-4">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">尚未设置学习计划</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            设置学习计划后，系统将自动推荐对应科目的题目，并追踪每日进度。
          </p>
          <Button onClick={() => setPlanDialogOpen(true)}>去设置学习计划</Button>
        </div>
      ) : questionMode === 'sequential' && !seqActive && !isLoading ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">尚未选择知识点</p>
          <Button onClick={() => setSequentialDialogOpen(true)}>选择知识点开始刷题</Button>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md ml-auto" />
            </div>
            <div className="grid gap-y-1.5 text-xs" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-2 rounded-full" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-2.5 rounded-full" />
              <Skeleton className="h-3 w-8" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-3/4" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </div>
      ) : noQuestions && questionMode === 'sequential' ? (
        <div className="text-center py-12 space-y-4">
          <Check className="h-12 w-12 mx-auto text-green-500" />
          <p className="text-lg font-medium">{t('practice.sequentialDone')}</p>
          <p className="text-muted-foreground">{t('practice.sequentialDoneDesc')}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => { setQuestionMode('new'); seqReset(); fetchRandomQuestion() }}>{t('practice.backToNormalMode')}</Button>
            <Button onClick={() => { const u = useAuthStore.getState().user; if (u) { seqStart(u.id, seqKps, subjectsForKps(seqKps), '').then(() => loadSequentialQuestion(0)) } }}><Shuffle className="h-4 w-4" />{t('practice.tryAgain')}</Button>
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
      ) : (
        <div className="space-y-4">
          {questionMode === 'sequential' && seqActive && seqQuestionIds.length > 0 && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const seen = new Set<string>()
                    const unique = subjectBlocks.filter(b => seen.has(b.subject) ? false : (seen.add(b.subject), true))
                    return unique.length > 1 ? unique.map(b => {
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
                          {b.subject}
                        </button>
                      )
                    }) : null
                  })()}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto" onClick={() => setDrawerOpen(true)} title="筛选条件">
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
                const lastSync = seqLastSyncAt || [...seqSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt
                const syncStr = lastSync ? (() => { const d = new Date(lastSync); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` })() : null
                return <SequentialProgressBar currentIndex={relIndex} total={total} kpCurrent={ki.kpCurrent || 0} kpTotal={ki.kpTotal || 0} kpName={ki.kpName || qKp || null} deviceIcon={devIcon} deviceName={devName} syncText={syncStr} syncStatus={seqSyncStatus} />
              })()}
            </div>
            </div>
          )}
          {!questionReady && !showSkeleton ? (
            <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-5/6" />
                <Skeleton className="h-5 w-3/4" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
          ) : question ? (
            <>
              <div className="touch-pan-y select-none" style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                <QuestionCard key={question.id} question={question} selectedAnswer={selectedAnswer} showResult={isSubmitted} onSelect={handleSelect} disabled={isSubmitted} showEditLink={isAdmin} attemptCount={attemptCount} wrongCount={wrongCount} note={note} isFavorited={question ? isFavorite(question.id) : false} onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined} onMarkTooEasy={question && !isSubmitted ? handleMarkTooEasy : undefined} onMarkUnsure={question && !isSubmitted ? handleMarkUnsure : undefined} onVerify={question && !question.verified ? async () => { await supabase.from('questions').update({ verified: true }).eq('id', question.id); setQuestion({ ...question, verified: true }) } : undefined} />
              </div>
              {isSubmitted && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
                  <NoteEditor placeholder={t('practice.notePlaceholder')} value={note} onChange={setNote} />
                  <div className="flex items-center justify-between"><div><p className="text-sm">{t('notes.makePublic')}</p><p className="text-xs text-muted-foreground">{isPublic ? t('notes.publicLabel') : t('notes.privateLabel')}</p></div><Checkbox checked={isPublic} onCheckedChange={(v) => handlePublicToggle(v === true)} /></div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handlePrev} disabled={!hasPrev}>
                  <ArrowLeft className="h-4 w-4" />
                  {t('practice.previousQuestion')}{" "}
                  <Kbd data-icon="inline-end" className="translate-x-0.5">⇦</Kbd>
                </Button>
                {!isSubmitted ? (
                  <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                    {t('practice.submitAnswer')}{" "}
                    <Kbd data-icon="inline-end" className="translate-x-0.5">⏎</Kbd>
                  </Button>
                ) : (
                  <Button onClick={handleNext}>
                    {t('practice.nextQuestion')}{" "}
                    <Kbd data-icon="inline-end" className="translate-x-0.5">⇨</Kbd>
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
