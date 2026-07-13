import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Progress } from '@/components/ui/progress'
import { PlanDialog } from './PlanDialog'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets, getPlanTargets } from '@/types'
import { fetchTargetScopeIds, deriveAnswerSets, scopeProgress } from '@/lib/plan'
import { useT } from '@/i18n/use-t'
import { Check } from 'lucide-react'

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

function getDailyTargets(profile: { daily_targets?: string | null } | null): DailyTarget[] {
  if (!profile?.daily_targets) return []
  try { return normalizeDailyTargets(JSON.parse(profile.daily_targets)) } catch { return [] }
}

export function PlanProgress() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const deadline = profile?.deadline ?? null
  const planTargets = getPlanTargets(profile)
  const planWrongOnly = planTargets.length > 0 && planTargets.every((pt) => pt.wrongOnly)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(0)
  const [todayLongDone, setTodayLongDone] = useState(0)
  const [dailyTargetGoal, setDailyTargetGoal] = useState(0)
  const [targetProgress, setTargetProgress] = useState<{ totalDone: number }[]>([])

  const hasData = dailyGoal > 0 || targetProgress.length > 0

  useEffect(() => {
    if (!user) return
    const uid = user.id
    // Only show skeleton on first load — keep current values visible during refresh
    if (!hasData) setIsLoading(true)
    async function load() {
      const { data: answersRaw } = await supabase
        .from('user_answers')
        .select('question_id, is_correct, answered_at')
        .eq('user_id', uid)
        .order('answered_at', { ascending: false })
        .limit(5000)
      const todayISO = todayStart()
      const sets = deriveAnswerSets((answersRaw ?? []) as any[], todayISO)

      // Long-term goal — summed over all plan target groups
      if (deadline) {
        const deadlineDate = new Date(deadline + 'T23:59:59')
        const now = new Date()
        const daysLeft = Math.max(daysBetween(now, deadlineDate), 1)

        let total = 0, done = 0, todayDone = 0
        for (const target of planTargets) {
          const ids = await fetchTargetScopeIds(target)
          const p = scopeProgress(ids, sets, target.wrongOnly)
          total += p.total; done += p.done; todayDone += p.todayDone
        }
        setDailyGoal(Math.ceil(Math.max(total - done, 0) / daysLeft))
        setTodayLongDone(todayDone)
      } else {
        setDailyGoal(0)
        setTodayLongDone(0)
      }

      // Daily targets progress — scope = subjects ∩ categories ∩ keyPoints (∩ wrong if wrongOnly)
      if (dailyTargets.length > 0) {
        let goalTotal = 0
        const perTargetDone: number[] = []
        // ponytail: one scope query per target; targets are few
        for (const target of dailyTargets) {
          const ids = await fetchTargetScopeIds(target)
          const p = scopeProgress(ids, sets, target.wrongOnly)
          let goal = target.count
          if (target.deadline) {
            const daysLeft = Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
            goal = Math.ceil(Math.max(p.total - p.done, 0) / daysLeft)
          }
          goalTotal += goal
          perTargetDone.push(Math.min(p.todayDone, goal))
        }
        setDailyTargetGoal(goalTotal)
        setTargetProgress(perTargetDone.map((done) => ({ totalDone: done })))
      } else {
        setTargetProgress([])
        setDailyTargetGoal(0)
      }
      setIsLoading(false)
    }
    load()
  }, [user?.id, deadline, JSON.stringify(planTargets), JSON.stringify(dailyTargets), version])

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
  const longPct = dailyGoal > 0 ? Math.min(Math.round((todayLongDone / dailyGoal) * 100), 100) : 100
  const longDone = hasDeadline && todayLongDone >= dailyGoal

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
        {hasDeadline && (longDone ? (
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
            <Check className="hidden sm:inline h-3.5 w-3.5" />
            <span className="hidden sm:inline">{planWrongOnly ? '长期计划（错题）' : '长期目标完成'}</span>
            <span className="sm:hidden">{planWrongOnly ? '错题✓' : '长期✓'}</span>
          </span>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline text-muted-foreground text-[10px] leading-none">{planWrongOnly ? '今日错题回顾' : t('plan.longTerm')}</span>
            <Progress value={longPct} className="w-10 h-2 shrink-0 [&>div]:bg-blue-500" />
            <span className="tabular-nums shrink-0 text-[10px] leading-none">{todayLongDone}/{dailyGoal}</span>
          </div>
        ))}
        {hasDailyTargets && (dailyDone ? (
          <span className="flex items-center gap-1 text-pink-600 dark:text-pink-400 font-medium">
            <Check className="hidden sm:inline h-3.5 w-3.5" />
            <span className="hidden sm:inline">自定义目标完成</span>
            <span className="sm:hidden">自定义✓</span>
          </span>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline text-muted-foreground text-[10px] leading-none">{t('plan.daily')}</span>
            <Progress value={dailyPct} className="w-10 h-2 shrink-0 [&>div]:bg-pink-500" />
            <span className="tabular-nums shrink-0 text-[10px] leading-none">{doneDaily}/{effectiveTotal}</span>
          </div>
        ))}
      </button>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
