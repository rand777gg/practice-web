import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardStore } from '@/stores/dashboard-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useSequentialStore } from '@/stores/sequential-store'


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
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlanDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()

  const savedSubjects = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
  const savedTargets = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(savedSubjects)
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>(savedTargets)
  const [saving, setSaving] = useState(false)
  const [planTab, setPlanTab] = useState<'long-term' | 'daily'>('long-term')

  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Map<string, number>>(new Map())
  const [subjectProgress, setSubjectProgress] = useState<Map<string, { total: number; done: number; missing_kp: number }>>(new Map())
  const [planLoading, setPlanLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState<'long' | number | null>(null)
  const [resetTooEasy, setResetTooEasy] = useState(false)
  const ltDropdownRef = useRef<HTMLButtonElement>(null)

  // Mutual exclusion: subjects in long-term plan can't be in daily targets and vice versa
  const dailyUsedSubjects = new Set(dailyTargets.flatMap(t => t.subjects.map(s => s.subject)))
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
    const t = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)
    setSelectedSubjects(s)
    setDailyTargets(t)
    setDeadline(profile?.deadline ?? '')
  }, [profile])

  const totalSelected = selectedSubjects.reduce((sum, s) => sum + (subjectCounts.get(s) ?? 0), 0)
  const totalDone = selectedSubjects.reduce((sum, s) => sum + (subjectProgress.get(s)?.done ?? 0), 0)
  const remaining = Math.max(totalSelected - totalDone, 0)

  let dailyGoal = 0
  if (deadline) {
    const deadlineDate = new Date(deadline + 'T23:59:59')
    const daysLeft = Math.max(Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000), 1)
    dailyGoal = Math.ceil(remaining / daysLeft)
  }

  const toggleSubject = (s: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  const addDailyTarget = () => {
    setDailyTargets((prev) => [...prev, { subjects: [] as { subject: string; count: number }[], deadline: null }])
  }

  const updateDailyDeadline = (i: number, deadline: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, deadline } : t))
  }
  const toggleTargetSubject = (i: number, subj: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      const exists = t.subjects.some(s => s.subject === subj)
      if (exists) {
        return { ...t, subjects: t.subjects.filter(s => s.subject !== subj) }
      }
      return { ...t, subjects: [...t.subjects, { subject: subj, count: 5 }] }
    }))
  }

  const removeDailyTarget = (i: number) => {
    setDailyTargets((prev) => prev.filter((_, idx) => idx !== i))
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
    // Rebuild active session so position recovery re-scans answers with new reset timestamps
    const s = useSequentialStore.getState()
    if (s.isActive && s.sessionKey) {
      const savedSps = { ...s.subjectPositions }
      await s.startSequential(user.id, s.selectedKps, [], '')
      useSequentialStore.getState()
      useSequentialStore.setState({ currentIndex: 0, subjectPositions: savedSps })
    }
    await refreshProfile()
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    setSaving(false)
  }

  const handleResetDaily = async (groupIdx: number) => {
    if (!user) return
    setSaving(true)
    const now = new Date().toISOString()
    // Reset subjects in this daily target group
    const resetEntries: Record<string, string> = {}
    const target = dailyTargets[groupIdx]
    const resetSubjects = target ? target.subjects.map(s => s.subject) : []
    if (target) for (const s of target.subjects) resetEntries[s.subject] = now
    const { data: existing } = await supabase.from('profiles').select('subject_reset_at').eq('id', user.id).single()
    const existingResets = (existing?.subject_reset_at ?? {}) as Record<string, string>
    const merged = { ...existingResets, ...resetEntries }
    await supabase.from('profiles').update({ subject_reset_at: merged }).eq('id', user.id)
    if (resetTooEasy && resetSubjects.length > 0) {
      const { data: qids } = await supabase.from('questions').select('id').in('subject', resetSubjects)
      if (qids && qids.length > 0) {
        await supabase.from('user_excluded_questions').delete().eq('user_id', user.id).in('question_id', qids.map(q => q.id))
      }
    }
    const s = useSequentialStore.getState()
    if (s.isActive && s.sessionKey) {
      const savedSps = { ...s.subjectPositions }
      await s.startSequential(user.id, s.selectedKps, [], '')
      useSequentialStore.getState()
      useSequentialStore.setState({ currentIndex: 0, subjectPositions: savedSps })
    }
    await refreshProfile()
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    window.dispatchEvent(new Event('plan-progress-refresh'))
    setSaving(false)
  }

  const handleDeleteLong = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ deadline: null, plan_subjects: null }).eq('id', user.id)
    await refreshProfile()
    setDeadline('')
    setSelectedSubjects([])
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    window.dispatchEvent(new Event('plan-progress-refresh'))
    setSaving(false)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    // ponytail: auto-calc daily target counts from deadline before saving
    const effectiveTargets = dailyTargets.map((target) => {
      if (!target.deadline) return target
      const daysLeft = Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
      return {
        ...target,
        subjects: target.subjects.map((subj) => {
          const p = subjectProgress.get(subj.subject)
          const remaining = Math.max((p?.total ?? 0) - (p?.done ?? 0), 0)
          return { ...subj, count: Math.ceil(remaining / daysLeft) }
        }),
      }
    })
    await supabase
      .from('profiles')
      .update({
        deadline: deadline || null,
        plan_subjects: selectedSubjects.length > 0 ? JSON.stringify(selectedSubjects) : null,
        daily_targets: effectiveTargets.length > 0 ? JSON.stringify(effectiveTargets) : null,
      })
      .eq('id', user.id)
    await refreshProfile()

    // Preserve the old plan's session as history. A changed plan gets its own
    // session scope instead of rewriting the old question sequence.
    const activeSession = useSequentialStore.getState()
    if (activeSession.isActive && activeSession.sessionKey) {
      await activeSession.saveToDb(user.id)
      activeSession.reset()
    }

    // Sync active sequential session with new plan subjects
    const allPlanSubs = [...new Set([...selectedSubjects, ...effectiveTargets.flatMap(t => t.subjects.map(s => s.subject))])]
    if (allPlanSubs.length > 0) {
      const s = useSequentialStore.getState()
      if (s.isActive && s.sessionKey) {
        // Fetch all KPs for the new plan subjects
        const { data: kpRows } = await supabase.from('questions').select('key_points').in('subject', allPlanSubs).not('key_points', 'is', null)
        const planKps = new Set<string>()
        for (const r of (kpRows ?? []) as { key_points: string }[]) {
          for (const k of r.key_points.split(/[,，;；]/).map(x => x.trim()).filter(Boolean)) planKps.add(k)
        }
        // Merge: keep existing session KPs that are still in plan, add new ones
        const newPlanKps = [...planKps].sort()
        if (newPlanKps.length > 0) {
          await s.mergeKps(user.id, newPlanKps, allPlanSubs, '')
        }
      }
    }

    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl mx-4 sm:mx-auto">
        <DialogHeader className="sm:text-center">
          <DialogTitle>{t('plan.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden pr-1 space-y-3">
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
                    const disabledByDaily = dailyUsedSubjects.has(s) && !checked
                    return (
                      <DropdownMenuItem
                        key={s}
                        disabled={disabledByDaily}
                        onSelect={(e) => { e.preventDefault(); toggleSubject(s) }}
                        className={`text-xs ${disabledByDaily ? 'opacity-40' : ''}`}
                      >
                        <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                        <span>{s}</span>
                        <span className="ml-auto text-muted-foreground">{disabledByDaily ? '已用于自定义' : subjectCounts.get(s) ?? 0}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>

              {/* Deadline */}
              <DateTimePicker
                date={deadline ? new Date(deadline + 'T00:00:00') : undefined}
                onSelect={(d) => setDeadline(d ? d.toISOString().slice(0, 10) : '')}
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
                          <span className="tabular-nums">{done}/{total}{mk > 0 && <Link to={`/admin/questions?subject=${encodeURIComponent(s)}&kp_missing=1`} className="ml-1.5 text-amber-500 hover:text-amber-600 underline">{mk}题缺知识点</Link>}</span>
                        </div>
                        <Progress value={pct} className="h-1.5 [&>div]:bg-blue-500" />
                      </div>
                    )
                  })}
                  {deadline && (
                    <p className="text-[11px] pt-1">
                      <span className="text-muted-foreground">{t('plan.dailyGoal')}: </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{dailyGoal} {t('plan.perDay')}</span>
                      <span className="text-muted-foreground ml-2">{t('plan.doneCount')}: {totalDone}/{totalSelected}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-1.5 pt-1">
                <Button variant="outline" size="sm" className="text-destructive text-xs h-7" onClick={() => setConfirmReset('long')} disabled={saving}>
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
            ) : dailyTargets.length === 0 ? (
              <div className="border rounded-lg p-6 text-center space-y-2">
                <p className="text-sm text-muted-foreground">{t('plan.selectHint')}</p>
                <p className="text-xs text-muted-foreground">点击下方按钮添加自定义目标</p>
              </div>
            ) : dailyTargets.map((target, i) => {
              const usedByOthers = new Set(
                dailyTargets.flatMap((t, idx) => idx !== i ? t.subjects.map(s => s.subject) : [])
              )
              const targetSubjectNames = target.subjects.map(s => s.subject)
              const availableSubjects = allSubjects.filter(s => !usedByOthers.has(s) || targetSubjectNames.includes(s))
              return (
                <div key={i}>
                  {/* Title outside box */}
                  <div className="text-sm font-semibold text-pink-600 dark:text-pink-400 truncate mb-1.5">{t('plan.dailyTarget')}</div>

                  <div className="border rounded-lg p-3 space-y-2">

                  {/* Subject multi-select + action buttons */}
                  <div className="flex items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 justify-between text-xs font-normal h-8">
                        <span className={target.subjects.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                          {target.subjects.length === 0
                            ? t('plan.selectHint')
                            : target.subjects.map(s => `${s.subject} (${subjectCounts.get(s.subject) ?? 0})`).join(', ')}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
                      {availableSubjects.map((s) => {
                        const checked = targetSubjectNames.includes(s)
                        const disabledByLong = longUsedSubjects.has(s) && !checked
                        return (
                          <DropdownMenuItem
                            key={s}
                            disabled={disabledByLong}
                            onSelect={(e) => { e.preventDefault(); toggleTargetSubject(i, s) }}
                            className={`text-xs ${disabledByLong ? 'opacity-40' : ''}`}
                          >
                            <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                            <span>{s}</span>
                            <span className="ml-auto text-muted-foreground">{disabledByLong ? '已用于长期' : subjectCounts.get(s) ?? 0}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>

                  {/* Deadline */}
                  <DateTimePicker
                    date={target.deadline ? new Date(target.deadline) : undefined}
                    onSelect={(d) => updateDailyDeadline(i, d ? d.toISOString() : '')}
                    placeholder={t('plan.deadline')}
                  />

                  {/* Subject progress items — same layout as long-term tab */}
                  {target.subjects.length > 0 && (
                    <div className="space-y-1.5">
                      {target.subjects.map((subj) => {
                        const p = subjectProgress.get(subj.subject)
                        const total = p?.total ?? 0
                        const done = p?.done ?? 0
                        const mk = p?.missing_kp ?? 0
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0
                        return (
                        <div key={subj.subject} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground truncate max-w-[60%]">{subj.subject}</span>
                            <span className="tabular-nums">{done}/{total}{mk > 0 && <Link to={`/admin/questions?subject=${encodeURIComponent(subj.subject)}&kp_missing=1`} className="ml-1.5 text-amber-500 hover:text-amber-600 underline">{mk}题缺知识点</Link>}</span>
                          </div>
                          <Progress value={pct} className="h-1.5 [&>div]:bg-pink-500" />
                        </div>
                      )})}
                    </div>
                  )}

                  {/* Per-group summary at bottom-left */}
                  {target.subjects.length > 0 && (() => {
                    const grpDailyGoal = !target.deadline
                      ? target.subjects.reduce((s, subj) => s + subj.count, 0)
                      : (() => {
                          const daysLeft = Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
                          return target.subjects.reduce((s, subj) => {
                            const p = subjectProgress.get(subj.subject)
                            const r = Math.max((p?.total ?? 0) - (p?.done ?? 0), 0)
                            return s + Math.ceil(r / daysLeft)
                          }, 0)
                        })()
                    let grpTotal = 0, grpDone = 0
                    for (const subj of target.subjects) {
                      const p = subjectProgress.get(subj.subject)
                      grpTotal += p?.total ?? 0
                      grpDone += p?.done ?? 0
                    }
                    return (
                      <p className="text-[11px] pt-1">
                        <span className="text-muted-foreground">{t('plan.dailyGoal')}: </span>
                        <span className="font-semibold text-pink-600 dark:text-pink-400">{grpDailyGoal} {t('plan.perDay')}</span>
                        <span className="text-muted-foreground ml-2">{t('plan.doneCount')}: {grpDone}/{grpTotal}</span>
                      </p>
                    )
                  })()}

                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button variant="outline" size="sm" className="text-destructive text-xs h-7" onClick={() => setConfirmReset(i)} disabled={saving}>
                      {saving ? '...' : '重置进度'}
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive text-xs h-7" onClick={() => removeDailyTarget(i)} disabled={saving}>
                      <X className="h-3 w-3 mr-1" />删除目标
                    </Button>
                  </div>
                </div>
              </div>
              )
            })}

            {/* Add button — outside box */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={addDailyTarget} className="text-xs h-7">
                <Plus className="h-3 w-3" />
                新增目标
              </Button>
            </div>
          </div>
          )}

        </div>

        <DialogFooter className="flex-row flex-wrap gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="text-xs">{t('plan.cancel')}</Button>
          </DialogClose>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleSave} disabled={saving}>
            {saving ? t('questions.saving') : t('plan.save')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                顺序刷题
                <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link to="/practice?mode=seq">顺序刷题</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/practice?mode=random">随机刷题</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReset !== null} onOpenChange={(open) => { if (!open) { setConfirmReset(null); setResetTooEasy(false) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmReset === 'long'
                ? '重置后，所选科目的已完成题目计数将归零。'
                : '重置后，该组自定义目标的已完成计数将归零。'}
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
                if (confirmReset === 'long') handleResetLong()
                else if (typeof confirmReset === 'number') handleResetDaily(confirmReset)
                setResetTooEasy(false)
                setConfirmReset(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
