import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardStore } from '@/stores/dashboard-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useSequentialStore, sameSubjects } from '@/stores/sequential-store'


import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, ChevronDown, HelpCircle, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { PlanGoal, PlanRound } from '@/types'
import { resolveGoals, resolveRounds, newRoundId, addDays, toDateStr, todayStr } from '@/types'
import {
  buildGoalItems, buildRoundItems, dailyPace, fetchPlanStats, goalPlanSpec, roundPlanSpec, subjectPaces,
  type PlanStat,
} from '@/hooks/use-plan-completion'
import { PlanGanttChart, CUSTOM_PINK, PLAN_BLUE } from './PlanGanttChart'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'sequential' | 'random' | 'review'
  onModeChange?: (mode: 'sequential' | 'random' | 'review') => void
}

export function PlanDialog({ open, onOpenChange, mode = 'sequential', onModeChange }: Props) {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()

  const savedSubjects = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
  const savedRounds = resolveRounds(profile)
  const savedGoals = resolveGoals(profile)

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(savedSubjects)
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [goals, setGoals] = useState<PlanGoal[]>(savedGoals)
  const [rounds, setRounds] = useState<PlanRound[]>(savedRounds)
  const [roundStats, setRoundStats] = useState<Map<string, PlanStat>>(new Map())
  const [goalStats, setGoalStats] = useState<Map<string, PlanStat>>(new Map())
  const [roundError, setRoundError] = useState('')
  const [goalError, setGoalError] = useState('')
  const [saving, setSaving] = useState(false)
  const [planTab, setPlanTab] = useState<'long-term' | 'daily'>('long-term')

  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Map<string, number>>(new Map())
  const [subjectProgress, setSubjectProgress] = useState<Map<string, { total: number; done: number; missing_kp: number }>>(new Map())
  const [planLoading, setPlanLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetTooEasy, setResetTooEasy] = useState(false)
  const [askLoadNewSession, setAskLoadNewSession] = useState(false)
  const ltDropdownRef = useRef<HTMLButtonElement>(null)

  // "还剩几天"每分钟跟着走, 也避免在渲染里直接取当前时间
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Mutual exclusion: subjects in long-term plan can't be in custom plan and vice versa
  const goalSubjects = [...new Set(goals.map((g) => g.subject))]
  const longUsedSubjects = new Set(selectedSubjects)

  const { fetchPlanCache } = useDashboardStore()
  const refreshVersion = useRefreshStore((s) => s.version)

  useEffect(() => {
    if (!open || !user) return
    const cache = useDashboardStore.getState().getPlanCache()
    if (cache && cache.refreshVersion === refreshVersion) {
      const counts = new Map<string, number>()
      for (const [s, p] of Object.entries(cache.subjectProgress)) counts.set(s, p.total)
      setAllSubjects(cache.allSubjects)
      setSubjectCounts(counts)
      setSubjectProgress(new Map(Object.entries(cache.subjectProgress)))
      return
    }
    setPlanLoading(true)
    fetchPlanCache(user.id, refreshVersion, profile?.plan_reset_at ?? null).then((cache) => {
      const counts = new Map<string, number>()
      for (const [s, p] of Object.entries(cache.subjectProgress)) counts.set(s, p.total)
      setAllSubjects(cache.allSubjects)
      setSubjectCounts(counts)
      setSubjectProgress(new Map(Object.entries(cache.subjectProgress)))
      setPlanLoading(false)
    })
  }, [open, user, fetchPlanCache, refreshVersion, profile?.plan_reset_at])

  useEffect(() => {
    const s = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
    setSelectedSubjects(s)
    setGoals(resolveGoals(profile))
    setRounds(resolveRounds(profile))
    setDeadline(profile?.deadline ?? '')
  }, [profile])

  // 轮次 / 批次的实际完成情况只在打开弹窗时拉一次, 用于回显"刷完了没 / 这批刷了多少"
  useEffect(() => {
    if (!open || !user) return
    const savedRounds = resolveRounds(profile)
    const savedGoals = resolveGoals(profile)
    let cancelled = false
    void Promise.all([
      savedRounds.length > 0 ? fetchPlanStats(user.id, roundPlanSpec(savedRounds)) : Promise.resolve(null),
      savedGoals.length > 0 ? fetchPlanStats(user.id, goalPlanSpec(savedGoals)) : Promise.resolve(null),
    ]).then(([r, g]) => {
      if (cancelled) return
      setRoundStats(r ?? new Map())
      setGoalStats(g ?? new Map())
    })
    return () => { cancelled = true }
  }, [open, user, profile])

  const totalSelected = selectedSubjects.reduce((sum, s) => sum + (subjectCounts.get(s) ?? 0), 0)
  const totalDone = selectedSubjects.reduce((sum, s) => sum + (subjectProgress.get(s)?.done ?? 0), 0)
  const remaining = Math.max(totalSelected - totalDone, 0)

  // 编辑态实时预览: 用已保存记录的实际完成情况 + 当前编辑的目标日/题数
  const previewRounds = buildRoundItems(rounds.filter((r) => !!r.target), roundStats)
  const previewRoundById = new Map(previewRounds.map((r) => [r.id, r]))
  const previewGoals = buildGoalItems(goals.filter((g) => !!g.target), goalStats)
  const goalPreviewById = new Map(previewGoals.map((g) => [g.id, g]))
  const roundsBySubject = new Map<string, PlanRound[]>()
  for (const r of rounds) {
    const list = roundsBySubject.get(r.subject)
    if (list) list.push(r)
    else roundsBySubject.set(r.subject, [r])
  }
  for (const list of roundsBySubject.values()) list.sort((a, b) => a.round - b.round)
  const goalsBySubject = new Map<string, PlanGoal[]>()
  for (const g of goals) {
    const list = goalsBySubject.get(g.subject)
    if (list) list.push(g)
    else goalsBySubject.set(g.subject, [g])
  }
  for (const list of goalsBySubject.values()) list.sort((a, b) => a.target.localeCompare(b.target))
  const previewDaysLeft = deadline
    ? Math.max(Math.ceil((new Date(deadline + 'T23:59:59').getTime() - nowMs) / 86400000), 1)
    : 0

  // 每天题数按排期算: 有轮次的学科看最紧的那一轮, 没排轮次的学科按剩余 ÷ 计划剩余天数
  const previewPaces = subjectPaces(previewRounds, nowMs)
  const previewPaceBySubject = new Map(previewPaces.map((p) => [p.subject, p]))
  const previewUnscheduled = selectedSubjects
    .filter((s) => !previewPaceBySubject.has(s))
    .reduce((sum, s) => sum + Math.max((subjectCounts.get(s) ?? 0) - (subjectProgress.get(s)?.done ?? 0), 0), 0)
  const previewPace = dailyPace(previewRounds, previewUnscheduled, deadline || null, nowMs)

  const toggleSubject = (s: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  // ==== 自定义计划的批次 ====
  /** 新一批的题数默认值 = 这科还没刷过的题数 */
  const suggestBatchCount = (subject: string): number => {
    const p = subjectProgress.get(subject)
    const rest = (p?.total ?? 0) - (p?.done ?? 0)
    return rest > 0 ? rest : 20
  }

  /** 选中学科即给它排第一批: 题数默认 = 这科还没刷过的题数, 目标日默认一周后 */
  const toggleGoalSubject = (subject: string) => {
    setGoalError('')
    setGoals((prev) => {
      if (prev.some((g) => g.subject === subject)) return prev.filter((g) => g.subject !== subject)
      return [...prev, {
        id: newRoundId(),
        subject,
        count: suggestBatchCount(subject),
        target: addDays(todayStr(), 7),
        createdAt: todayStr(),
        doneAt: null,
      }]
    })
  }

  const addGoal = (subject: string) => {
    setGoalError('')
    const list = goalsBySubject.get(subject) ?? []
    const last = list[list.length - 1]
    setGoals((prev) => [...prev, {
      id: newRoundId(),
      subject,
      count: last?.count ?? suggestBatchCount(subject),
      target: addDays(last?.target && last.target > todayStr() ? last.target : todayStr(), 7),
      createdAt: todayStr(),
      doneAt: null,
    }])
  }

  const removeGoal = (id: string) => {
    setGoalError('')
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }

  const updateGoalCount = (id: string, count: number) => {
    setGoalError('')
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, count } : g)))
  }

  const updateGoalTarget = (id: string, target: string) => {
    setGoalError('')
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, target } : g)))
  }

  /** 校验: 每批都要有题数和目标日, 同学科按目标日递增 */
  const validateGoals = (list: PlanGoal[]): string => {
    if (list.some((g) => !g.target || g.count < 1)) return t('plan.goalNeedCount')
    const bySubject = new Map<string, PlanGoal[]>()
    for (const g of list) {
      const arr = bySubject.get(g.subject)
      if (arr) arr.push(g)
      else bySubject.set(g.subject, [g])
    }
    for (const arr of bySubject.values()) {
      const sorted = [...arr].sort((a, b) => a.target.localeCompare(b.target))
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].target === sorted[i - 1].target) return t('plan.roundNotIncreasing')
      }
    }
    return ''
  }

  // ==== 轮次 ====
  /** 新加一轮的默认目标日: 排在上一轮之后一周, 且不超过长期计划的最后一天 */
  const suggestTarget = (subject: string): string => {
    const list = roundsBySubject.get(subject) ?? []
    const last = list[list.length - 1]
    const base = last?.target && last.target > todayStr() ? last.target : todayStr()
    const d = new Date(`${base}T00:00:00`)
    d.setDate(d.getDate() + 7)
    let next = toDateStr(d)
    if (deadline && next > deadline) next = deadline
    if (next < todayStr()) next = todayStr()
    return next
  }

  const addRound = (subject: string) => {
    setRoundError('')
    const list = roundsBySubject.get(subject) ?? []
    setRounds((prev) => [...prev, {
      id: newRoundId(),
      subject,
      round: (list[list.length - 1]?.round ?? 0) + 1,
      target: suggestTarget(subject),
      createdAt: todayStr(),
      doneAt: null,
    }])
  }

  const removeRound = (id: string) => {
    setRoundError('')
    setRounds((prev) => prev.filter((r) => r.id !== id))
  }

  const updateRoundTarget = (id: string, target: string) => {
    setRoundError('')
    setRounds((prev) => prev.map((r) => (r.id === id ? { ...r, target } : r)))
  }

  /** 校验: 每轮都要有目标日, 不超过长期计划最后一天, 同学科按轮次递增 */
  const validateRounds = (list: PlanRound[]): string => {
    if (list.some((r) => !r.target)) return t('plan.roundNeedDate')
    if (deadline && list.some((r) => r.target > deadline)) return t('plan.roundAfterDeadline')
    const bySubject = new Map<string, PlanRound[]>()
    for (const r of list) {
      const arr = bySubject.get(r.subject)
      if (arr) arr.push(r)
      else bySubject.set(r.subject, [r])
    }
    for (const arr of bySubject.values()) {
      const sorted = [...arr].sort((a, b) => a.round - b.round)
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].target <= sorted[i - 1].target) return t('plan.roundNotIncreasing')
      }
    }
    return ''
  }

  const handleResetLong = async () => {
    if (!user) return
    setSaving(true)
    const now = new Date().toISOString()
    // Only reset the selected subjects
    const resetEntries: Record<string, string> = {}
    for (const s of selectedSubjects) resetEntries[s] = now
    const { data: existing } = await supabase.from('profiles').select('subject_reset_at').eq('id', user.id).single()
    const existingResets = (existing?.subject_reset_at ?? {}) as Record<string, string>
    const merged = { ...existingResets, ...resetEntries }
    await supabase.from('profiles').update({ subject_reset_at: merged }).eq('id', user.id)
    if (resetTooEasy && selectedSubjects.length > 0) {
      const { data: qids } = await supabase.from('questions').select('id').in('subject', selectedSubjects)
      if (qids && qids.length > 0) {
        await supabase.from('user_excluded_questions').delete().eq('user_id', user.id).in('question_id', qids.map(q => q.id))
      }
    }
    await refreshProfile()
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    setSaving(false)
    setAskLoadNewSession(true)
  }

  const loadNewSessionNow = async () => {
    setAskLoadNewSession(false)
    if (!user) return
    const s = useSequentialStore.getState()
    if (!s.isActive || !s.sessionKey) return
    const savedSps = { ...s.subjectPositions }
    await s.startSequential(user.id, s.selectedKps, [], '')
    useSequentialStore.setState({ currentIndex: 0, subjectPositions: savedSps })
  }

  const reloadSessionNow = async () => {
    setAskLoadNewSession(false)
    if (!user) return
    const s = useSequentialStore.getState()
    if (!s.isActive || !s.sessionKey) return
    const savedSps = { ...s.subjectPositions }
    await s.startSequential(user.id, s.selectedKps, [], '')
    useSequentialStore.setState({ subjectPositions: savedSps })
  }

  const handleDeleteLong = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ deadline: null, plan_subjects: null, plan_rounds: null }).eq('id', user.id)
    await refreshProfile()
    setDeadline('')
    setSelectedSubjects([])
    setRounds([])
    setRoundStats(new Map())
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    window.dispatchEvent(new Event('plan-progress-refresh'))
    setSaving(false)
  }

  const handleSave = async () => {
    if (!user) return
    // 轮次挂在长期计划的学科上: 学科被移出计划, 它的轮次也一并丢掉
    const sortedRounds = rounds
      .filter((r) => selectedSubjects.includes(r.subject))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.round - b.round)
    const roundErr = validateRounds(sortedRounds)
    if (roundErr) {
      setRoundError(roundErr)
      setPlanTab('long-term')
      return
    }
    const sortedGoals = [...goals].sort((a, b) =>
      a.subject.localeCompare(b.subject, 'zh-CN') || a.target.localeCompare(b.target))
    const goalErr = validateGoals(sortedGoals)
    if (goalErr) {
      setGoalError(goalErr)
      setPlanTab('daily')
      return
    }
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        deadline: deadline || null,
        plan_subjects: selectedSubjects.length > 0 ? JSON.stringify(selectedSubjects) : null,
        plan_rounds: sortedRounds.length > 0 ? sortedRounds : null,
        plan_goals: sortedGoals.length > 0 ? sortedGoals : null,
      })
      .eq('id', user.id)
    await refreshProfile()

    // 学科的"计划范围" = 长期计划学科 ∪ 自定义计划的学科。注意别拿会话自己的 planSubjects 比:
    // 用户可能只挑了部分学科的知识点, 会话范围本来就可以是计划范围的子集。
    const oldPlanSubs = [...new Set([...savedSubjects, ...savedGoals.map((g) => g.subject)])]
    const newPlanSubs = [...new Set([...selectedSubjects, ...sortedGoals.map((g) => g.subject)])]
    // 范围没变(只改了轮次/批次/目标日)时, 正在刷的会话照样有效: 留着它, 用户接着往下刷, 不用重选知识点;
    // 范围变了才把旧会话存进历史并清掉, 由练习页按新范围重新认领会话
    const activeSession = useSequentialStore.getState()
    if (activeSession.isActive && activeSession.sessionKey) {
      await activeSession.saveToDb(user.id)
      if (!sameSubjects(oldPlanSubs, newPlanSubs)) activeSession.reset()
    }

    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl mx-4 sm:mx-auto">
        <DialogHeader className="sm:text-center">
          <DialogTitle>{t('plan.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[58vh] gap-4 overflow-y-auto overflow-x-hidden pr-1 lg:grid-cols-2">
          {/* 左: 设置 */}
          <div className="min-w-0 space-y-3">
          <div className="inline-flex rounded-lg bg-muted p-0.5 w-full">
            {(['long-term', 'daily'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPlanTab(v)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  planTab === v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'long-term' ? t('plan.longTerm') : t('plan.dailyTarget')}
              </button>
            ))}
          </div>

          {planTab === 'long-term' && (
          <>
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {t('plan.longTerm')}
              <HoverCard openDelay={500}>
                <HoverCardTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="text-xs w-56">
                  {t('plan.desc')}
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              {/* Subject selection + action buttons */}
              <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button ref={ltDropdownRef} variant="outline" size="sm" className="flex-1 justify-between text-xs font-normal h-8">
                    <span className={selectedSubjects.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                      {selectedSubjects.length === 0
                        ? t('plan.selectHint')
                        : selectedSubjects.map((s) => `${s} (${subjectCounts.get(s) ?? 0})`).join(', ')}
                    </span>
                    <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setSelectedSubjects([]) }}
                    className="text-muted-foreground text-xs"
                  >
                    {t('plan.selectHint')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {allSubjects.map((s) => {
                    const checked = selectedSubjects.includes(s)
                    const disabledByGoal = goalSubjects.includes(s) && !checked
                    return (
                      <DropdownMenuItem
                        key={s}
                        disabled={disabledByGoal}
                        onSelect={(e) => { e.preventDefault(); toggleSubject(s) }}
                        className={`text-xs ${disabledByGoal ? 'opacity-40' : ''}`}
                      >
                        <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                        <span>{s}</span>
                        <span className="ml-auto text-muted-foreground">{disabledByGoal ? t('plan.usedByDaily') : subjectCounts.get(s) ?? 0}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>

              {/* Deadline */}
              <DateTimePicker
                date={deadline ? new Date(deadline + 'T00:00:00') : undefined}
                onSelect={(d) => setDeadline(d ? toDateStr(d) : '')}
                placeholder={t('plan.pickDate')}
              />

              {planLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  ))}
                </div>
              ) : selectedSubjects.length > 0 && (
                <div className="space-y-1.5">
                  {selectedSubjects.map((s) => {
                    const p = subjectProgress.get(s)
                    const total = p?.total ?? 0
                    const done = p?.done ?? 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    const mk = p?.missing_kp ?? 0
                    return (
                      <div key={s} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground truncate max-w-[60%]">{s}</span>
                          <span className="tabular-nums">{done}/{total}{mk > 0 && <Link to={`/admin/questions?subject=${encodeURIComponent(s)}&kp=__none__`} className="ml-1.5 text-amber-500 hover:text-amber-600 underline">{mk}题缺知识点</Link>}</span>
                        </div>
                        <Progress value={pct} className="h-1.5 [&>div]:bg-blue-500" />
                      </div>
                    )
                  })}
                  {deadline && (
                    <p className="text-[11px] pt-1">
                      <span className="text-muted-foreground">{t('plan.dailyGoal')}: </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{previewPace} {t('plan.perDay')}</span>
                      <span className="text-muted-foreground ml-2">{t('plan.doneCount')}: {totalDone}/{totalSelected}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-1.5 pt-1">
                <Button variant="outline" size="sm" className="text-destructive text-xs h-7" onClick={() => setConfirmReset(true)} disabled={saving}>
                  {saving ? '...' : '重置进度'}
                </Button>
                <Button variant="outline" size="sm" className="text-destructive text-xs h-7" onClick={handleDeleteLong} disabled={saving}>
                  <X className="h-3 w-3 mr-1" />删除计划
                </Button>
              </div>
            </div>

            {/* Add button — outside box */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => ltDropdownRef.current?.click()} className="text-xs h-7">
                <Plus className="h-3 w-3" />
                {t('plan.addSubject')}
              </Button>
            </div>

            {/* 轮次 — 每个学科一条自己的时间线: 目标完成日由你定, 旗子插在实际刷完的那天 */}
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center">
              {t('plan.rounds')}
              <HoverCard openDelay={500}>
                <HoverCardTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="text-xs w-64">
                  {t('plan.roundDesc')}
                </HoverCardContent>
              </HoverCard>
            </div>


            <div className="space-y-1.5">
              {selectedSubjects.length === 0 ? (
                <p className="rounded-lg border p-3 text-[11px] text-muted-foreground">{t('plan.roundPickSubjectFirst')}</p>
              ) : selectedSubjects.map((subject) => {
                const list = roundsBySubject.get(subject) ?? []
                return (
                  <div key={subject} className="space-y-1 rounded-lg border p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{subject}</span>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => addRound(subject)} disabled={saving}>
                        <Plus className="h-3 w-3" />
                        {t('plan.addRound')}
                      </Button>
                    </div>
                    {list.length === 0 && (
                      <p className="pl-1 text-[11px] text-muted-foreground">{t('plan.noRoundHint')}</p>
                    )}
                    {list.map((r) => {
                      const p = previewRoundById.get(r.id)
                      const doneAt = p?.doneAt ?? null
                      const daysLeft = r.target
                        ? Math.max(Math.ceil((new Date(`${r.target}T23:59:59`).getTime() - nowMs) / 86400000), 0)
                        : null
                      return (
                        <div key={r.id} className="flex flex-wrap items-center gap-1.5 pl-1">
                          <span className="grid h-6 shrink-0 place-items-center rounded-md bg-blue-500/10 px-1.5 text-[10px] font-medium tabular-nums text-blue-600 dark:text-blue-400">
                            {t('plan.roundPrefix')}{r.round}{t('plan.roundsUnit')}
                          </span>
                          {doneAt ? (
                            <span className="shrink-0 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                              {doneAt} {t('plan.roundDone')}
                            </span>
                          ) : (
                            <DatePicker
                              date={r.target ? new Date(`${r.target}T00:00:00`) : undefined}
                              onSelect={(d) => updateRoundTarget(r.id, d ? toDateStr(d) : '')}
                              placeholder={t('plan.roundTarget')}
                              className="w-auto min-w-[112px] h-7 text-[11px] px-2"
                            />
                          )}
                          {!doneAt && daysLeft !== null && (
                            <span className={cn('shrink-0 text-[10px] tabular-nums', daysLeft === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                              {daysLeft > 0 ? `${t('plan.remaining')} ${daysLeft} ${t('plan.daysUnit')}` : t('plan.deadlinePassed')}
                            </span>
                          )}
                          {!doneAt && (p?.quantity ?? 0) > 0 && p?.state === 'current' && (
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {p?.done}/{p?.quantity}{t('plan.questions')}
                            </span>
                          )}
                          <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 shrink-0 p-0 text-destructive" onClick={() => removeRound(r.id)} disabled={saving}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {roundError && <p className="text-[11px] text-destructive">{roundError}</p>}
            </div>
          </>
          )}

          {planTab === 'daily' && (
          <div className="space-y-3">
            {planLoading ? (
              <div className="border rounded-lg p-3 space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Skeleton className="h-8 flex-1" />
                      <Skeleton className="h-7 w-7" />
                    </div>
                    <Skeleton className="h-8 w-full" />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* 学科: 选中即建第一批, 之后每批自己定题数与目标完成日 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
                      <span className={goalSubjects.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                        {goalSubjects.length === 0
                          ? t('plan.selectHint')
                          : goalSubjects.map((s) => `${s} (${subjectCounts.get(s) ?? 0})`).join(', ')}
                      </span>
                      <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
                    {allSubjects.map((s) => {
                      const checked = goalSubjects.includes(s)
                      const disabledByLong = longUsedSubjects.has(s) && !checked
                      return (
                        <DropdownMenuItem
                          key={s}
                          disabled={disabledByLong}
                          onSelect={(e) => { e.preventDefault(); toggleGoalSubject(s) }}
                          className={`text-xs ${disabledByLong ? 'opacity-40' : ''}`}
                        >
                          <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                          <span>{s}</span>
                          <span className="ml-auto text-muted-foreground">{disabledByLong ? t('plan.usedByLong') : subjectCounts.get(s) ?? 0}</span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {goalSubjects.map((subject) => {
                  const list = goalsBySubject.get(subject) ?? []
                  const p = subjectProgress.get(subject)
                  const total = p?.total ?? 0
                  const done = p?.done ?? 0
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <div key={subject} className="space-y-1 rounded-lg border p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{subject}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{done}/{total}</span>
                        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => addGoal(subject)} disabled={saving}>
                          <Plus className="h-3 w-3" />
                          {t('plan.addBatch')}
                        </Button>
                      </div>
                      <Progress value={pct} className="h-1 [&>div]:bg-pink-500" />
                      {list.map((g) => {
                        const item = goalPreviewById.get(g.id)
                        const doneAt = item?.doneAt ?? null
                        const daysLeft = g.target
                          ? Math.max(Math.ceil((new Date(`${g.target}T23:59:59`).getTime() - nowMs) / 86400000), 0)
                          : null
                        return (
                          <div key={g.id} className="flex flex-wrap items-center gap-1.5 pl-1">
                            <span className="grid h-6 shrink-0 place-items-center rounded-md bg-pink-500/10 px-1.5 text-[10px] font-medium tabular-nums text-pink-600 dark:text-pink-400">
                              {t('plan.roundPrefix')}{item?.index ?? ''}{t('plan.batchesUnit')}
                            </span>
                            <Input
                              type="number"
                              min={1}
                              value={g.count}
                              disabled={!!doneAt}
                              onChange={(e) => updateGoalCount(g.id, Math.max(1, Number(e.target.value) || 1))}
                              className="h-7 w-16 px-1 text-center text-[11px]"
                            />
                            <span className="shrink-0 text-[11px] text-muted-foreground">{t('plan.questions')}</span>
                            {doneAt ? (
                              <span className="shrink-0 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                                {doneAt} {t('plan.roundDone')}
                              </span>
                            ) : (
                              <DatePicker
                                date={g.target ? new Date(`${g.target}T00:00:00`) : undefined}
                                onSelect={(d) => updateGoalTarget(g.id, d ? toDateStr(d) : '')}
                                placeholder={t('plan.roundTarget')}
                                className="w-auto min-w-[112px] h-7 text-[11px] px-2"
                              />
                            )}
                            {!doneAt && daysLeft !== null && (
                              <span className={cn('shrink-0 text-[10px] tabular-nums', daysLeft === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                                {daysLeft > 0 ? `${t('plan.remaining')} ${daysLeft} ${t('plan.daysUnit')}` : t('plan.deadlinePassed')}
                              </span>
                            )}
                            {!doneAt && (item?.quantity ?? 0) > 0 && item?.state === 'current' && (
                              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                {item?.done}/{item?.quantity}{t('plan.questions')}
                              </span>
                            )}
                            {/* 这一批"每天要刷多少"是算出来的: 剩余题数 ÷ 到目标日的天数 */}
                            {!doneAt && daysLeft !== null && daysLeft > 0 && (
                              <span className="shrink-0 text-[10px] tabular-nums text-pink-600 dark:text-pink-400">
                                ≈ {Math.ceil(Math.max(g.count - (item?.done ?? 0), 0) / daysLeft)} {t('plan.perDay')}
                              </span>
                            )}
                            <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 shrink-0 p-0 text-destructive" onClick={() => removeGoal(g.id)} disabled={saving}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )
                      })}
                      {list.length === 0 && <p className="pl-1 text-[11px] text-muted-foreground">{t('plan.noBatchHint')}</p>}
                    </div>
                  )
                })}

                {goalSubjects.length === 0 && (
                  <div className="border rounded-lg p-6 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">{t('plan.selectHint')}</p>
                    <p className="text-xs text-muted-foreground">{t('plan.noCustomHint')}</p>
                  </div>
                )}

                {goalError && <p className="text-[11px] text-destructive">{goalError}</p>}
              </>
            )}
          </div>
          )}

          </div>

          {/* 右: 实时预览 */}
          <div className="min-w-0 space-y-3 lg:border-l lg:pl-4">
            <div className="text-sm font-semibold">{t('plan.preview')}</div>

            {planTab === 'long-term' ? (
              <>
                <div className="space-y-1 rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-[11px] text-muted-foreground">{t('plan.schedulePreview')}</p>
                  {selectedSubjects.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t('plan.pickDate')}</p>
                  ) : (
                    <>
                      <p className="text-[12px] tabular-nums">
                        {t('plan.bySchedule')} {t('plan.aboutPerDay')}
                        {' '}
                        <b className="text-blue-600 dark:text-blue-400">{previewPace}</b> {t('plan.perDay')}
                        <span className="text-muted-foreground">
                          {' · '}{t('plan.remaining')} <b className="font-semibold text-foreground">{remaining}</b> {t('plan.questions')}
                          {previewDaysLeft > 0 && <> ÷ {previewDaysLeft} {t('plan.daysUnit')}</>}
                        </span>
                      </p>
                      <ul className="space-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                        {selectedSubjects.map((s) => {
                          const pace = previewPaceBySubject.get(s)
                          const p = subjectProgress.get(s)
                          const rem = Math.max((p?.total ?? 0) - (p?.done ?? 0), 0)
                          return (
                            <li key={s} className="flex justify-between gap-2">
                              <span className="truncate">{s}</span>
                              <span className="shrink-0 tabular-nums">
                                {pace
                                  ? <>{t('plan.roundPrefix')}{pace.index}{t('plan.roundsUnit')} · {t('plan.remaining')} {pace.remaining} {t('plan.questions')} ÷ {pace.days} {t('plan.daysUnit')} ≈ {pace.perDay} {t('plan.perDay')}</>
                                  : <>{t('plan.remaining')} {rem}{previewDaysLeft > 0 ? <> ÷ {previewDaysLeft} {t('plan.daysUnit')} ≈ {Math.ceil(rem / previewDaysLeft)} {t('plan.perDay')}</> : null}</>}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>

                {previewRounds.length > 0 ? (
                  <div className="rounded-lg border p-2">
                    <PlanGanttChart items={previewRounds} color={PLAN_BLUE} unit={t('plan.roundsUnit')} planDeadline={deadline || null} />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t('plan.noMilestoneHint')}</p>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1 rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-[11px] text-muted-foreground">{t('plan.schedulePreview')}</p>
                  {previewGoals.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t('plan.noCustomHint')}</p>
                  ) : (
                    <>
                      <p className="text-[12px] tabular-nums">
                        {t('plan.batchTotal')}
                        {' '}
                        <b className="text-pink-600 dark:text-pink-400">{previewGoals.filter((g) => g.state !== 'done').reduce((sum, g) => sum + g.quantity, 0)}</b>
                        {' '}
                        {t('plan.questions')}
                        {' · '}
                        {t('plan.roundStateDone')} {previewGoals.filter((g) => g.state === 'done').length}/{previewGoals.length}
                        {t('plan.batchesUnit')}
                      </p>
                      <ul className="space-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                        {goalSubjects.map((subject) => {
                          const list = goalsBySubject.get(subject) ?? []
                          const rest = list.filter((g) => !goalPreviewById.get(g.id)?.doneAt).reduce((sum, g) => sum + g.count, 0)
                          return (
                            <li key={subject} className="flex justify-between gap-2">
                              <span className="truncate">{subject}</span>
                              <span className="shrink-0 tabular-nums">
                                {list.length}{t('plan.batchesUnit')} · {t('plan.remaining')} {rest} {t('plan.questions')}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>

                {previewGoals.length > 0 && (
                  <div className="rounded-lg border p-2">
                    <PlanGanttChart items={previewGoals} color={CUSTOM_PINK} unit={t('plan.batchesUnit')} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap gap-2">
          {onModeChange && (
            <div className="flex items-center gap-1">
              <div className="inline-flex rounded-md border p-0.5">
                <Button variant={mode === 'sequential' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs px-2.5" onClick={() => onModeChange('sequential')}>{t('plan.modeSequential')}</Button>
                <Button variant={mode === 'random' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs px-2.5" onClick={() => onModeChange('random')}>{t('plan.modeRandom')}</Button>
                <Button variant={mode === 'review' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs px-2.5" onClick={() => onModeChange('review')}>{t('plan.modeReview')}</Button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground"><HelpCircle className="h-3.5 w-3.5" /></button>
                  </TooltipTrigger>
                  <TooltipContent>{t('plan.modeHint')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="text-xs">{t('plan.cancel')}</Button>
          </DialogClose>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleSave} disabled={saving}>
            {saving ? t('questions.saving') : t('plan.save')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReset} onOpenChange={(open) => { if (!open) { setConfirmReset(false); setResetTooEasy(false) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置</AlertDialogTitle>
            <AlertDialogDescription>
              重置后，所选科目的已完成题目计数将归零。
            </AlertDialogDescription>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
              <Checkbox checked={resetTooEasy} onCheckedChange={(v) => setResetTooEasy(v === true)} />
              同时将已标记为"太简单"的题目恢复（仅当前学科）
            </label>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleResetLong()
                setResetTooEasy(false)
                setConfirmReset(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={askLoadNewSession} onOpenChange={setAskLoadNewSession}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>是否加载新会话？</AlertDialogTitle>
            <AlertDialogDescription>
              进度已重置。可重新拉取题目列表（保留答题记录，适用于题库新增/删除题目或知识点变动后刷新会话），或从所选学科的第一题重新开始。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAskLoadNewSession(false)}>暂不</AlertDialogCancel>
            <AlertDialogAction className="bg-muted text-foreground hover:bg-muted/80" onClick={reloadSessionNow}>重新拉取题目（保留记录）</AlertDialogAction>
            <AlertDialogAction onClick={loadNewSessionNow}>从第一题重新开始</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
