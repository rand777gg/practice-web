import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import { Check, TrendingUp, TrendingDown } from 'lucide-react'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
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

    }
    load()
    return () => { cancelled = true }
  }, [user?.id, deadline, planResetAt, dailyResetAt, planSubjects.join(','), JSON.stringify(dailyTargets), version])

  if (!user) return null

  const changeFromYesterday = totalDone - yesterdayDone
  const changePct = yesterdayDone > 0 ? Math.round((Math.abs(changeFromYesterday) / yesterdayDone) * 1000) / 10 : null
  const isUp = changeFromYesterday >= 0

  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)

  const useTodayGoal = dailyTargetGoal > 0
  const todayGoal = useTodayGoal ? dailyTargetGoal : customTargetTotal
  const todayDone = useTodayGoal ? doneDaily : customTargetDone
  const todayDoneLabel = useTodayGoal ? '今日' : '累计'
  const todayPct = todayGoal > 0 ? Math.min(100, Math.round((todayDone / todayGoal) * 100)) : 0
  const dayLeft = deadline ? Math.max(Math.ceil((new Date(deadline).getTime() - nowMs) / 86400000), 0) : null
  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 100) : 0
  const yestSegPct = totalScope > 0 ? (yesterdayDone / totalScope) * 100 : 0
  const todaySegPct = totalScope > 0 ? ((totalDone - yesterdayDone) / totalScope) * 100 : 0

  const nearestDeadline = dailyTargets.filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  const deadlineText = nearestDeadline ? (() => {
    const diff = new Date(nearestDeadline.deadline!).getTime() - nowMs
    if (diff <= 0) return t('plan.deadlinePassed')
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const remaining = dailyTargetGoal - doneDaily
    const timePart = d > 0 ? `还剩${d}天${h}小时` : h > 0 ? `还剩${h}小时${m}分钟` : `还剩${m}分钟`
    return `${timePart}，还有${Math.max(remaining, 0)}道题哦，加油！`
  })() : null

  if (!deadline && dailyTargets.length === 0) return null

  return (
    <>
      <div className={cn('grid gap-4', deadline && dailyTargets.length > 0 ? 'lg:grid-cols-5' : '')}>
        {deadline && (
          <Card
            className={cn(
              'min-w-0 border-0 shadow-none cursor-pointer hover:bg-accent/30 transition-colors group',
              dailyTargets.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5',
            )}
            onClick={() => setDialogOpen(true)}
          >
            <CardHeader className="pb-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  {t('plan.longTerm')}
                  <span className="text-[10px] text-muted-foreground font-normal">点击调整</span>
                </CardTitle>
                {changePct != null && changePct > 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                    {t('plan.vsYesterday')} {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} {changePct.toFixed(1)}%
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <div className="flex items-end gap-2.5 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold tabular-nums tracking-tight leading-none">{dayLeft}</span>
                  <span className="text-sm text-muted-foreground">天</span>
                </div>
                <div className="pb-0.5">
                  <p className="text-xs text-muted-foreground">距考试还有</p>
                  <p className="text-[11px] text-muted-foreground/70">总题量 {totalScope} 题 · 待刷 {Math.max(totalScope - totalDone, 0)} 题</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {yestSegPct > 0 && <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${yestSegPct}%` }} />}
                  {todaySegPct > 0 && <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${todaySegPct}%` }} />}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    已完成 <b className="tabular-nums text-foreground font-semibold">{totalDone}</b>/{totalScope} · 总体 <b className="tabular-nums text-foreground font-semibold">{overallPct}%</b>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-[3px] bg-blue-500" />昨日 {Math.round(yestSegPct)}%</span>
                    <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-[3px] bg-green-500" />今日 {Math.round(todaySegPct)}%</span>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {dailyTargets.length > 0 && (
          <Card
            className={cn(
              'min-w-0 border-0 shadow-none cursor-pointer hover:bg-accent/30 transition-colors',
              deadline ? 'lg:col-span-2' : 'lg:col-span-5',
            )}
            onClick={() => setDialogOpen(true)}
          >
            <CardHeader className="pb-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                  {t('plan.dailyTarget')}
                  <span className="text-[10px] text-muted-foreground font-normal">点击调整</span>
                </CardTitle>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {todayDoneLabel} <b className="text-foreground font-semibold">{todayDone}</b>/{todayGoal}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-pink-500 transition-all duration-700" style={{ width: `${todayPct}%` }} />
                </div>
                <span className="text-[11px] font-medium tabular-nums text-foreground w-8 text-right">{todayPct}%</span>
              </div>
              <div className="space-y-1">
                {targetProgress.map((tp, i) => (
                  <div key={i} className="space-y-0.5">
                    {tp.subjects.map((subj) => {
                      const subjDone = subj.done >= subj.count
                      return (
                        <div key={subj.subject} className="flex items-center gap-1.5 text-xs">
                          <span className={subjDone ? 'text-green-500' : 'text-muted-foreground'}>
                            {subjDone ? <Check className="h-3 w-3" /> : <span className="inline-block w-3 h-3 rounded-full border border-current" />}
                          </span>
                          <span className={cn('truncate', subjDone && 'line-through text-muted-foreground')}>{subj.subject}</span>
                          <span className="ml-auto flex-none text-muted-foreground tabular-nums">
                            {subj.done}/{subj.count}
                            {subj.missingKp > 0 && (
                              <Link to={`/admin/questions?subject=${encodeURIComponent(subj.subject)}&kp=__none__`} className="ml-1.5 text-amber-500 hover:text-amber-600 underline text-[10px]">
                                {subj.missingKp}题缺知识点
                              </Link>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {deadlineText && <p className="pt-0.5 text-[11px] text-muted-foreground truncate">— {deadlineText}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">今日目标</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{todayGoal > 0 ? `${todayDone}/${todayGoal}` : '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{todayGoal > 0 ? `已完成 ${todayPct}%` : '未设置每日目标'}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">今日正确率</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{acc ? `${acc.pct}%` : '—'}</p>
          <p className={cn('mt-0.5 text-[11px]', acc?.delta != null && (acc.delta >= 0 ? 'text-green-500' : 'text-red-500'))}>
            {acc == null ? '统计中…' : acc.delta == null ? '数据不足' : `${acc.delta >= 0 ? '↑' : '↓'} ${Math.abs(acc.delta)}% vs 昨日`}
          </p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">连续打卡</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{streak != null ? `${streak} 天` : '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">今天也要保持节奏</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">冲刺总进度</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{totalScope > 0 ? `${totalDone}/${totalScope}` : '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{totalScope > 0 ? `总体完成 ${overallPct}%` : '先设定长期计划'}</p>
        </div>
      </div>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
