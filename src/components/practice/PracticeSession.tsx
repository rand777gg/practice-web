import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { chunkIds } from '@/lib/chunk-ids'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useSequentialStore, markPracticeSync, sameSubjects } from '@/stores/sequential-store'
import { earliestPassStart, fetchAnsweredRows, fetchSessionsAnswered, passStartIso } from '@/lib/answered-rows'
import { passStartBySubject } from '@/hooks/use-plan-completion'

import { useUserAnswers } from '@/hooks/use-user-answers'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSwipe } from '@/hooks/use-swipe'
import { useKpExplanations, kpExplanationKey } from '@/hooks/use-kp-explanations'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { FlagIssueDialog } from '@/components/questions/FlagIssueDialog'
import { KpSelectDialog } from '@/components/practice/KpSelectDialog'
import { KpExplanationDialog } from '@/components/practice/KpExplanationDialog'
import { QuestionSources } from '@/components/practice/QuestionSources'
import { PlanDialog } from '@/components/layout/PlanDialog'



import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SequentialProgressBar } from '@/components/practice/SequentialProgressBar'
import { SequentialKpNav, type SessionDistEntry, type GroupDist } from '@/components/practice/SequentialKpNav'
import { SequentialPracticeNewUi } from '@/components/practice/SequentialPracticeNewUi'
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
import { Check, ChevronDown, Filter, GraduationCap, List, MoveHorizontal, Plus, Shuffle, Timer, Trash2, BookOpen } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FocusTimer } from '@/components/layout/FocusTimer'

import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'


import { useIsMobile } from '@/hooks/use-mobile'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { cn, naturalSort } from '@/lib/utils'
import { getPrefetchedQuestionIds, getPrefetchedQuestion } from '@/lib/offline-db'
import type { Question, CorrectAnswer, QuestionType } from '@/types'
import { resolveGoals, resolveRounds } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

const PS_FILTERS = 'practice_filters'

// Module-level KP cache (P3: avoid repeated question_meta_cache queries across mounts)
let kpCache: { subject: string; keyPoints: string[] }[] | null = null

// 本遍门槛: 优先用轮次算出来的本遍起点(轮次起始日/上一轮完成日, 见 passStartBySubject),
// 没有轮次记录时才退回学科重置时刻 / 计划重置时刻
function isAnsweredAfterReset(answeredAt: string, subject: string, subjectResets: Record<string, string> | null | undefined, planResetAt: string | null | undefined, passStartMs?: number | null) {
  const reset = (subjectResets && subjectResets[subject]) || planResetAt
  const threshold = passStartMs ?? (reset ? new Date(reset).getTime() : null)
  if (threshold == null) return true
  return new Date(answeredAt).getTime() >= threshold
}

interface PracticeFilters {
  selectedSubjects: string[]
  selectedCategory: string
  selectedType: string
  selectedKeyPoint: string
  questionMode: string
  questionScope: string
  /** 复习模式的轮次范围(学科|轮次), 单独选 */
  reviewRounds?: string[]
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

function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false
  const parts = shortcut.split('+').filter(Boolean)
  if (parts.length === 0) return false
  const mainKey = parts[parts.length - 1]
  const eventKey = e.key === ' ' ? 'Space' : e.key
  return eventKey === mainKey
    && e.ctrlKey === parts.includes('Control')
    && e.shiftKey === parts.includes('Shift')
    && e.altKey === parts.includes('Alt')
    && e.metaKey === parts.includes('Meta')
}

const KEY_DISPLAY: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Enter: '⏎', Escape: 'Esc', Control: 'Ctrl', Shift: '⇧', Alt: 'Alt', Meta: '⌘', Space: 'Space',
}
function keyToDisplay(key: string): string { return KEY_DISPLAY[key] || (key.length === 1 ? key.toUpperCase() : key) }

function ShortcutKbd({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split('+').filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return <Kbd data-icon="inline-end" className="translate-x-0.5">{keyToDisplay(parts[0])}</Kbd>
  return <KbdGroup>{parts.map((k, i) => <Kbd key={i}>{keyToDisplay(k)}</Kbd>)}</KbdGroup>
}

function FilterBtn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs h-8 font-normal truncate max-w-40">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
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
  const searchParamsRef = useRef(searchParams)
  useEffect(() => { searchParamsRef.current = searchParams }, [searchParams])
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
  const authUser = useAuthStore((s) => s.user)
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
  const [flagDialogOpen, setFlagDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [questionReady, setQuestionReady] = useState(false)
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const skeletonVisibleRef = useRef(false)
  useEffect(() => { skeletonVisibleRef.current = showSkeleton }, [showSkeleton])
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isLoading) {
      if (isInitialMount.current) {
        setShowSkeleton(true)
      } else if (!showSkeleton && !question) {
        skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 150)
      }
    } else {
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
  const seqShortId = useSequentialStore((s) => s.shortId)
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
    const planSet = new Set(planSubjects)
    return [...new Set(resolveGoals(profile).map((g) => g.subject))].filter((s) => !planSet.has(s))
  }, [profile, planSubjects])

  const planSubjectSet = useMemo(() => new Set([...planSubjects, ...dailyTargetSubjects]), [planSubjects, dailyTargetSubjects])
  const planSessionScope = useMemo(() => JSON.stringify([...planSubjectSet].sort()), [planSubjectSet])
  const planSubjectSetRef = useRef(planSubjectSet)
  planSubjectSetRef.current = planSubjectSet
  const otherSubjects = useMemo(() => subjects.filter((s) => !planSubjectSet.has(s)), [subjects, planSubjectSet])

  // 复习模式的复习池(错题 ∪ 收藏)是单独选的: 学科 + 轮次 → 按各轮时间窗统计
  const [reviewPool, setReviewPool] = useState<number | null>(null)
  const [reviewScopeOpen, setReviewScopeOpen] = useState(false)
  const planRounds = useMemo(() => resolveRounds(profile), [profile])
  const [reviewRounds, setReviewRounds] = useState<string[]>(saved.current?.reviewRounds ?? [])

  // 复习池的窗口: `${学科}|${轮次}` 按该轮时间窗; `${学科}|all` = 该学科全部(不限轮次)
  const reviewWindows = useMemo(() => {
    const alls = reviewRounds
      .filter((k) => k.endsWith('|all'))
      .map((k) => ({ subject: k.slice(0, -4), round: 0, since: '1970-01-01', until: '' }))
    const byRound = planRounds
      .filter((r) => reviewRounds.includes(`${r.subject}|${r.round}`))
      .map((r) => ({ subject: r.subject, round: r.round, since: r.start ?? r.createdAt, until: r.target }))
    return [...alls, ...byRound]
  }, [planRounds, reviewRounds])

  useEffect(() => {
    if (!authUser) return
    let live = true
    void supabase.rpc('get_review_pool_count', {
      p_user_id: authUser.id,
      p_windows: reviewWindows.map((w) => ({ subject: w.subject, since: w.since, until: w.until })),
    }).then(({ data }) => {
      if (live) setReviewPool(data == null ? null : Number(data))
    })
    return () => { live = false }
  }, [authUser, reviewRounds.join(','), planRounds, question?.id])

  const toggleReviewRound = (key: string) => {
    setReviewRounds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const roundsByPlanSubject = useMemo(() => {
    const map = new Map<string, typeof planRounds>()
    for (const s of planSubjectSet) map.set(s, [])
    for (const r of planRounds) {
      const list = map.get(r.subject)
      if (list) list.push(r)
      else map.set(r.subject, [r])
    }
    for (const list of map.values()) list.sort((a, b) => a.round - b.round)
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [planRounds, planSubjectSet])

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
  const [questionScope, setQuestionScope] = useState<'all' | 'favorites' | 'wrong' | 'review'>((saved.current?.questionScope as any) ?? 'all')

  // 切到复习模式但还没选范围 → 弹出来重新选学科 + 轮次
  useEffect(() => {
    if (questionScope === 'review' && reviewRounds.length === 0) setReviewScopeOpen(true)
  }, [questionScope, reviewRounds.length])
  const [sequentialDialogOpen, setSequentialDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const subjectPosRef = useRef<Record<string, number>>({})
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** 会话列表里每个会话"本轮已作答"的题数(key = session_key), null = 还在算 */
  const [sessionAnswered, setSessionAnswered] = useState<Map<string, number> | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)
  const answeredThisSession = useRef<Set<string>>(new Set())
  const [answeredSessionSnapshot, setAnsweredSessionSnapshot] = useState<Set<string>>(new Set())
  const [justAnsweredId, setJustAnsweredId] = useState<string | null>(null)
  const sessionDistRef = useRef<Map<string, SessionDistEntry>>(new Map())
  const [sessionDistSnapshot, setSessionDistSnapshot] = useState<Map<string, SessionDistEntry>>(new Map())
  const [distMode, setDistMode] = useState(true)
  const [kpSeekMode, setKpSeekMode] = useState(false)
  const [currentKpDist, setCurrentKpDist] = useState<GroupDist | null>(null)

  useEffect(() => {
    setJustAnsweredId(null)
  }, [question?.id])
  const sessionStateRef = useRef<Map<string, { answer: CorrectAnswer | null; answerId: string | null; note: string; isPublic: boolean; attempts: number; wrongs: number }>>(new Map())
  const historyRef = useRef<{ question: Question; answer: CorrectAnswer | null; submitted: boolean; note: string; isPublic: boolean; answerId: string | null; attempts: number; wrongs: number }[]>([])
  const snapRef = useRef<{ question: Question | null; answer: CorrectAnswer | null; submitted: boolean; note: string; isPublic: boolean; answerId: string | null; attempts: number; wrongs: number }>({ question: null, answer: null, submitted: false, note: '', isPublic: false, answerId: null, attempts: 0, wrongs: 0 })
  useEffect(() => { snapRef.current = { question, answer: selectedAnswer, submitted: isSubmitted, note, isPublic, answerId, attempts: attemptCount, wrongs: wrongCount } })

  const [blockSkipOpen, setBlockSkipOpen] = useState(false)
  const [tooEasyOpen, setTooEasyOpen] = useState(false)
  const [resumePrompt, setResumePrompt] = useState<{ kps: string[]; subs: string[] } | null>(null)
  const [excludedPrompt, setExcludedPrompt] = useState<{ kps: string[]; subs: string[]; qids: string[]; count: number } | null>(null)

  const isMobile = useIsMobile()
  const practiceShortcuts = useSettingsStore((s) => s.practiceShortcuts)
  const practiceUiVariant = useSettingsStore((s) => s.practiceUiVariant)


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

  // 每科"这一遍"的起点(轮次起始日 / 上一轮完成日 与 重置时刻取晚的那个, 和计划里的轮次同一个口径)
  const passStarts = useMemo(() => passStartBySubject(planRounds, profile), [planRounds, profile])

  // 会话加载/恢复时，从数据库回填"本次会话已作答"集合（按本遍门槛过滤），
  // 使恢复的会话中所有已作答题目都显示"本题此次会话已作答过"
  useEffect(() => {
    const user = useAuthStore.getState().user
    if (!user || !seqActive || seqQuestionIds.length === 0) return
    let cancelled = false
    const CHUNK = 200
    const chunks: string[][] = []
    for (let i = 0; i < seqQuestionIds.length; i += CHUNK) chunks.push(seqQuestionIds.slice(i, i + CHUNK))
    const since = earliestPassStart(seqQuestionSubjects, profile?.subject_reset_at, profile?.plan_reset_at, passStarts)
    Promise.all(chunks.map(chunk => fetchAnsweredRows(user.id, chunk, since))).then(results => {
      if (cancelled) return
      const latest = new Map<string, string>()
      for (const rows of results) {
        for (const row of rows) {
          const prev = latest.get(row.question_id)
          if (!prev || row.answered_at > prev) latest.set(row.question_id, row.answered_at)
        }
      }
      let changed = false
      for (let i = 0; i < seqQuestionIds.length; i++) {
        const id = seqQuestionIds[i]
        if (answeredThisSession.current.has(id)) continue
        const at = latest.get(id)
        if (!at) continue
        const subject = seqQuestionSubjects[i] ?? ''
        if (isAnsweredAfterReset(at, subject, profile?.subject_reset_at ?? null, profile?.plan_reset_at ?? null, passStarts[subject])) {
          answeredThisSession.current.add(id)
          changed = true
        }
      }
      if (changed) setAnsweredSessionSnapshot(new Set(answeredThisSession.current))
    })
    return () => { cancelled = true }
  }, [seqActive, seqQuestionIds, seqQuestionSubjects, profile?.subject_reset_at, profile?.plan_reset_at, passStarts])

  // 会话列表的"已作答": current_index 只是光标(含跳过没答的题、也含这一遍之前的旧作答),
  // 所以打开抽屉时按本遍门槛实算一次每个会话真正做过的题数, 和计划/主进度条对得上
  useEffect(() => {
    if (!drawerOpen || questionMode !== 'sequential') return
    const uid = useAuthStore.getState().user?.id
    if (!uid || seqSessions.length === 0) return
    let cancelled = false
    setSessionAnswered(null)
    // 门槛只认学科, 把会话涉及到的学科(加上重置记录里的)一起算出来交给服务端
    const subjects = [...new Set([
      ...seqSessions.flatMap((s) => [...s.planSubjects, ...Object.keys(s.subjectPositions)]),
      ...Object.keys(profile?.subject_reset_at ?? {}),
    ])]
    const starts = passStartIso(subjects, profile?.subject_reset_at, profile?.plan_reset_at, passStarts)
    fetchSessionsAnswered(uid, starts).then((map) => { if (!cancelled) setSessionAnswered(map) })
    return () => { cancelled = true }
  }, [drawerOpen, questionMode, seqSessions, profile?.subject_reset_at, profile?.plan_reset_at, passStarts])

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

  // 总进度：对应学科的完成题数/该学科总题数（只随作答变化，不随当前题位置/拖动变化）
  const sessionProgress = useMemo(() => {
    if (!seqActive) return { done: 0, total: 0 }
    if (currentSubject == null) {
      let done = 0
      for (const id of seqQuestionIds) {
        if (answeredSessionSnapshot.has(id)) done++
      }
      return { done, total: seqQuestionIds.length }
    }
    const block = subjectBlocks.find(b => b.subject === currentSubject)
    if (!block) return { done: 0, total: 0 }
    let done = 0
    for (let i = block.start; i <= block.end; i++) {
      if (answeredSessionSnapshot.has(seqQuestionIds[i])) done++
    }
    return { done, total: block.count }
  }, [seqActive, currentSubject, subjectBlocks, seqQuestionIds, answeredSessionSnapshot])

  // 总进度：整个会话所有学科已作答题数/总题数
  const overallProgress = useMemo(() => {
    if (!seqActive) return { done: 0, total: 0 }
    let done = 0
    for (const id of seqQuestionIds) {
      if (answeredSessionSnapshot.has(id)) done++
    }
    return { done, total: seqQuestionIds.length }
  }, [seqActive, seqQuestionIds, answeredSessionSnapshot])

  // 本组正确率：当前学科本次会话已作答题目的 正确/(正确+错误)，无作答则隐藏
  const sessionAccuracy = useMemo(() => {
    if (!seqActive || currentSubject == null) return null
    const block = subjectBlocks.find(b => b.subject === currentSubject)
    const ids = block ? seqQuestionIds.slice(block.start, block.end + 1) : seqQuestionIds
    let correct = 0, wrong = 0
    for (const id of ids) {
      const st = sessionDistSnapshot.get(id)?.status
      if (st === 'correct') correct++
      else if (st === 'wrong') wrong++
    }
    if (correct + wrong === 0) return null
    return Math.round((correct / (correct + wrong)) * 100)
  }, [seqActive, currentSubject, subjectBlocks, seqQuestionIds, sessionDistSnapshot])

  // 新/旧 UI 共用的顶部信息位（当前题号、正确率、设备同步等）
  const seqUi = useMemo(() => {
    const block = currentSubject ? subjectBlocks.find(b => b.subject === currentSubject) : null
    const ci = seqIndex
    const total = block ? block.count : seqQuestionIds.length
    const offset = block ? block.start : 0
    const relIndex = block ? ci - offset : ci
    const ki = seqGetCurrentKpInfo()
    const qKp = question?.key_points?.split(/[,，;；]/)[0]?.trim()
    const ua = navigator.userAgent
    const devIcon = /Windows/i.test(ua) ? 'mingcute:windows-line' : /Mac/i.test(ua) ? 'mingcute:apple-line' : /Android/i.test(ua) ? 'mingcute:android-line' : /Linux/i.test(ua) ? 'mingcute:linux-line' : /iPhone|iPad/i.test(ua) ? 'mingcute:ios-line' : 'mingcute:computer-line'
    let devName = ''
    try { const uad = (navigator as any).userAgentData; if (uad?.platform) devName = uad.platform + (uad.platformVersion ? ' ' + uad.platformVersion : '') } catch {}
    const lastSync = seqLastSyncAt || [...seqSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt
    const syncStr = lastSync ? (() => { const d = new Date(lastSync); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })() : null
    return { block, total, offset, relIndex, ki, qKp, devIcon, devName, syncStr }
  }, [currentSubject, subjectBlocks, seqIndex, question, seqGetCurrentKpInfo, seqLastSyncAt, seqSessions, seqQuestionIds.length])

  const kpBySubjectRef = useRef(kpBySubject)
  kpBySubjectRef.current = kpBySubject
  const kpToSubjectRef = useRef(kpToSubject)
  kpToSubjectRef.current = kpToSubject

  // Persist filters to localStorage + DB
  useEffect(() => {
    const filters = { selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope, reviewRounds }
    saveFilters(filters)
    const user = useAuthStore.getState().user
    if (user) saveFiltersToDb(user.id, filters)
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, questionMode, questionScope, reviewRounds])

  // Sync 练习模式 ↔ URL: seq(顺序刷题) / random(随机抽题) / review(复习错题与收藏)
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    if (urlMode === 'seq' && questionMode !== 'sequential') { switchMode('sequential'); return }
    if (urlMode === 'random' && (questionMode === 'sequential' || questionScope === 'review')) {
      switchMode('new')
      setQuestionScope('all')
      return
    }
    if (urlMode === 'review' && (questionMode === 'sequential' || questionScope !== 'review')) {
      switchMode('new')
      setQuestionScope('review')
      return
    }
    const want = questionMode === 'sequential' ? 'seq' : questionScope === 'review' ? 'review' : 'random'
    if (urlMode !== want) {
      setSearchParams(prev => { prev.set('mode', want); return prev }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, questionMode, questionScope])

  // Sync active sequential session short id to URL so refresh/deep-link can restore it
  useEffect(() => {
    if (questionMode === 'sequential' && seqShortId && searchParams.get('session') !== seqShortId) {
      setSearchParams(prev => { prev.set('session', seqShortId); return prev }, { replace: true })
    }
  }, [questionMode, seqShortId])

  // Normalize legacy 'wrong' mode → review scope (scope=wrong preserves the behavior)
  useEffect(() => {
    if (questionMode === 'wrong') {
      setQuestionMode('new')
      if (questionScope === 'all') setQuestionScope('wrong')
    }
  }, [questionMode, questionScope])

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
  useEffect(() => { triggerKpRefresh() }, [profile, planSubjects, triggerKpRefresh])

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

  /**
   * 深链钉住的那道题(URL 上的 ?q=)。
   *
   * 信源侧「关联题目」跳过来的就是这条: 落到的必须是**那一题**, 不能是随机的另一题。
   * 一旦用户自己往下刷(下一题/顺序跳转), 这枚钉子就拔掉连地址一起清 —— 否则切个模式
   * 又会被拽回同一道题, 像卡住了。
   */
  const pinnedRef = useRef<string | null>(null)
  const releasePinned = useCallback(() => {
    if (!pinnedRef.current) return
    pinnedRef.current = null
    if (!searchParamsRef.current.get('q')) return
    setSearchParams(prev => { prev.delete('q'); return prev }, { replace: true })
  }, [setSearchParams])

  /** 直接读一道题(不挑、不过滤): 深链专用 */
  const loadPinnedQuestion = useCallback(async (id: string) => {
    fetchGenRef.current++
    const myGen = fetchGenRef.current
    setIsLoading(true)
    setQuestionReady(false)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setAnswerId(null)
    setNoQuestions(false)

    const currentUser = useAuthStore.getState().user
    const [qRes, statsRes] = await Promise.all([
      supabase.from('questions').select('*').eq('id', id).single(),
      currentUser
        ? supabase.from('user_answers')
            .select('is_correct, note, is_public')
            .eq('user_id', currentUser.id)
            .eq('question_id', id)
            .order('answered_at', { ascending: false })
        : Promise.resolve(null),
    ])
    if (fetchGenRef.current !== myGen) return
    if (qRes.error || !qRes.data) { setNoQuestions(true); setIsLoading(false); return }
    if (skeletonVisibleRef.current) await new Promise(r => setTimeout(r, 400))
    if (fetchGenRef.current !== myGen) return

    setQuestion(qRes.data as unknown as Question)
    const statsData = statsRes?.data
    setAttemptCount(statsData?.length ?? 0)
    setWrongCount(statsData?.filter((a) => !a.is_correct).length ?? 0)
    setNote(statsData?.find((a) => a.note)?.note ?? '')
    setIsPublic(statsData?.find((a) => a.note)?.is_public ?? false)
    setIsLoading(false)
    setQuestionReady(true)
  }, [])

  const fetchRandomQuestion = useCallback(async () => {
    releasePinned()
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

    // Scope: review — 错题 ∪ 收藏, 只取选中"学科×轮次"时间窗内的, 同一题只算一次
    if (!pickedId && currentUser && questionScope === 'review') {
      // 时间窗: 各轮 [createdAt, target] 的本地时间边界
      const winBounds = reviewWindows.map((w) => ({
        subject: w.subject,
        from: new Date(`${w.since}T00:00:00`).getTime(),
        to: new Date(`${w.until}T23:59:59.999`).getTime(),
      }))
      const inWindow = (subject: string | null | undefined, at: string | null | undefined) => {
        if (!subject || !at) return false
        const t = new Date(at).getTime()
        return winBounds.some((w) => w.subject === subject && t >= w.from && t <= w.to)
      }
      const [wrongRes, favRes] = await Promise.all([
        supabase.from('user_answers')
          .select('question_id, answered_at, questions!inner(subject, category, question_type, key_points)')
          .eq('user_id', currentUser.id).eq('is_correct', false)
          .order('answered_at', { ascending: false }).limit(500),
        supabase.from('favorites')
          .select('question_id, created_at, questions!inner(subject, category, question_type, key_points)')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false }).limit(500),
      ])
      if (fetchGenRef.current !== myGen) return
      type ReviewRow = {
        question_id: string
        answered_at?: string | null
        created_at?: string | null
        questions: { subject?: string | null; category?: string | null; categories?: string[] | null; question_type?: string | null; key_points?: string | null } | null
      }
      const byId = new Map<string, ReviewRow>()
      const wrongRows = (wrongRes.data ?? []) as unknown as ReviewRow[]
      const favRows = (favRes.data ?? []) as unknown as ReviewRow[]
      for (const r of wrongRows) {
        if (r?.question_id && inWindow(r.questions?.subject, r.answered_at) && !byId.has(r.question_id)) byId.set(r.question_id, r)
      }
      for (const r of favRows) {
        if (r?.question_id && inWindow(r.questions?.subject, r.created_at) && !byId.has(r.question_id)) byId.set(r.question_id, r)
      }
      if (byId.size > 0) {
        let filtered = [...byId.values()]
        if (selectedSubjects.length > 0) filtered = filtered.filter((r) => selectedSubjects.includes(r.questions?.subject ?? ''))
        if (selectedCategory) filtered = filtered.filter((r) => r.questions?.category === selectedCategory || (r.questions?.categories as string[])?.includes(selectedCategory))
        if (selectedType) filtered = filtered.filter((r) => r.questions?.question_type === selectedType)
        if (selectedKeyPoint) filtered = filtered.filter((r) => (r.questions?.key_points ?? '').includes(selectedKeyPoint))
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
  }, [selectedSubjects, selectedCategory, selectedType, selectedKeyPoint, planSubjectSet, questionMode, questionScope, releasePinned])

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
    releasePinned()
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
  }, [preloadNext, releasePinned])

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

  const startNewSession = useCallback(async (kps: string[], subs: string[], ignoreAnswered: boolean) => {
    const user = useAuthStore.getState().user; if (!user) return
    sessionDistRef.current.clear()
    setSessionDistSnapshot(new Map())
    await seqStart(user.id, kps, subs, '', ignoreAnswered)
    seqLoadSessions(user.id)
    loadSequentialQuestion(useSequentialStore.getState().currentIndex)
  }, [seqStart, seqLoadSessions, loadSequentialQuestion])

  const proceedAfterExcluded = useCallback(async (kps: string[], subs: string[]) => {
    const recent = (useSequentialStore.getState().sessions ?? []).find(x => (x.questionIds?.length ?? 0) > 0 && x.currentIndex > 0)
    if (recent) setResumePrompt({ kps, subs })
    else await startNewSession(kps, subs, true)
  }, [startNewSession])

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
      const { data: kpRows } = await supabase.from('kp_question_map').select('question_id').in('kp', kps)
      const qids = (kpRows ?? []).map(r => r.question_id)
      let excludedCount = 0
      if (qids.length > 0) {
        // qids 可能有几百个, 一次性 .in() 会拼出超长 URL(见 chunk-ids.ts), 分批后把计数相加
        const parts = await Promise.all(chunkIds(qids).map(c =>
          supabase.from('user_excluded_questions').select('question_id', { count: 'exact', head: true }).eq('user_id', user.id).in('question_id', c)))
        excludedCount = parts.reduce((sum, p) => sum + (p.count ?? 0), 0)
      }
      if (excludedCount > 0) setExcludedPrompt({ kps, subs, qids, count: excludedCount })
      else await proceedAfterExcluded(kps, subs)
    }
  }, [subjectsForKps, seqStart, loadSequentialQuestion, saveCurrentSession, seqLoadSessions, currentSubject, saveSubjectPos, triggerKpRefresh, proceedAfterExcluded])

  const handleKpsRestored = useCallback(async () => {
    const u = useAuthStore.getState().user
    if (!u) return
    const s = useSequentialStore.getState()
    const idx = s.currentIndex
    await seqStart(u.id, s.selectedKps, subjectsForKps(s.selectedKps), '')
    const s2 = useSequentialStore.getState()
    loadSequentialQuestion(Math.min(idx, Math.max(0, s2.questionIds.length - 1)))
    // Restored questions are back in the session — drop their too-easy marks
    const restoredIds = new Set(s2.questionIds)
    let changed = false
    for (const id of [...sessionDistRef.current.keys()]) {
      if (sessionDistRef.current.get(id)?.status === 'tooEasy' && restoredIds.has(id)) {
        sessionDistRef.current.delete(id)
        changed = true
      }
    }
    if (changed) setSessionDistSnapshot(new Map(sessionDistRef.current))
  }, [seqStart, subjectsForKps, loadSequentialQuestion])

  const modeInitRef = useRef(false)
  useEffect(() => {
    setShowSkeleton(true)
    // 深链 ?q=<id>(信源侧「关联题目」跳过来的): 落到那一题。
    // 顺序刷题与复习池都会拿别的题顶掉它, 所以先把模式拨回随机、并把 mode 写进地址 ——
    // 不写的话「模式同步」那个 effect 会按顺序模式把我们拨回去, 两边来回打架。
    const pinned = searchParamsRef.current.get('q')
    if (pinned) {
      if (questionMode === 'sequential' || questionScope !== 'all') {
        setQuestionMode('new')
        setQuestionScope('all')
        setSearchParams(prev => { prev.set('mode', 'random'); return prev }, { replace: true })
        return
      }
      // 同一个 id 只读一次: 这个 effect 在切模式/改计划范围时也会跑
      if (pinnedRef.current !== pinned) {
        pinnedRef.current = pinned
        loadPinnedQuestion(pinned)
      }
      return
    }
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
      seqLoadSessions(user.id).then(async () => {
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
          const urlSession = searchParamsRef.current.get('session')
          if (urlSession) {
            const { data: sidRow } = await supabase.from('practice_sequential_state').select('session_key').eq('user_id', user.id).eq('short_id', urlSession).maybeSingle()
            if (sidRow?.session_key) {
              seqLoadFromDb(user.id, sidRow.session_key).then(r => {
                const s2 = useSequentialStore.getState()
                if (r && s2.questionIds.length > 0) loadSequentialQuestion(s2.currentIndex)
                else { setIsLoading(false); setSequentialDialogOpen(true) }
              })
              return
            }
          }
          setIsLoading(false)
          setSequentialDialogOpen(true)
        }
      })
    } else {
      seqReset(); fetchRandomQuestion()
    }
    modeInitRef.current = true
  }, [questionMode, planSessionScope, loadPinnedQuestion, setSearchParams])

  const subFetchRef = useRef(false)
  useEffect(() => {
    if (!subFetchRef.current) { subFetchRef.current = true; return }
    // 地址上还钉着某道题时不自动抽题: 筛选条件加载完会改一次依赖, 那一下会把深链的题顶掉
    if (searchParamsRef.current.get('q')) return
    if (questionMode !== 'sequential') fetchRandomQuestion()
  }, [fetchRandomQuestion, questionMode])

  const handleSelect = useCallback((answer: CorrectAnswer) => {
    if (isSubmitted) return
    setSelectedAnswer(answer)
  }, [isSubmitted])

  const bumpRefresh = useRefreshStore((s) => s.bump)

  const switchMode = useCallback((mode: 'sequential' | 'new') => {
    setQuestionMode(mode)
    setIsLoading(true)
    setShowSkeleton(true)
  }, [])

  const [completionOpen, setCompletionOpen] = useState(false)

  useEffect(() => {
    if (noQuestions && questionMode === 'sequential') setCompletionOpen(true)
  }, [noQuestions, questionMode])

  const handleCompletionNewSession = useCallback(async () => {
    const u = useAuthStore.getState().user
    if (!u) return
    setCompletionOpen(false)
    answeredThisSession.current.clear()
    setAnsweredSessionSnapshot(new Set())
    sessionDistRef.current.clear()
    setSessionDistSnapshot(new Map())
    const subs = subjectsForKps(seqKps)
    const now = new Date().toISOString()
    const { data: existing } = await supabase.from('profiles').select('subject_reset_at').eq('id', u.id).single()
    const existingResets = (existing?.subject_reset_at ?? {}) as Record<string, string>
    const merged = { ...existingResets }
    for (const s of subs) merged[s] = now
    await supabase.from('profiles').update({ subject_reset_at: merged }).eq('id', u.id)
    await useAuthStore.getState().refreshProfile()
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
    sessionDistRef.current.clear()
    setSessionDistSnapshot(new Map())
    await seqStart(u.id, seqKps, subs, '')
    loadSequentialQuestion(0)
  }, [subjectsForKps, seqKps, seqStart, loadSequentialQuestion, bumpRefresh])

  const handleCompletionRepull = useCallback(async () => {
    const u = useAuthStore.getState().user
    if (!u) return
    setCompletionOpen(false)
    await seqStart(u.id, seqKps, subjectsForKps(seqKps), '')
    loadSequentialQuestion(useSequentialStore.getState().currentIndex)
  }, [seqKps, subjectsForKps, seqStart, loadSequentialQuestion])

  const handleSubmit = async () => {
    if (!question || selectedAnswer === null) return
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correct_answer, question.question_type, question.allow_unordered, question.unordered_blanks, question.case_questions)
    sessionDistRef.current.set(question.id, { status: isCorrect ? 'correct' : 'wrong' })
    setSessionDistSnapshot(new Map(sessionDistRef.current))
    const id = await saveAnswer(question.id, selectedAnswer, isCorrect, 'practice', undefined, questionMode === 'sequential' ? 'sequential' : 'random')
    setAnswerId(id)
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()

    if (questionMode === 'sequential') { markPracticeSync(); const s = useSequentialStore.getState(); supabase.from('practice_sequential_state').upsert({ user_id: useAuthStore.getState().user!.id, session_key: s.sessionKey, selected_kps: s.selectedKps, question_ids: s.questionIds, current_index: s.currentIndex, subject_positions: s.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
    answeredThisSession.current.add(question.id)
    setAnsweredSessionSnapshot(new Set(answeredThisSession.current))
    setJustAnsweredId(question.id)
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
      if (nextIdx >= s.questionIds.length) {
        const firstUnanswered = s.questionIds.findIndex(id => !answeredThisSession.current.has(id))
        if (firstUnanswered >= 0) {
          await loadSequentialQuestion(firstUnanswered)
          const s2 = useSequentialStore.getState()
          const u = useAuthStore.getState().user
          if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
          return
        }
        setNoQuestions(true); setIsLoading(false); return
      }
      await loadSequentialQuestion(nextIdx)
      // Save to DB after successful load
      const s2 = useSequentialStore.getState()
      const u = useAuthStore.getState().user
      if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
    }
    else fetchRandomQuestion()
  }, [questionMode, isSubmitted, question, fetchRandomQuestion, loadSequentialQuestion])

  const handleSkipToNextUnanswered = useCallback(async () => {
    if (questionMode !== 'sequential') return
    const s = useSequentialStore.getState()
    const ids = s.questionIds
    if (ids.length === 0) return
    const start = Math.max(s.currentIndex + 1, 0)
    let target = -1
    for (let offset = 0; offset < ids.length; offset++) {
      const j = (start + offset) % ids.length
      if (!answeredThisSession.current.has(ids[j])) { target = j; break }
    }
    if (target < 0) { setNoQuestions(true); setIsLoading(false); return }
    await loadSequentialQuestion(target)
    const s2 = useSequentialStore.getState()
    const u = useAuthStore.getState().user
    if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
  }, [questionMode, loadSequentialQuestion])

  const handleSeekKp = useCallback(async (rel: number) => {
    const s = useSequentialStore.getState()
    if (!s.isActive || s.questionIds.length === 0) return
    const kp = s.questionKps[s.currentIndex]
    if (!kp) return
    let start = s.currentIndex
    while (start > 0 && s.questionKps[start - 1] === kp) start--
    const target = Math.min(s.questionIds.length - 1, Math.max(0, start + rel))
    await loadSequentialQuestion(target)
    const s2 = useSequentialStore.getState()
    const u = useAuthStore.getState().user
    if (u) { markPracticeSync(); supabase.from('practice_sequential_state').upsert({ user_id: u.id, session_key: s2.sessionKey, selected_kps: s2.selectedKps, question_ids: s2.questionIds, current_index: s2.currentIndex, subject_positions: s2.subjectPositions, updated_at: new Date().toISOString() }).then(() => {}) }
  }, [loadSequentialQuestion])

  // ---- 知识点解读 (KP explanations) ----
  const kpExpl = useKpExplanations()
  const [kpExplainView, setKpExplainView] = useState<{ subject: string; kp: string } | null>(null)
  const [kpDonePrompt, setKpDonePrompt] = useState<{ subject: string; kp: string } | null>(null)
  const kpPromptedRef = useRef<Set<string>>(new Set())
  useEffect(() => { kpPromptedRef.current.clear() }, [seqSessionKey])

  const resolveSubjectForKp = useCallback((kp: string, fallback?: string | null): string =>
    selectedKpToSubject.get(kp) ?? kpToSubject.get(kp) ?? fallback ?? '其他', [selectedKpToSubject, kpToSubject])

  // KPs of the answered question that have a configured explanation (both modes)
  const availableKpEntries = useMemo(() => {
    if (!question || !isSubmitted) return [] as { subject: string; kp: string }[]
    const kps = (question.key_points ?? '').split(/[,，;；]/).map((s) => s.trim()).filter(Boolean)
    const out: { subject: string; kp: string }[] = []
    const seen = new Set<string>()
    for (const kp of kps) {
      const subject = resolveSubjectForKp(kp, question.subject)
      const key = kpExplanationKey(subject, kp)
      if (seen.has(key)) continue
      seen.add(key)
      if (kpExpl.explanations.has(key)) out.push({ subject, kp })
    }
    return out
  }, [question, isSubmitted, kpExpl.explanations, resolveSubjectForKp])

  // Sequential mode: when the user finishes the current KP's questions and moves
  // into the next KP, surface the explanation of the just-finished KP once.
  useEffect(() => {
    if (questionMode !== 'sequential' || !seqActive || seqIndex <= 0) return
    const prevKp = seqQuestionKps[seqIndex - 1]
    const curKp = seqQuestionKps[seqIndex]
    if (!prevKp || !curKp || prevKp === curKp) return
    const prevId = seqQuestionIds[seqIndex - 1]
    if (!prevId || !answeredThisSession.current.has(prevId)) return
    const subject = resolveSubjectForKp(prevKp, seqQuestionSubjects[seqIndex - 1] ?? null)
    const key = kpExplanationKey(subject, prevKp)
    if (!kpExpl.explanations.has(key)) return
    const promptKey = `${seqSessionKey}:${key}`
    if (kpPromptedRef.current.has(promptKey)) return
    kpPromptedRef.current.add(promptKey)
    setKpDonePrompt({ subject, kp: prevKp })
  }, [seqIndex, seqActive, questionMode, seqQuestionKps, seqQuestionIds, seqQuestionSubjects, answeredSessionSnapshot, kpExpl.explanations, resolveSubjectForKp, seqSessionKey])

  const prevRef = useRef(handlePrev)
  const nextRef = useRef(handleNext)
  const submitRef = useRef(handleSubmit)
  const markUnsureRef = useRef<() => void>(() => {})
  const markWrongRef = useRef<() => void>(() => {})
  const favoriteRef = useRef<() => void>(() => {})
  const tooEasyRef = useRef<() => void>(() => {})
  const flagIssueRef = useRef<() => void>(() => {})
  const shortcutsRef = useRef(practiceShortcuts)
  useEffect(() => { prevRef.current = handlePrev; nextRef.current = handleNext; submitRef.current = handleSubmit; shortcutsRef.current = practiceShortcuts })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 跳过输入目标(含 CodeMirror/.cm-editor 等编辑器),避免快捷键与打字冲突
      const t = e.target as HTMLElement | null
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || t.closest('.cm-editor') || t.closest('[contenteditable]'))) return
      if (isLoading || showSkeleton) return
      const sc = shortcutsRef.current
      if (matchShortcut(e, sc.prev)) { e.preventDefault(); prevRef.current() }
      if (matchShortcut(e, sc.next)) { e.preventDefault(); nextRef.current() }
      if (!isSubmitted && selectedAnswer !== null && matchShortcut(e, sc.submit)) { e.preventDefault(); submitRef.current() }
      if (!isSubmitted && matchShortcut(e, sc.markUnsure)) { e.preventDefault(); markUnsureRef.current() }
      if (matchShortcut(e, sc.markWrong)) { e.preventDefault(); markWrongRef.current() }
      if (!isSubmitted && matchShortcut(e, sc.tooEasy)) { e.preventDefault(); tooEasyRef.current() }
      if (matchShortcut(e, sc.favorite)) { e.preventDefault(); favoriteRef.current() }
      if (isAdmin && matchShortcut(e, sc.flagIssue)) { e.preventDefault(); flagIssueRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSubmitted, selectedAnswer, isLoading, showSkeleton, isAdmin])

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
      const kp = idx >= 0 ? s.questionKps[idx] : (question.key_points?.split(/[,，;；]/)[0]?.trim() ?? null)
      if (kp) {
        sessionDistRef.current.set(question.id, { status: 'tooEasy', kp })
        setSessionDistSnapshot(new Map(sessionDistRef.current))
      }
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
    setSelectedAnswer([])
    sessionDistRef.current.set(question.id, { status: 'wrong' })
    setSessionDistSnapshot(new Map(sessionDistRef.current))
    const id = await saveAnswer(question.id, [], false, 'practice', undefined, questionMode === 'sequential' ? 'sequential' : 'random')
    setAnswerId(id)
    answeredThisSession.current.add(question.id)
    setAnsweredSessionSnapshot(new Set(answeredThisSession.current))
    setJustAnsweredId(question.id)
    sessionStateRef.current.set(question.id, { answer: [], answerId: id, note, isPublic, attempts: attemptCount, wrongs: wrongCount })
    setIsSubmitted(true)
    bumpRefresh()
    useDashboardStore.getState().invalidatePlanCache()
  }, [question, saveAnswer, bumpRefresh])

  const handleSaveIssue = useCallback(async (flag: 'none' | 'suspected' | 'confirmed', noteText: string) => {
    if (!question) return
    const trimmed = noteText.trim()
    const patch = {
      issue_flag: flag,
      issue_note: flag === 'none' ? null : (trimmed || null),
      flagged_at: flag === 'none' ? null : new Date().toISOString(),
    }
    await supabase.from('questions').update(patch).eq('id', question.id)
    setQuestion({ ...question, ...patch })
  }, [question, setQuestion])

  useEffect(() => { markUnsureRef.current = handleMarkUnsure; markWrongRef.current = handleMarkUnsure; favoriteRef.current = () => { if (question) toggleFavorite(question.id) }; tooEasyRef.current = () => setTooEasyOpen(true); flagIssueRef.current = () => setFlagDialogOpen(true) })


  useEffect(() => {
    if (!tooEasyOpen) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || t.closest('.cm-editor'))) return
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); setTooEasyOpen(false); handleMarkTooEasy() }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setTooEasyOpen(false) }
      if (e.key === 'Escape') { e.preventDefault(); setTooEasyOpen(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tooEasyOpen])

  const { onTouchStart, onTouchMove, onTouchEnd, swipeOffset } = useSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  })

  return (
    <div className="space-y-3">
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction={isMobile ? 'bottom' : 'right'}>
          <DrawerContent className={isMobile ? '' : '!inset-y-0 !right-0 !left-auto !top-0 !mt-0 !h-full w-[400px] max-w-[85vw] !rounded-l-[10px] !rounded-t-none'}>
            <DrawerHeader>
              <DrawerTitle>刷题会话</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 scroll-fade overflow-y-auto p-4">
              {questionMode === 'sequential' && (
                <>
                  <div className="flex items-center justify-end mb-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSequentialDialogOpen(true); setDrawerOpen(false) }}><Plus className="h-3 w-3 mr-1" />新建</Button>
                  </div>
                  {seqSessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">暂无会话</p>
                  ) : (
                    <div className="space-y-1.5">
                      {seqSessions.map(s => {
                        const total = s.questionIds.length
                        const answered = sessionAnswered?.get(s.sessionKey)
                        const progress = answered != null && total > 0 ? Math.min(Math.round((answered / total) * 100), 100) : 0
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
                              <span
                                className="text-[10px] text-muted-foreground tabular-nums"
                                title={answered != null
                                  ? `本轮已作答 ${answered}/${total} 题 · 上次刷到第 ${s.currentIndex} 题`
                                  : `上次刷到第 ${s.currentIndex}/${total} 题`}
                              >
                                {answered != null ? `${answered}/${total}` : `统计中…`}
                              </span>
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

      <Drawer open={tocOpen} onOpenChange={setTocOpen} direction={isMobile ? 'bottom' : 'right'}>
          <DrawerContent className={isMobile ? 'h-[66vh] max-h-[66vh]' : '!inset-y-0 !right-0 !left-auto !top-0 !mt-0 !h-full w-[360px] max-w-[85vw] !rounded-l-[10px] !rounded-t-none'}>
            <DrawerHeader>
              <DrawerTitle>知识点目录</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 min-h-0 scroll-fade overflow-y-auto p-4">
              {questionMode === 'sequential' && seqActive && seqQuestionIds.length > 0 ? (
                <SequentialKpNav
                  userId={profile?.id ?? ''}
                  questionIds={seqQuestionIds}
                  questionKps={seqQuestionKps}
                  questionSubjects={seqQuestionSubjects}
                  currentIndex={seqIndex}
                  onJump={(index) => { loadSequentialQuestion(index); setTocOpen(false) }}
                  subjectResets={profile?.subject_reset_at ?? null}
                  planResetAt={profile?.plan_reset_at ?? null}
                  passStarts={passStarts}
                  subject={currentSubject}
                  selectedKps={seqSelectedKps}
                  onExcludedRestored={handleKpsRestored}
                  answeredThisSession={answeredSessionSnapshot}
                  sessionDist={sessionDistSnapshot}
                  showDist={distMode}
                  onShowDistChange={setDistMode}
                  onCurrentKpDist={setCurrentKpDist}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-2">暂无进行中的会话</p>
              )}
            </div>
          </DrawerContent>
        </Drawer>

      {planSubjectSet.size > 0 && (
        <KpSelectDialog open={sequentialDialogOpen} onOpenChange={setSequentialDialogOpen} kpBySubject={kpBySubject} planSubjects={[...planSubjectSet]} selectedKps={seqKps} onConfirm={handleKpConfirm} />
      )}
      <PlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        mode={questionMode === 'sequential' ? 'sequential' : questionScope === 'review' ? 'review' : 'random'}
        onModeChange={(m) => {
          setPlanDialogOpen(false)
          if (m === 'sequential') { switchMode('sequential'); return }
          switchMode('new')
          setQuestionScope(m === 'review' ? 'review' : 'all')
        }}
      />

      <AlertDialog open={blockSkipOpen} onOpenChange={setBlockSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>此题还未作答</AlertDialogTitle>
            <AlertDialogDescription>
              顺序作答需先完成当前题目，或选择"太简单"跳过、选择"不确定"标记后继续。想直接跳转？拖动顶部进度条或从知识点目录选择题目即可。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
            <AlertDialogCancel onClick={() => setBlockSkipOpen(false)}>继续作答</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setBlockSkipOpen(false); setTooEasyOpen(true) }} className="bg-muted text-foreground hover:bg-muted/80">太简单</AlertDialogAction>
            <AlertDialogAction onClick={() => { setBlockSkipOpen(false); handleMarkUnsure() }}>不确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>

      <AlertDialog open={tooEasyOpen} onOpenChange={setTooEasyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定跳过此题？</AlertDialogTitle>
            <AlertDialogDescription>标记为太简单后将不再出现此题。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消 (D)</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setTooEasyOpen(false); handleMarkTooEasy() }}>确定 (W)</AlertDialogAction>
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

      <AlertDialog open={resumePrompt !== null} onOpenChange={(o) => { if (!o) setResumePrompt(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发现之前的刷题进度</AlertDialogTitle>
            <AlertDialogDescription>是否保留之前的会话答题记录？保留则从上次进度继续，重新开始则从第一题开始。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { const rp = resumePrompt; setResumePrompt(null); if (rp) startNewSession(rp.kps, rp.subs, true) }}>重新开始</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const rp = resumePrompt; setResumePrompt(null); if (rp) startNewSession(rp.kps, rp.subs, false) }}>保留进度</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={excludedPrompt !== null} onOpenChange={(o) => { if (!o) setExcludedPrompt(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>部分题目已被排除</AlertDialogTitle>
            <AlertDialogDescription>所选知识点中有 {excludedPrompt?.count ?? 0} 道题目已被你排除，是否继续开始刷题？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExcludedPrompt(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const ep = excludedPrompt; setExcludedPrompt(null); if (ep) proceedAfterExcluded(ep.kps, ep.subs) }}>继续</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completionOpen} onOpenChange={setCompletionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本次会话已刷完</AlertDialogTitle>
            <AlertDialogDescription>
              当前会话所选知识点的题目已全部作答。题库若有新增/删除题目或知识点变动，可选择重新拉取（保留答题记录）；重置进度则从第一题重新开始。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCompletionOpen(false); switchMode('new'); seqReset(); fetchRandomQuestion() }}>去复习</AlertDialogCancel>
            <AlertDialogAction className="bg-muted text-foreground hover:bg-muted/80" onClick={() => setCompletionOpen(false)}>暂不</AlertDialogAction>
            <AlertDialogAction className="bg-muted text-foreground hover:bg-muted/80" onClick={handleCompletionRepull}>重新拉取题目（保留记录）</AlertDialogAction>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCompletionNewSession}>重置进度并重新开始</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={kpDonePrompt !== null} onOpenChange={(o) => { if (!o) setKpDonePrompt(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">「{kpDonePrompt?.kp ?? ''}」知识点已完成刷题</AlertDialogTitle>
            <AlertDialogDescription>该知识点的题目已全部作答，可查看解读巩固复习，或继续下一个知识点。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续下一知识点</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const p = kpDonePrompt; setKpDonePrompt(null); if (p) setKpExplainView(p) }}>查看知识点解读</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpExplanationDialog
        subject={kpExplainView?.subject ?? ''}
        kp={kpExplainView?.kp ?? ''}
        open={kpExplainView !== null}
        onOpenChange={(o) => { if (!o) setKpExplainView(null) }}
      />

      {/* 复习错题与收藏: 单独选学科 + 轮次(各轮时间窗), 按新范围再进练习 */}
      <Dialog open={reviewScopeOpen} onOpenChange={setReviewScopeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('practice.reviewScopeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">{t('practice.reviewScopeHint')}</p>
          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {roundsByPlanSubject.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-muted-foreground">{t('practice.reviewNoRounds')}</p>
            ) : roundsByPlanSubject.map(([subject, rounds]) => (
              <div key={subject} className="space-y-1 rounded-lg border p-2">
                <p className="text-[11px] font-medium">{subject}</p>
                <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                  <Checkbox
                    checked={reviewRounds.includes(`${subject}|all`)}
                    onCheckedChange={() => toggleReviewRound(`${subject}|all`)}
                  />
                  <span className="shrink-0">{t('practice.reviewAll')}</span>
                  <span className="text-muted-foreground">{t('practice.reviewAllHint')}</span>
                </label>
                {rounds.map((r) => {
                  const key = `${r.subject}|${r.round}`
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-2 pl-5 text-[11px]">
                      <Checkbox checked={reviewRounds.includes(key)} onCheckedChange={() => toggleReviewRound(key)} />
                      <span className="shrink-0">{t('plan.roundPrefix')}{r.round}{t('plan.roundsUnit')}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {r.createdAt.slice(5)} → {r.target.slice(5)}
                      </span>
                      {r.doneAt && <span className="text-emerald-600 dark:text-emerald-400">{t('plan.completedAt')} {r.doneAt.slice(5)}</span>}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
          <DialogFooter className="flex-row items-center gap-2">
            <span className="mr-auto text-[11px] text-muted-foreground">
              {t('practice.reviewPool')} <b className="text-foreground tabular-nums">{reviewPool ?? '—'}</b> {t('plan.questions')}
            </span>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setReviewScopeOpen(false)}>{t('plan.cancel')}</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={reviewWindows.length === 0}
              onClick={() => {
                setReviewScopeOpen(false)
                switchMode('new')
                setQuestionScope('review')
                setSelectedSubjects([...new Set(reviewWindows.map((w) => w.subject))])
                answeredThisSession.current.clear()
                setAnsweredSessionSnapshot(new Set())
              }}
            >
              {t('practice.startReview')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {questionMode !== 'sequential' && (
        <div className="flex flex-wrap gap-2">
          <FilterBtn label={({ all: '全部', favorites: '仅收藏', wrong: '仅错题', review: `${t('plan.modeReview')}${reviewPool != null ? ` ${reviewPool}` : ''}` } as Record<string, string>)[questionScope]}>
            <DropdownMenuItem onClick={() => { setQuestionScope('review'); setReviewScopeOpen(true) }}>
              {t('plan.modeReview')}{reviewPool != null && <span className="ml-1 text-muted-foreground tabular-nums">{reviewPool}</span>}
              {questionScope === 'review' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('all')}>全部{questionScope === 'all' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('favorites')}>仅收藏{questionScope === 'favorites' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuestionScope('wrong')}>仅错题{questionScope === 'wrong' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
          </FilterBtn>
          {questionScope === 'review' && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReviewScopeOpen(true)}>
              {t('practice.reviewReselect')}
              {reviewWindows.length > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{reviewWindows.length}</span>}
            </Button>
          )}
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
        </div>
      )}

      {planSubjectSet.size === 0 && (questionMode === 'sequential' || selectedSubjects.length === 0) && !isLoading ? (
        <div className="text-center py-12 space-y-4">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">尚未设置学习计划</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            设置学习计划后，系统将自动推荐对应科目的题目，并追踪每日进度。
          </p>
          <Button onClick={() => setPlanDialogOpen(true)}>去设置学习计划</Button>
        </div>
      ) : questionMode === 'sequential' && !seqActive && !isLoading && !sequentialDialogOpen ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">尚未选择知识点</p>
          <Button onClick={() => setSequentialDialogOpen(true)}>选择知识点开始刷题</Button>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-4 animate-pulse">
          {questionMode === 'sequential' ? (
            <>
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
              <div className="lg:flex lg:gap-4 lg:items-stretch">
                <div className="flex-1 min-w-0 space-y-4">
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
                <aside className="hidden lg:block w-72 shrink-0">
                  <div className="rounded-xl border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                      <Skeleton className="h-4 w-16 mt-2" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                  </div>
                </aside>
              </div>
            </>
          ) : (
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
          )}
        </div>
      ) : noQuestions && questionMode === 'sequential' ? (
        <div className="text-center py-12 space-y-4">
          <Check className="h-12 w-12 mx-auto text-green-500" />
          <p className="text-lg font-medium">{t('practice.sequentialDone')}</p>
          <p className="text-muted-foreground">{t('practice.sequentialDoneDesc')}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => { switchMode('new'); seqReset(); fetchRandomQuestion() }}>{t('practice.backToNormalMode')}</Button>
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
      ) : questionMode === 'sequential' && practiceUiVariant === 'new' && question && questionReady ? (
        <SequentialPracticeNewUi
          subjectName={currentSubject}
          subjectBlocks={subjectBlocks}
          onSwitchSubject={switchToSubject}
          relIndex={seqUi.relIndex}
          total={seqUi.total}
          accuracy={sessionAccuracy}
          onOpenSessions={() => setDrawerOpen(true)}
          question={question}
          selectedAnswer={selectedAnswer}
          isSubmitted={isSubmitted}
          attemptCount={attemptCount}
          wrongCount={wrongCount}
          note={note}
          isPublic={isPublic}
          onNoteChange={setNote}
          onPublicToggle={handlePublicToggle}
          onSelect={handleSelect}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
          onMarkTooEasy={handleMarkTooEasy}
          onMarkUnsure={handleMarkUnsure}
          onFlagIssue={() => setFlagDialogOpen(true)}
          isAdmin={isAdmin}
          onVerify={!question.verified ? async () => { await supabase.from('questions').update({ verified: true }).eq('id', question.id); setQuestion({ ...question, verified: true }) } : undefined}
          allowLocalJudge
          practiceShortcuts={practiceShortcuts}
          availableKpEntries={availableKpEntries}
          onShowKpExplain={(e) => setKpExplainView({ subject: e.subject, kp: e.kp })}
          justAnsweredId={justAnsweredId}
          answeredThisSession={answeredSessionSnapshot}
          onSkipToNextUnanswered={handleSkipToNextUnanswered}
          hasPrev={hasPrev}
          onPrev={handlePrev}
          onNext={handleNext}
          onSubmit={handleSubmit}
          isMobile={isMobile}
          kpInfo={seqUi.ki}
          qKp={seqUi.qKp}
          sessionProgress={sessionProgress}
          overallProgress={overallProgress}
          kpNav={{
            userId: profile?.id ?? '',
            questionIds: seqQuestionIds,
            questionKps: seqQuestionKps,
            questionSubjects: seqQuestionSubjects,
            currentIndex: seqIndex,
            onJump: loadSequentialQuestion,
            subjectResets: profile?.subject_reset_at ?? null,
            planResetAt: profile?.plan_reset_at ?? null,
            passStarts,
            subject: currentSubject,
            selectedKps: seqSelectedKps,
            onExcludedRestored: handleKpsRestored,
            answeredThisSession: answeredSessionSnapshot,
            sessionDist: sessionDistSnapshot,
            showDist: distMode,
            onShowDistChange: setDistMode,
            onCurrentKpDist: setCurrentKpDist,
          }}
        />
      ) : (
        <div className="lg:flex lg:gap-4 lg:items-stretch">
          <div className="flex-1 min-w-0 space-y-4">
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
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('h-7 w-7 shrink-0', kpSeekMode && 'bg-accent text-accent-foreground')}
                      onClick={() => setKpSeekMode((v) => !v)}
                      title={kpSeekMode ? '关闭拖动进度条切换题目' : '开启拖动进度条切换题目'}
                    >
                      <MoveHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={t('focus.title')}>
                          <Timer className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={6} className="w-80 p-3">
                        <FocusTimer />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('h-7 w-7 shrink-0', !isMobile && tocVisible && 'bg-accent text-accent-foreground')}
                      onClick={() => { if (isMobile) setTocOpen(true); else setTocVisible(v => !v) }}
                      title={isMobile ? '知识点目录' : tocVisible ? '隐藏目录' : '显示目录'}
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDrawerOpen(true)} title="筛选条件">
                      <Filter className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              <SequentialProgressBar currentIndex={seqUi.relIndex} total={seqUi.total} kpCurrent={seqUi.ki.kpCurrent || 0} kpTotal={seqUi.ki.kpTotal || 0} kpName={seqUi.ki.kpName || seqUi.qKp || null} deviceIcon={seqUi.devIcon} deviceName={seqUi.devName} syncText={seqUi.syncStr} syncStatus={seqSyncStatus} seekable={kpSeekMode} onSeekKp={handleSeekKp} distMode={distMode} dist={currentKpDist} done={sessionProgress.done} doneTotal={sessionProgress.total} />
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
              <div className="space-y-4">
                  <div className="touch-pan-y select-none" style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                    <QuestionCard key={question.id} question={question} selectedAnswer={selectedAnswer} showResult={isSubmitted} onSelect={handleSelect} disabled={isSubmitted} showEditLink={isAdmin} allowLocalJudge attemptCount={attemptCount} wrongCount={wrongCount} note={note} isFavorited={question ? isFavorite(question.id) : false} onToggleFavorite={question ? () => toggleFavorite(question.id) : undefined} onMarkTooEasy={question && !isSubmitted ? handleMarkTooEasy : undefined} onMarkUnsure={question && !isSubmitted ? handleMarkUnsure : undefined} onFlagIssue={isAdmin ? () => setFlagDialogOpen(true) : undefined} unsureKbd={!isMobile ? keyToDisplay(practiceShortcuts.markUnsure) : undefined} favoriteKbd={!isMobile ? keyToDisplay(practiceShortcuts.favorite) : undefined} tooEasyKbd={!isMobile ? keyToDisplay(practiceShortcuts.tooEasy) : undefined} flagIssueKbd={!isMobile ? keyToDisplay(practiceShortcuts.flagIssue) : undefined} onVerify={question && !question.verified ? async () => { await supabase.from('questions').update({ verified: true }).eq('id', question.id); setQuestion({ ...question, verified: true }) } : undefined} />
                  </div>
                  {availableKpEntries.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium">知识点解读</span>
                      <span className="text-[11px] text-muted-foreground">本题涉及的知识点，可点击查看解读</span>
                      {availableKpEntries.map((e) => (
                        <button
                          key={kpExplanationKey(e.subject, e.kp)}
                          type="button"
                          onClick={() => setKpExplainView({ subject: e.subject, kp: e.kp })}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/20"
                        >
                          {e.kp}
                        </button>
                      ))}
                    </div>
                  )}
                  <QuestionSources question={question} selectedAnswer={selectedAnswer} />
                  {questionMode === 'sequential' && answeredSessionSnapshot.has(question.id) && justAnsweredId !== question.id && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
                      <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">本题此次会话已作答过</span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSkipToNextUnanswered}>跳到下一未做题</Button>
                    </div>
                  )}
                  {isSubmitted && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
                      <NoteEditor placeholder={t('practice.notePlaceholder')} value={note} onChange={setNote} />
                      <div className="flex items-center justify-between"><div><p className="text-sm">{t('notes.makePublic')}</p><p className="text-xs text-muted-foreground">{isPublic ? t('notes.publicLabel') : t('notes.privateLabel')}</p></div><Checkbox checked={isPublic} onCheckedChange={(v) => handlePublicToggle(v === true)} /></div>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={handlePrev} disabled={!hasPrev}>
                      {t('practice.previousQuestion')}{" "}
                      {!isMobile && <ShortcutKbd shortcut={practiceShortcuts.prev} />}
                    </Button>
                    {!isSubmitted ? (
                      <>
                        {questionMode === 'sequential' && answeredSessionSnapshot.has(question.id) && (
                          <Button onClick={handleNext}>
                            {t('practice.nextQuestion')}{" "}
                            {!isMobile && <ShortcutKbd shortcut={practiceShortcuts.next} />}
                          </Button>
                        )}
                        <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                          {t('practice.submitAnswer')}{" "}
                          {!isMobile && <ShortcutKbd shortcut={practiceShortcuts.submit} />}
                        </Button>
                      </>
                    ) : (
                      <Button onClick={handleNext}>
                        {t('practice.nextQuestion')}{" "}
                        {!isMobile && <ShortcutKbd shortcut={practiceShortcuts.next} />}
                      </Button>
                    )}
                  </div>
                </div>
            </>
          ) : null}
          </div>
          {questionMode === 'sequential' && seqActive && seqQuestionIds.length > 0 && tocVisible && (
            <aside className="hidden lg:block w-72 shrink-0">
              <div className="lg:sticky lg:top-20 lg:h-full lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
                <SequentialKpNav
                  userId={profile?.id ?? ''}
                  questionIds={seqQuestionIds}
                  questionKps={seqQuestionKps}
                  questionSubjects={seqQuestionSubjects}
                  currentIndex={seqIndex}
                  onJump={loadSequentialQuestion}
                  subjectResets={profile?.subject_reset_at ?? null}
                  planResetAt={profile?.plan_reset_at ?? null}
                  passStarts={passStarts}
                  subject={currentSubject}
                  selectedKps={seqSelectedKps}
                  onExcludedRestored={handleKpsRestored}
                  answeredThisSession={answeredSessionSnapshot}
                  sessionDist={sessionDistSnapshot}
                  showDist={distMode}
                  onShowDistChange={setDistMode}
                  onCurrentKpDist={setCurrentKpDist}
                />
              </div>
            </aside>
          )}
        </div>
      )}
      <FlagIssueDialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen} question={question} onSave={handleSaveIssue} />
    </div>
  )
}

