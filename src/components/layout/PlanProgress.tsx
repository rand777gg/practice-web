import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Progress } from '@/components/ui/progress'
import { PlanDialog } from './PlanDialog'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { useT } from '@/i18n/use-t'

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
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
  const planSubjects = getPlanSubjects(profile)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(0)
  const [todayLongDone, setTodayLongDone] = useState(0)
  const [targetProgress, setTargetProgress] = useState<{ subjects: { subject: string; count: number; done: number }[]; total: number; totalDone: number }[]>([])

  const hasData = dailyGoal > 0 || targetProgress.length > 0

  useEffect(() => {
    if (!user) return
    const uid = user.id
    // Only show skeleton on first load — keep current values visible during refresh
    if (!hasData) setIsLoading(true)
    async function load() {
      // Long-term goal
      if (deadline) {
        const deadlineDate = new Date(deadline + 'T23:59:59')
        const now = new Date()
        const daysLeft = Math.max(daysBetween(now, deadlineDate), 1)

        let qQuery = supabase.from('questions').select('id', { count: 'exact', head: true })
        if (planSubjects.length > 0) qQuery = qQuery.in('subject', planSubjects)
        const { count: total } = await qQuery

        let scopeIds: Set<string> | undefined
        if (planSubjects.length > 0) {
          const { data: scopeQs } = await supabase
            .from('questions')
            .select('id')
            .in('subject', planSubjects)
          scopeIds = new Set((scopeQs ?? []).map((q) => q.id))
        }

        const { data: done } = await supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', uid)

        const allDoneIds = new Set((done ?? []).map((a) => a.question_id))

        if (scopeIds) {
          let doneAll = 0
          for (const id of scopeIds) if (allDoneIds.has(id)) doneAll++
          setDailyGoal(Math.ceil(Math.max(scopeIds.size - doneAll, 0) / daysLeft))
        } else {
          setDailyGoal(Math.ceil(Math.max((total ?? 0) - allDoneIds.size, 0) / daysLeft))
        }

        // Today's count in long-term scope
        const { data: todayData } = await supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', uid)
          .gte('answered_at', todayStart())

        const todayIds = new Set((todayData ?? []).map((a) => a.question_id))
        if (scopeIds) {
          let todayCount = 0
          for (const id of scopeIds) if (todayIds.has(id)) todayCount++
          setTodayLongDone(todayCount)
        } else {
          setTodayLongDone(todayIds.size)
        }
      } else {
        setDailyGoal(0)
        setTodayLongDone(0)
      }

      // Daily targets progress
      if (dailyTargets.length > 0) {
        const { data: today } = await supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', uid)
          .gte('answered_at', todayStart())

        const todayIds = new Set((today ?? []).map((a) => a.question_id))

        const { data: todayQs } = await supabase
          .from('questions')
          .select('id, subject')
          .in('id', [...todayIds])

        const subjectCounts = new Map<string, number>()
        for (const q of (todayQs ?? [])) {
          const s = subjectKey(q.subject)
          subjectCounts.set(s, (subjectCounts.get(s) ?? 0) + 1)
        }

        setTargetProgress(dailyTargets.map((t) => {
          const subjects = t.subjects.map(s => ({
            subject: s.subject,
            count: s.count,
            done: Math.min(subjectCounts.get(subjectKey(s.subject)) ?? 0, s.count),
          }))
          const totalCount = subjects.reduce((sum, s) => sum + s.count, 0)
          const totalDone = subjects.reduce((sum, s) => sum + s.done, 0)
          return { subjects, total: totalCount, totalDone }
        }))
      } else {
        setTargetProgress([])
      }
      setIsLoading(false)
    }
    load()
  }, [user, deadline, planSubjects.join(','), JSON.stringify(dailyTargets), version])

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
  const totalDaily = dailyTargets.reduce((s, t) => s + t.subjects.reduce((sum, subj) => sum + subj.count, 0), 0)
  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)
  const dailyPct = totalDaily > 0 ? Math.min(Math.round((doneDaily / totalDaily) * 100), 100) : 0
  const dailyDone = doneDaily >= totalDaily && totalDaily > 0
  const longDone = dailyGoal > 0 && todayLongDone >= dailyGoal

  const longPct = dailyGoal > 0 ? Math.min(Math.round((todayLongDone / dailyGoal) * 100), 100) : 0

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
        {deadline && dailyGoal > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline text-muted-foreground text-[10px]">{t('plan.longTerm')}</span>
            <Progress value={longPct} className="w-10 h-2 [&>div]:bg-blue-500" />
            <span className="tabular-nums shrink-0 text-[10px]">
              {longDone ? '✓' : `${todayLongDone}/${dailyGoal}`}
            </span>
          </div>
        )}
        {hasDailyTargets && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline text-muted-foreground text-[10px]">{t('plan.daily')}</span>
            <Progress value={dailyPct} className="w-10 h-2 [&>div]:bg-pink-500" />
            <span className="tabular-nums shrink-0 text-[10px]">
              {dailyDone ? '✓' : `${doneDaily}/${totalDaily}`}
            </span>
          </div>
        )}
      </button>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
