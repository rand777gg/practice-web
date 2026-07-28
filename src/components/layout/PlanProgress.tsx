import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'

import { Progress } from '@/components/ui/progress'
import { PlanDialog } from './PlanDialog'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { useT } from '@/i18n/use-t'
import { Check } from 'lucide-react'

function todayStart(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0))
  if (now < d) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

function getPlanSubjects(profile: { plan_subjects?: string | null } | null): string[] {
  if (!profile?.plan_subjects) return []
  try { return JSON.parse(profile.plan_subjects) as string[] } catch { return [] }
}

function getDailyTargets(profile: { daily_targets?: string | null } | null): DailyTarget[] {
  if (!profile?.daily_targets) return []
  try { return normalizeDailyTargets(JSON.parse(profile.daily_targets)) } catch { return [] }
}

function subjectKey(s: string) { return s || 'Other' }

export function PlanProgress() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const deadline = profile?.deadline ?? null
  const planResetAt = profile?.plan_reset_at ?? null
  const subjectResetAt = profile?.subject_reset_at ?? null
  const dailyResetAt = profile?.daily_reset_at ?? null
  const planSubjects = getPlanSubjects(profile)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(0)
  const [todayLongDone, setTodayLongDone] = useState(0)
  const [dailyTargetGoal, setDailyTargetGoal] = useState(0)
  const [targetProgress, setTargetProgress] = useState<{ subjects: { subject: string; count: number; done: number }[]; total: number; totalDone: number }[]>([])

  const hasData = dailyGoal > 0 || targetProgress.length > 0

  useEffect(() => {
    if (!user) return
    const uid = user.id
    if (!hasData) setIsLoading(true)
    let cancelled = false
    async function load() {
      try {
      const today = todayStart()

      // Long-term goal
      if (deadline) {
        const deadlineDate = new Date(deadline + 'T23:59:59')
        const daysLeft = Math.max(daysBetween(new Date(), deadlineDate), 1)
        const { data: lt, error: ltErr } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid,
          p_plan_reset_at: planResetAt || null,
          p_today_since: today,
          p_subjects: planSubjects.length > 0 ? planSubjects : null,
          p_subject_resets: subjectResetAt,
        })
        if (cancelled) return
        if (ltErr) { console.error('PlanProgress lt:', ltErr); return }
        const rows = lt as { subject: string; total: number; done_all: number; done_today: number }[] | null

        let scopeTotal = 0, scopeDoneAll = 0, scopeDoneToday = 0
        for (const r of (rows ?? [])) {
          scopeTotal += Number(r.total)
          scopeDoneAll += Number(r.done_all)
          scopeDoneToday += Number(r.done_today)
        }

        setDailyGoal(Math.ceil(Math.max(scopeTotal - scopeDoneAll, 0) / daysLeft))
        setTodayLongDone(scopeDoneToday)
      } else {
        setDailyGoal(0)
        setTodayLongDone(0)
      }

      // Daily targets progress
      if (dailyTargets.length > 0) {
        const targetSubjects = [...new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))]

        const { data: dt, error: dtErr } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid,
          p_plan_reset_at: dailyResetAt || null,
          p_today_since: today,
          p_subjects: targetSubjects,
          p_subject_resets: subjectResetAt,
        })
        if (cancelled) return
        if (dtErr) { console.error('PlanProgress dt:', dtErr); return }
        const dtRows = dt as { subject: string; total: number; done_all: number; done_today: number }[] | null

        const subjTotal = new Map<string, number>()
        const subjDoneAll = new Map<string, number>()
        const subjDoneToday = new Map<string, number>()
        for (const r of (dtRows ?? [])) {
          subjTotal.set(r.subject, Number(r.total))
          subjDoneAll.set(r.subject, Number(r.done_all))
          subjDoneToday.set(r.subject, Number(r.done_today))
        }

        // Compute daily goal for targets with deadlines
        const deadlineTargets = dailyTargets.filter((t) => t.deadline)
        let computedGoal = 0
        for (const target of deadlineTargets) {
          const daysLeft = Math.max(Math.ceil((new Date(target.deadline!).getTime() - Date.now()) / 86400000), 1)
          for (const subj of target.subjects) {
            const total = subjTotal.get(subj.subject) ?? 0
            const doneSubj = subjDoneAll.get(subj.subject) ?? 0
            computedGoal += Math.ceil(Math.max(total - doneSubj, 0) / daysLeft)
          }
        }
        const manualTotal = dailyTargets
          .filter((t) => !t.deadline)
          .reduce((s, t) => s + t.subjects.reduce((sum, subj) => sum + subj.count, 0), 0)
        setDailyTargetGoal(computedGoal + manualTotal)

        setTargetProgress(dailyTargets.map((t) => ({
          subjects: t.subjects.map((s) => ({
            subject: s.subject,
            count: s.count,
            done: Math.min(subjDoneToday.get(subjectKey(s.subject)) ?? 0, s.count),
          })),
          total: t.subjects.reduce((sum, s) => sum + s.count, 0),
          totalDone: t.subjects.reduce((sum, s) => sum + Math.min(subjDoneToday.get(subjectKey(s.subject)) ?? 0, s.count), 0),
        })))
      } else {
        setTargetProgress([])
        setDailyTargetGoal(0)
      }
      } catch (e) { console.error('PlanProgress load:', e) }
      if (!cancelled) setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, deadline, planResetAt, dailyResetAt, planSubjects.join(','), JSON.stringify(dailyTargets), JSON.stringify(subjectResetAt), version])

  // Listen for direct refresh events — bypass React batching entirely
  useEffect(() => {
    const handler = () => { useRefreshStore.getState().bump() }
    const onVisible = () => { handler() }
    window.addEventListener('plan-progress-refresh', handler)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('plan-progress-refresh', handler)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Refresh at Beijing midnight (UTC 16:00)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      const now = new Date()
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0))
      if (now >= next) next.setUTCDate(next.getUTCDate() + 1)
      const ms = next.getTime() - now.getTime()
      timer = setTimeout(() => {
        useRefreshStore.getState().bump()
        schedule()
      }, ms)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  if (!user) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border px-2.5 py-1.5 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:block h-3 w-8 animate-pulse rounded bg-muted" />
          <div className="h-2 w-10 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-6 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:block h-3 w-6 animate-pulse rounded bg-muted" />
          <div className="h-2 w-10 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  const hasDailyTargets = dailyTargets.length > 0
  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)
  const effectiveTotal = dailyTargetGoal
  const dailyPct = effectiveTotal > 0 ? Math.min(Math.round((doneDaily / effectiveTotal) * 100), 100) : 0
  const dailyDone = doneDaily >= effectiveTotal && effectiveTotal > 0

  const hasDeadline = !!deadline
  const longPct = dailyGoal > 0 ? Math.min(Math.round((todayLongDone / dailyGoal) * 100), 100) : 0

  const longCompleted = !hasDeadline
  const dailyCompleted = !hasDailyTargets || dailyDone
  const bothCompleted = longCompleted && dailyCompleted

  if (!deadline && !hasDailyTargets) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="text-xs border border-dashed border-border rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {t('plan.setDeadline')}
        </button>
        <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-3 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors min-w-0"
      >
        {bothCompleted ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
            <Check className="hidden sm:inline h-3.5 w-3.5" />
            <span className="hidden sm:inline">恭喜，你已经完成所有目标！</span>
            <span className="sm:hidden">✓全部完成！</span>
          </span>
        ) : (
          <>
            {hasDeadline && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="hidden sm:inline text-muted-foreground text-[10px]">{t('plan.longTerm')}</span>
                <Progress value={longPct} className="w-10 h-2 [&>div]:bg-blue-500" />
                <span className="tabular-nums shrink-0 text-[10px]">{todayLongDone}/{dailyGoal}</span>
              </div>
            )}
            {hasDailyTargets && (dailyDone ? (
              <span className="flex items-center gap-1 text-pink-600 dark:text-pink-400 font-medium">
                <Check className="hidden sm:inline h-3.5 w-3.5" />
                <span className="hidden sm:inline">自定义目标完成</span>
                <span className="sm:hidden">自定义✓</span>
              </span>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <span className="hidden sm:inline text-muted-foreground text-[10px]">{t('plan.daily')}</span>
                <Progress value={dailyPct} className="w-10 h-2 [&>div]:bg-pink-500" />
                <span className="tabular-nums shrink-0 text-[10px]">{doneDaily}/{effectiveTotal}</span>
              </div>
            ))}
          </>
        )}
      </button>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
