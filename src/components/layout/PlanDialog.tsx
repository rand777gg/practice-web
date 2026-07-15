import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { usePlanStore } from '@/stores/plan-store'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

  const { fetchPlanCache } = useDashboardStore()
  const refreshVersion = useRefreshStore((s) => s.version)

  useEffect(() => {
    if (!open || !user) return
    const cache = useDashboardStore.getState().getPlanCache()
    if (cache && cache.refreshVersion === refreshVersion) {
      const counts = new Map<string, number>()
      for (const [s, p] of Object.entries(cache.subjectProgress)) counts.set(s, p.total)
      for (const s of selectedSubjects) { if (!counts.has(s)) counts.set(s, 0) }
      setAllSubjects(cache.allSubjects)
      setSubjectCounts(counts)
      setSubjectProgress(new Map(Object.entries(cache.subjectProgress)))
      return
    }
    setPlanLoading(true)
    fetchPlanCache(user.id, refreshVersion, profile?.plan_reset_at).then((cache) => {
      const counts = new Map<string, number>()
      for (const [s, p] of Object.entries(cache.subjectProgress)) counts.set(s, p.total)
      for (const s of selectedSubjects) { if (!counts.has(s)) counts.set(s, 0) }
      setAllSubjects(cache.allSubjects)
      setSubjectCounts(counts)
      setSubjectProgress(new Map(Object.entries(cache.subjectProgress)))
      setPlanLoading(false)
    })
  }, [open, user, selectedSubjects, fetchPlanCache, refreshVersion, profile?.plan_reset_at])

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

  const updateSubjectCount = (i: number, si: number, count: number) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      return { ...t, subjects: t.subjects.map((s, sIdx) => sIdx === si ? { ...s, count } : s) }
    }))
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
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    await supabase.from('profiles').update({ plan_reset_at: todayEnd.toISOString() }).eq('id', user.id)
    await refreshProfile()
    usePlanStore.getState().reset()
    useRefreshStore.getState().bumpPlan()
    setSaving(false)
  }

  const handleResetDaily = async () => {
    if (!user) return
    setSaving(true)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    await supabase.from('profiles').update({ daily_reset_at: todayEnd.toISOString() }).eq('id', user.id)
    await refreshProfile()
    usePlanStore.getState().reset()
    useRefreshStore.getState().bumpPlan()
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
          <div className="border rounded-lg p-3">
            <div className="text-sm font-semibold mb-2 text-blue-600 dark:text-blue-400">
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

            <div className="space-y-2">
              {/* Subject selection */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
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
                    return (
                      <DropdownMenuItem
                        key={s}
                        onSelect={(e) => { e.preventDefault(); toggleSubject(s) }}
                        className="text-xs"
                      >
                        <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                        <span>{s}</span>
                        <span className="ml-auto text-muted-foreground">{subjectCounts.get(s) ?? 0}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

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
                      <span className="text-muted-foreground ml-2">{t('plan.remaining')}: {remaining}/{totalSelected}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {planTab === 'daily' && (
          <div className="border rounded-lg p-3">
            <div className="text-sm font-semibold mb-2 text-pink-600 dark:text-pink-400">
              {t('plan.dailyTarget')}
              <HoverCard openDelay={500}>
                <HoverCardTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="text-xs w-56">
                  {t('plan.dailyTargetDesc')}
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="space-y-3">
            {planLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 flex-1" />
                      <Skeleton className="h-7 w-7" />
                    </div>
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
                <div key={i} className="space-y-2">
                  {/* Subject multi-select */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
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
                        return (
                          <DropdownMenuItem
                            key={s}
                            onSelect={(e) => { e.preventDefault(); toggleTargetSubject(i, s) }}
                            className="text-xs"
                          >
                            <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                            <span>{s}</span>
                            <span className="ml-auto text-muted-foreground">{subjectCounts.get(s) ?? 0}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Deadline */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const btn = document.querySelector(`.target-date-input-${i}`) as HTMLInputElement
                        btn?.showPicker()
                      }}
                      className="relative flex items-center justify-between flex-1 h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer dark:text-foreground"
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeDailyTarget(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Per-subject count inputs with progress */}
                  {target.subjects.map((subj, si) => {
                    const p = subjectProgress.get(subj.subject)
                    const total = p?.total ?? 0
                    const done = p?.done ?? 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    const remaining = Math.max(total - done, 0)
                    const targetDaysLeft = target.deadline
                      ? Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
                      : 0
                    const effectiveCount = targetDaysLeft > 0 ? Math.ceil(remaining / targetDaysLeft) : subj.count
                    return (
                    <div key={subj.subject} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{subj.subject}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                        <div className="flex items-center gap-1">
                          {targetDaysLeft > 0 ? (
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums w-14 text-center">{effectiveCount}</span>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={subj.count}
                              onChange={(e) => updateSubjectCount(i, si, Math.max(1, Number(e.target.value)))}
                              className="h-7 w-14 text-xs text-center shrink-0"
                            />
                          )}
                          <span className="text-xs text-muted-foreground">{t('plan.questions')}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5 [&>div]:bg-pink-500" />
                    </div>
                  )})}
                </div>
              )
            })}
            </div>

            {(() => {
              const usedAll = new Set(dailyTargets.flatMap((t) => t.subjects.map(s => s.subject)))
              if (usedAll.size >= allSubjects.length) return null
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addDailyTarget}
                  className="text-xs h-7 mt-2"
                >
                  <Plus className="h-3 w-3" />
                  {t('plan.addSubject')}
                </Button>
              )
            })()}

            {/* Daily goal summary — same style as long-term plan */}
            {dailyTargets.length > 0 && dailyTargets.some(t => t.subjects.length > 0) && (() => {
              const dailyGoalTotal = dailyTargets.reduce((sum, t) => {
                if (!t.deadline) return sum + t.subjects.reduce((s, subj) => s + subj.count, 0)
                const daysLeft = Math.max(Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000), 1)
                return sum + t.subjects.reduce((s, subj) => {
                  const p = subjectProgress.get(subj.subject)
                  const r = Math.max((p?.total ?? 0) - (p?.done ?? 0), 0)
                  return s + Math.ceil(r / daysLeft)
                }, 0)
              }, 0)
              const uniqueSubjects = new Set(dailyTargets.flatMap(t => t.subjects.map(s => s.subject)))
              let totalScope = 0, totalDoneAll = 0
              for (const s of uniqueSubjects) {
                const p = subjectProgress.get(s)
                totalScope += p?.total ?? 0
                totalDoneAll += p?.done ?? 0
              }
              const remainingAll = Math.max(totalScope - totalDoneAll, 0)
              return (
                <p className="text-[11px] pt-1">
                  <span className="text-muted-foreground">{t('plan.dailyGoal')}: </span>
                  <span className="font-semibold text-pink-600 dark:text-pink-400">{dailyGoalTotal} {t('plan.perDay')}</span>
                  <span className="text-muted-foreground ml-2">{t('plan.remaining')}: {remainingAll}/{totalScope}</span>
                </p>
              )
            })()}
          </div>
          )}

        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" className="text-destructive" onClick={handleResetLong} disabled={saving}>
            {saving ? '...' : '重置长期'}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={handleResetDaily} disabled={saving}>
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
    </Dialog>
  )
}