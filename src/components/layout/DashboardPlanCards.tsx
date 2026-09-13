import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets, normalizeMilestones } from '@/types'
import { fetchMilestoneProgress, buildMilestoneProgress, type PlanMilestoneProgress, type PlanSubjectProgress, type PlanTargetGroup } from '@/hooks/use-plan-completion'
import { PlanProgressOverview } from './PlanProgressOverview'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

function todayStart(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0))
  if (now < d) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
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

export function DashboardPlanCards() {
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

  const milestoneList = useMemo(
    () => normalizeMilestones(profile?.milestones),
    [profile?.milestones],
  )
  const [milestones, setMilestones] = useState<PlanMilestoneProgress[]>([])
  const [longTermRows, setLongTermRows] = useState<PlanSubjectProgress[]>([])
  const [showDetail, setShowDetail] = useState(false)

  const [totalScope, setTotalScope] = useState(0)
  const [totalDone, setTotalDone] = useState(0)
  const [yesterdayDone, setYesterdayDone] = useState(0)

  const [targetProgress, setTargetProgress] = useState<{ subjects: { subject: string; count: number; done: number; missingKp: number }[]; total: number; totalDone: number }[]>([])
  const [dailyTargetGoal, setDailyTargetGoal] = useState(0)
  const [customTargetTotal, setCustomTargetTotal] = useState(0)
  const [customTargetDone, setCustomTargetDone] = useState(0)
  const [, setCustomTargetTodayDone] = useState(0)

  const [acc, setAcc] = useState<{ today: number; pct: number; delta: number | null } | null>(null)
  const [streak, setStreak] = useState<number | null>(null)

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!user) return
    let live = true
    supabase.rpc('get_accuracy_change', { p_user_id: user.id }).then(({ data: rows }) => {
      if (!live) return
      const list = ((rows ?? []) as {
        today_correct: number; today_total: number; yesterday_correct: number; yesterday_total: number
      }[])
      let tc = 0, tt = 0, yc = 0, yt = 0
      for (const r of list) {
        tc += Number(r.today_correct); tt += Number(r.today_total)
        yc += Number(r.yesterday_correct); yt += Number(r.yesterday_total)
      }
      const pct = tt > 0 ? Math.round((tc / tt) * 100) : 0
      const yp = yt > 0 ? Math.round((yc / yt) * 100) : 0
      setAcc({ today: tt, pct, delta: tt > 0 && yt > 0 ? pct - yp : null })
    }, () => { /* noop */ })
    supabase.from('user_daily_stats').select('date,total').eq('user_id', user.id).order('date', { ascending: false }).limit(400)
      .then(({ data: rows }) => {
        if (!live) return
        const days = new Set(((rows ?? []) as { date: string; total: number }[]).filter((r) => Number(r.total) > 0).map((r) => r.date))
        let n = 0
        const t = new Date()
        while (days.has(t.toISOString().slice(0, 10))) {
          n++
          t.setTime(t.getTime() - 86400000)
        }
        setStreak(n)
      }, () => { /* noop */ })
    return () => { live = false }
  }, [user])

  useEffect(() => {
    if (!user) return
    const uid = user.id
    let cancelled = false
    async function load() {
      const today = todayStart()

      if (deadline) {
        const { data: lt } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid, p_plan_reset_at: planResetAt || null, p_today_since: today,
          p_subjects: planSubjects.length > 0 ? planSubjects : null,
          p_subject_resets: subjectResetAt,
        }) as { data: { subject: string; total: number; done_all: number; done_today: number }[] | null }
        if (cancelled) return

        let scopeTotal = 0, scopeDoneAll = 0, scopeDoneToday = 0
        for (const r of (lt ?? [])) {
          scopeTotal += Number(r.total); scopeDoneAll += Number(r.done_all); scopeDoneToday += Number(r.done_today)
        }
        if (cancelled) return
        setTotalScope(scopeTotal)
        setTotalDone(scopeDoneAll)
        setYesterdayDone(scopeDoneAll - scopeDoneToday)
        setLongTermRows((lt ?? []).map((r) => ({
          subject: r.subject,
          total: Number(r.total),
          doneAll: Number(r.done_all),
          doneToday: Number(r.done_today),
        })))
      } else {
        setLongTermRows([])
      }

      if (dailyTargets.length > 0) {
        const targetSubjects = [...new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))]

        const { data: dt } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid,
          p_plan_reset_at: dailyResetAt || null,
          p_today_since: today,
          p_subjects: targetSubjects,
          p_subject_resets: subjectResetAt,
        }) as { data: { subject: string; total: number; done_all: number; done_today: number; missing_kp?: number }[] | null }
        if (cancelled) return

        const subjTotal = new Map<string, number>()
        const subjDoneAll = new Map<string, number>()
        const subjDoneToday = new Map<string, number>()
        const subjMissingKp = new Map<string, number>()
        let totalAll = 0
        for (const r of (dt ?? [])) {
          subjTotal.set(r.subject, Number(r.total))
          subjDoneAll.set(r.subject, Number(r.done_all))
          subjDoneToday.set(r.subject, Number(r.done_today))
          subjMissingKp.set(r.subject, Number(r.missing_kp ?? 0))
          totalAll += Number(r.total)
        }
        const totalDoneAll = [...subjDoneAll.values()].reduce((a, b) => a + b, 0)
        const totalDoneToday = [...subjDoneToday.values()].reduce((a, b) => a + b, 0)
        if (cancelled) return
        setCustomTargetTotal(totalAll)
        setCustomTargetDone(totalDoneAll)
        setCustomTargetTodayDone(totalDoneToday)

        // Daily goal for deadline targets
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
            missingKp: subjMissingKp.get(subjectKey(s.subject)) ?? 0,
          })),
          total: t.subjects.reduce((sum, s) => sum + s.count, 0),
          totalDone: t.subjects.reduce((sum, s) => sum + Math.min(subjDoneToday.get(subjectKey(s.subject)) ?? 0, s.count), 0),
        })))
      } else {
        setTargetProgress([])
        setDailyTargetGoal(0)
        setCustomTargetTotal(0)
        setCustomTargetDone(0)
        setCustomTargetTodayDone(0)
      }

      if (milestoneList.length > 0) {
        const rows = await fetchMilestoneProgress(uid, milestoneList)
        if (cancelled) return
        setMilestones(buildMilestoneProgress(milestoneList, rows))
      } else {
        setMilestones([])
      }

    }
    load()
    return () => { cancelled = true }
  }, [user?.id, deadline, planResetAt, dailyResetAt, planSubjects.join(','), JSON.stringify(dailyTargets), version, milestoneList])

  if (!user) return null

  const todayDelta = totalDone - yesterdayDone
  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)

  // 自定义计划: 交给总览矩阵的"今日"列(组内学科合并)
  const overviewTargets: PlanTargetGroup[] = targetProgress.map((g, i) => ({
    deadline: dailyTargets[i]?.deadline ?? null,
    subjects: g.subjects.map((s) => ({ subject: s.subject, count: s.count, done: s.done })),
    total: g.total,
    totalDone: g.totalDone,
  }))

  const useTodayGoal = dailyTargetGoal > 0
  const todayGoal = useTodayGoal ? dailyTargetGoal : customTargetTotal
  const todayDone = useTodayGoal ? doneDaily : customTargetDone
  const todayPct = todayGoal > 0 ? Math.min(100, Math.round((todayDone / todayGoal) * 100)) : 0
  const dayLeft = deadline ? Math.max(Math.ceil((new Date(deadline).getTime() - nowMs) / 86400000), 0) : null
  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 100) : 0
  const yestSegPct = totalScope > 0 ? (yesterdayDone / totalScope) * 100 : 0
  const todaySegPct = totalScope > 0 ? (todayDelta / totalScope) * 100 : 0

  if (!deadline && dailyTargets.length === 0) return null

  return (
    <>
      <Card
        className="min-w-0 cursor-pointer border-0 shadow-none transition-colors hover:bg-accent/30"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              {t('plan.title')}
              <span className="text-[10px] font-normal text-muted-foreground">{t('plan.clickToEdit')}</span>
            </CardTitle>
            {deadline && (
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                {t('plan.examIn')}
                <b className="text-lg font-semibold leading-none text-foreground">{dayLeft}</b>
                {t('plan.daysUnit')}
                <span className="text-muted-foreground/70">{deadline}</span>
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* 长期计划 — 蓝 */}
          {deadline && (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  {t('plan.longTerm')}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  <b className="text-sm font-semibold text-foreground">{totalDone}</b>/{totalScope} {t('plan.questions')}
                  {' · '}{overallPct}%
                  {todayDelta > 0 && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">{t('plan.today')} +{todayDelta}</span>}
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {yestSegPct > 0 && <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${yestSegPct}%` }} />}
                {todaySegPct > 0 && <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${todaySegPct}%` }} />}
              </div>
            </div>
          )}

          {/* 里程碑旗帜时间轴 */}
          {milestones.length > 0 && (
            <div className={cn(deadline && 'border-t pt-2.5')}>
              <PlanProgressOverview
                milestones={milestones}
                planDeadline={deadline}
                longTerm={longTermRows}
                targets={overviewTargets}
                compact={!showDetail}
              />
            </div>
          )}

          {/* 自定义计划 — 粉 */}
          {dailyTargets.length > 0 && (
            <div className={cn((deadline || milestones.length > 0) && 'border-t pt-2.5', 'space-y-1')}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-pink-600 dark:text-pink-400">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-pink-500" />
                  {t('plan.dailyTarget')}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t('plan.today')} <b className="text-sm font-semibold text-foreground">{todayDone}</b>/{todayGoal} {t('plan.questions')} · {todayPct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-pink-500 transition-all duration-700" style={{ width: `${todayPct}%` }} />
              </div>
            </div>
          )}

          {milestones.length > 0 && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1 rounded-md py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setShowDetail((v) => !v) }}
            >
              {showDetail ? t('plan.hideDetail') : t('plan.showSubjectDetail')}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showDetail && 'rotate-180')} />
            </button>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('plan.todayAccuracy')}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{acc ? `${acc.pct}%` : '—'}</p>
          <p className={cn('mt-0.5 text-[11px]', acc?.delta != null && (acc.delta >= 0 ? 'text-green-500' : 'text-red-500'))}>
            {acc == null ? '统计中…' : acc.delta == null ? '数据不足' : `${acc.delta >= 0 ? '↑' : '↓'} ${Math.abs(acc.delta)}% ${t('plan.vsYesterday')}`}
          </p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('plan.streak')}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{streak != null ? `${streak} ${t('plan.daysUnit')}` : '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t('plan.streakHint')}</p>
        </div>
      </div>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
