import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import { PlanGanttChart } from './PlanGanttChart'
import { Progress } from '@/components/ui/progress'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets, normalizeMilestones } from '@/types'
import { fetchMilestoneProgress, buildMilestoneProgress, type PlanMilestoneProgress, type PlanSubjectProgress, type PlanTargetGroup } from '@/hooks/use-plan-completion'
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
  const [tab, setTab] = useState<'long-term' | 'custom'>('long-term')
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null)

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
  const longDailyGoal = dayLeft && dayLeft > 0 && totalScope > 0 ? Math.ceil(Math.max(totalScope - totalDone, 0) / dayLeft) : 0

  const currentMilestone = milestones.find((m) => m.progress < 1 && !m.passed) ?? milestones[milestones.length - 1]
  const activeMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? currentMilestone
  const showCustom = (tab === 'custom' || !deadline) && dailyTargets.length > 0

  if (!deadline && dailyTargets.length === 0) return null

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 border-0 shadow-none lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">{t('plan.progressTitle')}</CardTitle>
              <div className="inline-flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setTab('long-term')}
                  className={cn('rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors', !showCustom ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t('plan.longTerm')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('custom')}
                  disabled={dailyTargets.length === 0}
                  className={cn('rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40', showCustom ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t('plan.dailyTarget')}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {showCustom ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{t('plan.today')} <b className="text-sm font-semibold text-foreground">{todayDone}</b>/{todayGoal} {t('plan.questions')} · {todayPct}%</span>
                  <span>{t('plan.dailyTarget')}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-pink-500 transition-all duration-700" style={{ width: `${todayPct}%` }} />
                </div>
              </div>
            ) : deadline ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    <b className="text-sm font-semibold text-foreground">{totalDone}</b>/{totalScope} {t('plan.questions')} · {overallPct}%
                    {todayDelta > 0 && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">{t('plan.today')} +{todayDelta}</span>}
                  </span>
                  <span className="tabular-nums">{t('plan.examIn')} <b className="font-semibold text-foreground">{dayLeft}</b> {t('plan.daysUnit')} · {deadline}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {yestSegPct > 0 && <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${yestSegPct}%` }} />}
                  {todaySegPct > 0 && <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${todaySegPct}%` }} />}
                </div>
              </div>
            ) : null}

            {showCustom && <PlanGanttChart mode="custom" targets={overviewTargets} />}
            {!showCustom && milestones.length > 0 && (
              <PlanGanttChart
                mode="long-term"
                milestones={milestones}
                planDeadline={deadline}
                longTerm={longTermRows}
                selectedMilestoneId={activeMilestone?.id ?? null}
                onSelectMilestone={setSelectedMilestoneId}
              />
            )}
            {!showCustom && milestones.length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground">{t('plan.noMilestoneHint')}</p>
            )}

            {!showCustom && activeMilestone && (
              <div className="space-y-1 rounded-lg border bg-muted/20 p-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
                  <span className="font-medium">
                    {t('plan.milestone')} {milestones.findIndex((x) => x.id === activeMilestone.id) + 1} · {activeMilestone.deadline}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {activeMilestone.passed && activeMilestone.progress < 1
                      ? t('plan.deadlinePassed')
                      : `${t('plan.remaining')} ${activeMilestone.daysLeft} ${t('plan.daysUnit')}`}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  {activeMilestone.subjects.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">{t('plan.milestoneNoSubject')}</span>
                  ) : activeMilestone.subjects.map((s) => (
                    <div key={s.subject} className="flex items-center gap-2 text-[11px]">
                      <span className="max-w-[40%] truncate">{s.subject}</span>
                      <Progress value={s.rounds > 0 ? Math.min((s.roundsDone / s.rounds) * 100, 100) : 0} className="h-1 flex-1 [&>div]:bg-blue-500" />
                      <span className="shrink-0 tabular-nums text-muted-foreground">{s.roundsDone}/{s.rounds} {t('plan.roundsUnit')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="min-w-0 cursor-pointer border-0 shadow-none transition-colors hover:bg-accent/30 lg:col-span-2"
          onClick={() => setDialogOpen(true)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">{t('plan.goalTitle')}</CardTitle>
              <span className="text-[10px] text-muted-foreground">{t('plan.clickToEdit')}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-[11px]">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                {t('plan.longTerm')}
                {deadline && <span className="ml-auto font-normal tabular-nums text-muted-foreground">{deadline}</span>}
              </div>
              <p className="text-muted-foreground">
                {t('plan.subjectCol')} <span className="text-foreground/80">{planSubjects.length > 0 ? planSubjects.join(' · ') : t('plan.selectHint')}</span>
              </p>
              {deadline && totalScope > 0 && (
                <p className="text-muted-foreground">
                  {t('plan.aboutPerDay')} <b className="text-foreground">{longDailyGoal}</b> {t('plan.questions')}
                  {' · '}{t('plan.remaining')} <b className="text-foreground">{Math.max(totalScope - totalDone, 0)}</b> {t('plan.questions')}
                </p>
              )}
              {milestones.map((m) => (
                <p key={m.id} className="flex gap-1.5 text-muted-foreground">
                  <span className="shrink-0 tabular-nums">{m.deadline}</span>
                  <span className="truncate text-foreground/80">{m.subjects.map((s) => `${s.subject} ${s.rounds}${t('plan.roundsUnit')}`).join(' · ')}</span>
                </p>
              ))}
              {!deadline && <p className="text-muted-foreground/70">{t('plan.notSet')}</p>}
            </div>

            <div className="space-y-1 border-t pt-2.5">
              <div className="flex items-center gap-1.5 font-medium text-pink-600 dark:text-pink-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-pink-500" />
                {t('plan.dailyTarget')}
              </div>
              {dailyTargets.length === 0 ? (
                <p className="text-muted-foreground/70">{t('plan.noCustomHint')}</p>
              ) : dailyTargets.map((target, i) => (
                <p key={i} className="flex flex-wrap gap-x-1.5 text-foreground/80">
                  {target.deadline && <span className="shrink-0 tabular-nums text-muted-foreground">{target.deadline} 前</span>}
                  <span>{target.subjects.map((s) => `${s.subject} ${s.count}${t('plan.questions')}`).join(' · ')}</span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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