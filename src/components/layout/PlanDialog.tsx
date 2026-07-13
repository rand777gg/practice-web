import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Link, useNavigate } from 'react-router-dom'
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
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets, getPlanTargets } from '@/types'
import { fetchTargetScopeIds, deriveAnswerSets, scopeProgress, type AnswerSets } from '@/lib/plan'
import { Checkbox } from '@/components/ui/checkbox'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function MultiSelectDropdown({ placeholder, options, selected, onToggle }: {
  placeholder: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
          <span className={selected.length === 0 ? 'text-muted-foreground' : 'truncate'}>
            {selected.length === 0 ? placeholder : selected.join('、')}
          </span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
        {options.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">—</DropdownMenuItem>
        ) : options.map((o) => {
          const checked = selected.includes(o)
          return (
            <DropdownMenuItem key={o} onSelect={(e) => { e.preventDefault(); onToggle(o) }} className="text-xs">
              <Check className={cn('h-3 w-3 shrink-0', !checked && 'opacity-0')} />
              <span className="truncate">{o}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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

  const savedTargets = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)

  const [planTargets, setPlanTargets] = useState<DailyTarget[]>(getPlanTargets(profile))
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>(savedTargets)
  const [saving, setSaving] = useState(false)
  const [planTab, setPlanTab] = useState<'long-term' | 'daily'>('long-term')

  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [planLoading, setPlanLoading] = useState(false)

  // Daily target: subject/category/keyPoint options cascade from question metadata
  const [questionMeta, setQuestionMeta] = useState<{ subject: string; cats: string[]; keyPoints: string[] }[]>([])
  const [answerSets, setAnswerSets] = useState<AnswerSets>(() => deriveAnswerSets([], ''))
  const [longProgress, setLongProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 })
  const [targetScopes, setTargetScopes] = useState<{ total: number; done: number }[]>([])

  const { fetchPlanCache } = useDashboardStore()
  const refreshVersion = useRefreshStore((s) => s.version)
  const navigate = useNavigate()

  const startKpPractice = (target: DailyTarget) => {
    localStorage.setItem('practice_filters', JSON.stringify({
      selectedSubjects: target.subjects,
      selectedCategory: target.categories[0] ?? '',
      selectedType: '',
      selectedKeyPoint: '',
      questionScope: 'all',
      kpOrder: true,
    }))
    navigate('/practice')
  }

  // Load subject/category/keyPoint metadata once per open — filter options cascade from this
  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase.from('questions').select('subject, category, categories, key_points').limit(5000).then(({ data }) => {
      if (cancelled) return
      setQuestionMeta((data ?? []).map((r: any) => ({
        subject: r.subject || '',
        cats: (r.categories?.length ? r.categories : r.category ? [r.category] : []) as string[],
        keyPoints: r.key_points ? (r.key_points as string).split(/[,，;；]/).map((k: string) => k.trim()).filter(Boolean) : [],
      })))
    })
    return () => { cancelled = true }
  }, [open])

  // All-time answers → derived sets for scope progress (normal + wrong-only)
  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    supabase.from('user_answers').select('question_id, is_correct, answered_at').eq('user_id', user.id).order('answered_at', { ascending: false }).limit(5000).then(({ data }) => {
      if (!cancelled) setAnswerSets(deriveAnswerSets((data ?? []) as any[], todayISO))
    })
    return () => { cancelled = true }
  }, [open, user])

  // Per-target scope {total, done} recomputed when any target's filters change
  const targetsKey = JSON.stringify(dailyTargets.map((t) => [t.subjects, t.categories, t.keyPoints, t.wrongOnly]))
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const scopes = await Promise.all(dailyTargets.map(async (t) => {
        const ids = await fetchTargetScopeIds(t)
        const p = scopeProgress(ids, answerSets, t.wrongOnly)
        return { total: p.total, done: p.done }
      }))
      if (!cancelled) setTargetScopes(scopes)
    })()
    return () => { cancelled = true }
  }, [open, targetsKey, answerSets]) // eslint-disable-line react-hooks/exhaustive-deps

  // Long-term aggregate {total, done} summed over all plan target groups
  const planTargetsKey = JSON.stringify(planTargets.map((t) => [t.subjects, t.categories, t.keyPoints, t.wrongOnly]))
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      let total = 0, done = 0
      for (const target of planTargets) {
        const ids = await fetchTargetScopeIds(target)
        const p = scopeProgress(ids, answerSets, target.wrongOnly)
        total += p.total; done += p.done
      }
      if (!cancelled) setLongProgress({ total, done })
    })()
    return () => { cancelled = true }
  }, [open, planTargetsKey, answerSets]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !user) return
    const cache = useDashboardStore.getState().getPlanCache()
    if (cache && cache.refreshVersion === refreshVersion) {
      setAllSubjects(cache.allSubjects)
      return
    }
    setPlanLoading(true)
    fetchPlanCache(user.id, refreshVersion).then((cache) => {
      setAllSubjects(cache.allSubjects)
      setPlanLoading(false)
    })
  }, [open, user, fetchPlanCache, refreshVersion])

  useEffect(() => {
    const t = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)
    setPlanTargets(getPlanTargets(profile))
    setDailyTargets(t)
    setDeadline(profile?.deadline ?? '')
  }, [profile])

  const totalSelected = longProgress.total
  const totalDone = longProgress.done
  const remaining = Math.max(totalSelected - totalDone, 0)

  let dailyGoal = 0
  if (deadline) {
    const deadlineDate = new Date(deadline + 'T23:59:59')
    const daysLeft = Math.max(Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000), 1)
    dailyGoal = Math.ceil(remaining / daysLeft)
  }

  const addPlanTarget = () => {
    setPlanTargets((prev) => [...prev, { subjects: [], categories: [], keyPoints: [], count: 0, deadline: null, wrongOnly: false }])
  }

  const removePlanTarget = (i: number) => {
    setPlanTargets((prev) => prev.filter((_, idx) => idx !== i))
  }

  const setPlanTargetSubject = (i: number, val: string) => {
    setPlanTargets((prev) => prev.map((t, idx) =>
      idx === i ? { ...t, subjects: t.subjects[0] === val ? [] : [val], categories: [], keyPoints: [] } : t))
  }

  const togglePlanTargetCategory = (i: number, val: string) => {
    setPlanTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      const categories = t.categories.includes(val) ? t.categories.filter((x) => x !== val) : [...t.categories, val]
      const valid = validKeyPoints(t.subjects[0], categories)
      return { ...t, categories, keyPoints: t.keyPoints.filter((k) => valid.has(k)) }
    }))
  }

  const togglePlanTargetKeyPoint = (i: number, val: string) => {
    setPlanTargets((prev) => prev.map((t, idx) =>
      idx === i ? { ...t, keyPoints: t.keyPoints.includes(val) ? t.keyPoints.filter((x) => x !== val) : [...t.keyPoints, val] } : t))
  }

  const togglePlanTargetWrongOnly = (i: number) => {
    setPlanTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, wrongOnly: !t.wrongOnly } : t))
  }

  const addDailyTarget = () => {
    setDailyTargets((prev) => [...prev, { subjects: [], categories: [], keyPoints: [], count: 5, deadline: null, wrongOnly: false }])
  }

  const updateDailyDeadline = (i: number, deadline: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, deadline } : t))
  }

  const updateTargetCount = (i: number, count: number) => {
    setDailyTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, count } : t))
  }

  // Valid key points under a subject + selected categories (cascade)
  const validKeyPoints = (subject: string, cats: string[]) => {
    const set = new Set<string>()
    for (const r of questionMeta) {
      if (subject && r.subject !== subject) continue
      if (cats.length && !r.cats.some((c) => cats.includes(c))) continue
      for (const k of r.keyPoints) set.add(k)
    }
    return set
  }

  // Subject is single-select per target. Switching subject drops now-invalid category/keyPoint picks.
  const setTargetSubject = (i: number, val: string) => {
    setDailyTargets((prev) => prev.map((t, idx) =>
      idx === i
        ? { ...t, subjects: t.subjects[0] === val ? [] : [val], categories: [], keyPoints: [] }
        : t))
  }

  const toggleTargetCategory = (i: number, val: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      const categories = t.categories.includes(val) ? t.categories.filter((x) => x !== val) : [...t.categories, val]
      const valid = validKeyPoints(t.subjects[0], categories)
      return { ...t, categories, keyPoints: t.keyPoints.filter((k) => valid.has(k)) }
    }))
  }

  const toggleTargetKeyPoint = (i: number, val: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      const kp = t.keyPoints
      return { ...t, keyPoints: kp.includes(val) ? kp.filter((x) => x !== val) : [...kp, val] }
    }))
  }

  const toggleTargetWrongOnly = (i: number) => {
    setDailyTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, wrongOnly: !t.wrongOnly } : t))
  }

  const removeDailyTarget = (i: number) => {
    setDailyTargets((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    // Deadline targets recompute count from scope at render/consume time — save raw
    await supabase
      .from('profiles')
      .update({
        deadline: deadline || null,
        plan_targets: planTargets.length > 0 ? JSON.stringify(planTargets) : null,
        plan_subjects: planTargets.length > 0 ? JSON.stringify([...new Set(planTargets.flatMap((t) => t.subjects))]) : null,
        plan_categories: null,
        plan_key_points: null,
        daily_targets: dailyTargets.length > 0 ? JSON.stringify(dailyTargets) : null,
        plan_wrong_only: planTargets.some((t) => t.wrongOnly),
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
              {/* Plan target groups: subject (single) → category → key point, cascading */}
              {planTargets.map((target, i) => {
                const subj = target.subjects[0]
                const catOpts = new Set<string>()
                const kpOpts = new Set<string>()
                for (const r of questionMeta) {
                  if (subj && r.subject !== subj) continue
                  for (const c of r.cats) catOpts.add(c)
                  if (target.categories.length && !r.cats.some((c) => target.categories.includes(c))) continue
                  for (const k of r.keyPoints) kpOpts.add(k)
                }
                const categoryOptions = [...catOpts].sort((a, b) => a.localeCompare(b, 'zh-CN'))
                const keyPointOptions = [...kpOpts].sort((a, b) => a.localeCompare(b, 'zh-CN'))
                return (
                  <div key={i} className="space-y-2 border rounded-md p-2">
                    <div className="flex items-start gap-1">
                      <div className="flex-1 space-y-2">
                        <MultiSelectDropdown placeholder={t('plan.selectSubjects')} options={allSubjects} selected={target.subjects} onToggle={(v) => setPlanTargetSubject(i, v)} />
                        <MultiSelectDropdown placeholder={t('plan.selectCategories')} options={categoryOptions} selected={target.categories} onToggle={(v) => togglePlanTargetCategory(i, v)} />
                        <MultiSelectDropdown placeholder={t('plan.selectKeyPoints')} options={keyPointOptions} selected={target.keyPoints} onToggle={(v) => togglePlanTargetKeyPoint(i, v)} />
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removePlanTarget(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <Checkbox checked={target.wrongOnly} onCheckedChange={() => togglePlanTargetWrongOnly(i)} />
                      <span>{t('plan.wrongOnly')}</span>
                    </label>
                    {target.subjects.length > 0 && (
                      <Button variant="outline" size="sm" className="text-xs h-7 w-full" onClick={() => startKpPractice(target)}>
                        <Play className="h-3 w-3" />
                        {t('plan.practiceByKp')}
                      </Button>
                    )}
                  </div>
                )
              })}

              <Button variant="outline" size="sm" onClick={addPlanTarget} className="text-xs h-7">
                <Plus className="h-3 w-3" />
                {t('plan.addTarget')}
              </Button>

              {/* Deadline (shared by all groups) */}
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
              ) : planTargets.length > 0 && (
                <div className="space-y-1.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{planTargets.every((t) => t.wrongOnly) ? t('plan.wrongCount') : t('plan.totalQuestions')}</span>
                      <span className="tabular-nums">{totalDone}/{totalSelected}</span>
                    </div>
                    <Progress value={totalSelected > 0 ? Math.round((totalDone / totalSelected) * 100) : 0} className="h-1.5 [&>div]:bg-blue-500" />
                  </div>
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
              const scope = targetScopes[i] ?? { total: 0, done: 0 }
              const pct = scope.total > 0 ? Math.round((scope.done / scope.total) * 100) : 0
              // Category options limited to the picked subject; key points further limited by picked categories
              const subj = target.subjects[0]
              const catOpts = new Set<string>()
              const kpOpts = new Set<string>()
              for (const r of questionMeta) {
                if (subj && r.subject !== subj) continue
                for (const c of r.cats) catOpts.add(c)
                if (target.categories.length && !r.cats.some((c) => target.categories.includes(c))) continue
                for (const k of r.keyPoints) kpOpts.add(k)
              }
              const categoryOptions = [...catOpts].sort((a, b) => a.localeCompare(b, 'zh-CN'))
              const keyPointOptions = [...kpOpts].sort((a, b) => a.localeCompare(b, 'zh-CN'))
              const daysLeft = target.deadline
                ? Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
                : 0
              const effectiveCount = daysLeft > 0 ? Math.ceil(Math.max(scope.total - scope.done, 0) / daysLeft) : target.count
              return (
                <div key={i} className="space-y-2 border rounded-md p-2">
                  {/* Subject (single-select) → category → key point, cascading */}
                  <MultiSelectDropdown
                    placeholder={t('plan.selectSubjects')}
                    options={allSubjects}
                    selected={target.subjects}
                    onToggle={(v) => setTargetSubject(i, v)}
                  />
                  <MultiSelectDropdown
                    placeholder={t('plan.selectCategories')}
                    options={categoryOptions}
                    selected={target.categories}
                    onToggle={(v) => toggleTargetCategory(i, v)}
                  />
                  <MultiSelectDropdown
                    placeholder={t('plan.selectKeyPoints')}
                    options={keyPointOptions}
                    selected={target.keyPoints}
                    onToggle={(v) => toggleTargetKeyPoint(i, v)}
                  />

                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <Checkbox checked={target.wrongOnly} onCheckedChange={() => toggleTargetWrongOnly(i)} />
                    <span>{t('plan.wrongOnly')}</span>
                  </label>

                  {target.subjects.length > 0 && (
                    <Button variant="outline" size="sm" className="text-xs h-7 w-full" onClick={() => startKpPractice(target)}>
                      <Play className="h-3 w-3" />
                      {t('plan.practiceByKp')}
                    </Button>
                  )}

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

                  {/* Count + select-all */}
                  <div className="flex items-center gap-1">
                    {daysLeft > 0 ? (
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums w-14 text-center">{effectiveCount}</span>
                    ) : (
                      <Input
                        type="number"
                        min={1}
                        value={target.count}
                        onChange={(e) => updateTargetCount(i, Math.max(1, Number(e.target.value)))}
                        className="h-7 w-16 text-xs text-center shrink-0"
                      />
                    )}
                    <span className="text-xs text-muted-foreground">{t('plan.questions')}</span>
                    {daysLeft === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs ml-auto"
                        onClick={() => updateTargetCount(i, scope.total)}
                      >
                        {t('plan.selectAll')} ({scope.total})
                      </Button>
                    )}
                  </div>

                  {/* Scope progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{t('plan.scopeCount')}</span>
                      <span className="tabular-nums">{scope.done}/{scope.total}</span>
                    </div>
                    <Progress value={pct} className="h-1.5 [&>div]:bg-pink-500" />
                  </div>
                </div>
              )
            })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={addDailyTarget}
              className="text-xs h-7 mt-2"
            >
              <Plus className="h-3 w-3" />
              {t('plan.addTarget')}
            </Button>

            {/* Daily goal summary */}
            {dailyTargets.length > 0 && (() => {
              const dailyGoalTotal = dailyTargets.reduce((sum, t, i) => {
                const sc = targetScopes[i] ?? { total: 0, done: 0 }
                if (!t.deadline) return sum + t.count
                const daysLeft = Math.max(Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000), 1)
                return sum + Math.ceil(Math.max(sc.total - sc.done, 0) / daysLeft)
              }, 0)
              const totalScope = targetScopes.reduce((s, x) => s + x.total, 0)
              const totalDoneAll = targetScopes.reduce((s, x) => s + x.done, 0)
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