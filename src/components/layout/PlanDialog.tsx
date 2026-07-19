import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Check, ChevronDown, HelpCircle, Plus, Play, X } from 'lucide-react'
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
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

export function PlanDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)

  const savedSubjects = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
  const savedTargets = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(savedSubjects)
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>(savedTargets)
  const [saving, setSaving] = useState(false)
  const [planTab, setPlanTab] = useState<'long-term' | 'daily'>('long-term')

  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Map<string, number>>(new Map())
  const [subjectProgress, setSubjectProgress] = useState<Map<string, { total: number; done: number }>>(new Map())
  const [planLoading, setPlanLoading] = useState(false)
  const [confirmReset, setConfirmReset] = useState<'long' | 'daily' | null>(null)
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
    if (allSubjects.length === 0) return
    const used = new Set(dailyTargets.flatMap((t) => t.subjects.map(s => s.subject)))
    const next = allSubjects.find((s) => !used.has(s))
    if (!next) return
    setDailyTargets((prev) => [...prev, { subjects: [{ subject: next, count: 5 }], deadline: null }])
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
    const now = new Date()
    await supabase.from('profiles').update({ plan_reset_at: now.toISOString() }).eq('id', user.id)
    if (resetTooEasy) { await supabase.from('user_excluded_questions').delete().eq('user_id', user.id) }
    await refreshProfile()
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    setSaving(false)
  }

  const handleResetDaily = async () => {
    if (!user) return
    setSaving(true)
    const now = new Date()
    await supabase.from('profiles').update({ daily_reset_at: now.toISOString() }).eq('id', user.id)
    if (resetTooEasy) { await supabase.from('user_excluded_questions').delete().eq('user_id', user.id) }
    await refreshProfile()
    useRefreshStore.getState().bump()
    useRefreshStore.getState().bumpPlan()
    useDashboardStore.getState().invalidatePlanCache()
    setSaving(false)
  }

  const handleDeleteLong = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ deadline: null, plan_subjects: null }).eq('id', user.id)
    await refreshProfile()
    setDeadline('')
    setSelectedSubjects([])
    useDashboardStore.getState().invalidatePlanCache()
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
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="sm:text-center">
          <DialogTitle>{t('plan.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
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
              {/* Subject selection + delete */}
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
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleDeleteLong} disabled={saving}>
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Deadline */}
              <button
                type="button"
                onClick={() => {
                  const btn = document.querySelector('.plan-date-input') as HTMLInputElement
                  btn?.showPicker()
                }}
                className="relative flex items-center justify-between w-full h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer dark:text-foreground"
              >
                <span className={deadline ? '' : 'text-muted-foreground'}>
                  {deadline ? formatDate(deadline) : t('plan.pickDate')}
                </span>
                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="plan-date-input absolute inset-0 opacity-0 cursor-pointer"
                  style={{ colorScheme: theme }}
                />
              </button>

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
                    return (
                      <div key={s} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground truncate max-w-[60%]">{s}</span>
                          <span className="tabular-nums">{done}/{total}</span>
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
            ) : dailyTargets.map((target, i) => {
              const usedByOthers = new Set(
                dailyTargets.flatMap((t, idx) => idx !== i ? t.subjects.map(s => s.subject) : [])
              )
              const targetSubjectNames = target.subjects.map(s => s.subject)
              const availableSubjects = allSubjects.filter(s => !usedByOthers.has(s) || targetSubjectNames.includes(s))
              return (
                <div key={i}>
                  {/* Title outside box */}
                  <div className="text-sm font-semibold text-pink-600 dark:text-pink-400 truncate mb-1.5">
                    {t('plan.dailyTarget')}
                  </div>

                  <div className="border rounded-lg p-3 space-y-2">

                  {/* Subject multi-select + delete */}
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeDailyTarget(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Deadline */}
                  <button
                    type="button"
                    onClick={() => {
                      const btn = document.querySelector(`.target-date-input-${i}`) as HTMLInputElement
                      btn?.showPicker()
                    }}
                    className="relative flex items-center justify-between w-full h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer dark:text-foreground"
                  >
                    <span className={target.deadline ? '' : 'text-muted-foreground'}>
                      {target.deadline
                        ? new Date(target.deadline).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : t('plan.deadline')}
                    </span>
                    <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                    <input
                      type="datetime-local"
                      value={target.deadline ?? ''}
                      onChange={(e) => updateDailyDeadline(i, e.target.value)}
                      className={`target-date-input-${i} absolute inset-0 opacity-0 cursor-pointer`}
                      style={{ colorScheme: theme }}
                    />
                  </button>

                  {/* Subject progress items — same layout as long-term tab */}
                  {target.subjects.length > 0 && (
                    <div className="space-y-1.5">
                      {target.subjects.map((subj) => {
                        const p = subjectProgress.get(subj.subject)
                        const total = p?.total ?? 0
                        const done = p?.done ?? 0
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0
                        return (
                        <div key={subj.subject} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground truncate max-w-[60%]">{subj.subject}</span>
                            <span className="tabular-nums">{done}/{total}</span>
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
                </div>
              </div>
              )
            })}

            {/* Add button — outside box */}
            {(() => {
              const usedAll = new Set(dailyTargets.flatMap((t) => t.subjects.map(s => s.subject)))
              if (usedAll.size >= allSubjects.length) return null
              return (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={addDailyTarget} className="text-xs h-7">
                    <Plus className="h-3 w-3" />
                    {t('plan.addSubject')}
                  </Button>
                </div>
              )
            })()}
          </div>
          )}

        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmReset('long')} disabled={saving}>
            {saving ? '...' : '重置长期'}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmReset('daily')} disabled={saving}>
            {saving ? '...' : '重置自定义'}
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm">{t('plan.cancel')}</Button>
          </DialogClose>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t('questions.saving') : t('plan.save')}
          </Button>
          <Button size="sm" asChild>
            <Link to="/practice">
              <Play className="h-3.5 w-3.5" />
              开始学习
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReset !== null} onOpenChange={(open) => { if (!open) { setConfirmReset(null); setResetTooEasy(false) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmReset === 'long'
                ? '重置后，长期计划的已完成题目计数将归零，每日目标将重新计算。'
                : '重置后，自定义目标的今日已完成计数将归零。'}
            </AlertDialogDescription>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
              <input type="checkbox" checked={resetTooEasy} onChange={(e) => setResetTooEasy(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              同时将已标记为"太简单"的题目恢复
            </label>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReset === 'long') handleResetLong()
                else if (confirmReset === 'daily') handleResetDaily()
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