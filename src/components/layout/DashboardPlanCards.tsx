import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import { PlanGanttChart, CUSTOM_PINK, PLAN_BLUE } from './PlanGanttChart'
import { Progress } from '@/components/ui/progress'
import { resolveGoals, resolveRounds } from '@/types'
import {
  buildGoalItems, buildRoundItems, dailyPace, fetchPlanStats, goalPace, goalPlanSpec, roundPlanSpec, subjectPaces,
  type PlanItem,
} from '@/hooks/use-plan-completion'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

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

export function DashboardPlanCards() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const deadline = profile?.deadline ?? null
  const planResetAt = profile?.plan_reset_at ?? null
  const subjectResetAt = profile?.subject_reset_at ?? null
  const planSubjects = getPlanSubjects(profile)
  const [dialogOpen, setDialogOpen] = useState(false)

  const roundList = useMemo(() => resolveRounds(profile), [profile])
  const goalList = useMemo(() => resolveGoals(profile), [profile])
  const [rounds, setRounds] = useState<PlanItem[]>([])
  const [goals, setGoals] = useState<PlanItem[]>([])
  const [tab, setTab] = useState<'long-term' | 'custom'>('long-term')
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)

  const [totalScope, setTotalScope] = useState(0)
  const [totalDone, setTotalDone] = useState(0)
  const [yesterdayDone, setYesterdayDone] = useState(0)
  /** 每个学科的题量进度, 用来算没排轮次的那些学科每天还要多少题 */
  const [ltRows, setLtRows] = useState<{ subject: string; total: number; doneAll: number }[]>([])

  const [acc, setAcc] = useState<{ today: number; pct: number; delta: number | null } | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  /** 错题 ∪ 收藏 去重后的题数(计划学科范围内) */
  const [reviewCount, setReviewCount] = useState<number | null>(null)

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
        setLtRows((lt ?? []).map((r) => ({
          subject: r.subject,
          total: Number(r.total),
          doneAll: Number(r.done_all),
        })))
      } else {
        setTotalScope(0)
        setLtRows([])
      }

      const [roundStats, goalStats] = await Promise.all([
        roundList.length > 0 ? fetchPlanStats(uid, roundPlanSpec(roundList, profile)) : Promise.resolve(null),
        goalList.length > 0 ? fetchPlanStats(uid, goalPlanSpec(goalList)) : Promise.resolve(null),
      ])
      if (cancelled) return
      setRounds(roundStats ? buildRoundItems(roundList, roundStats) : [])
      setGoals(goalStats ? buildGoalItems(goalList, goalStats) : [])
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, deadline, planResetAt, subjectResetAt, planSubjects.join(','), version, roundList, goalList])

  // 错题 ∪ 收藏 的去重题数(计划学科范围内), 用于把复习量并进今日任务
  useEffect(() => {
    if (!user) return
    let live = true
    const subs = [...new Set([...planSubjects, ...goalList.map((g) => g.subject)])]
    void supabase.rpc('get_review_count', {
      p_user_id: user.id,
      p_subjects: subs.length > 0 ? subs : null,
    }).then(({ data }) => {
      if (live) setReviewCount(data == null ? null : Number(data))
    })
    return () => { live = false }
  }, [user?.id, planSubjects.join(','), goalList, version])

  if (!user) return null

  const todayDelta = totalDone - yesterdayDone
  const roundSubjects = new Set(rounds.map((r) => r.subject))

  // 自定义计划: 还没刷完的批次一共还差多少题 / 已经刷完几批
  const goalRest = goals.filter((g) => g.state !== 'done').reduce((sum, g) => sum + Math.max(g.quantity - g.done, 0), 0)
  const goalDoneCount = goals.filter((g) => g.state === 'done').length
  const goalPct = goals.length > 0 ? Math.round((goalDoneCount / goals.length) * 100) : 0
  // 自定义计划也按排期算每天的量(和顶部菜单同一个口径)
  const goalPerDay = goalPace(goals, nowMs)
  const dayLeft = deadline ? Math.max(Math.ceil((new Date(deadline).getTime() - nowMs) / 86400000), 0) : null
  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 100) : 0
  const yestSegPct = totalScope > 0 ? (yesterdayDone / totalScope) * 100 : 0
  const todaySegPct = totalScope > 0 ? (todayDelta / totalScope) * 100 : 0
  const longDailyGoal = deadline
    ? dailyPace(
        rounds,
        ltRows.reduce((sum, r) => sum + (roundSubjects.has(r.subject) ? 0 : Math.max(r.total - r.doneAll, 0)), 0),
        deadline,
        nowMs,
      )
    : 0

  // 选中的记录: 默认落在最紧的那个还没刷完的, 全刷完了就落在最后一条
  const pickActive = (list: PlanItem[]) => list
    .filter((r) => r.state !== 'done')
    .reduce<PlanItem | null>((best, r) => (!best || r.target < best.target ? r : best), null)
    ?? list[list.length - 1]
  const activeRound = rounds.find((r) => r.id === selectedRoundId) ?? pickActive(rounds)
  const activeGoal = goals.find((g) => g.id === selectedGoalId) ?? pickActive(goals)
  const showCustom = tab === 'custom' && goals.length > 0

  // 每个学科"下一个还没刷完的轮次" + 该科一共几轮
  const subjectMap = new Map<string, { subject: string; round: number; totalRounds: number; next?: PlanItem }>()
  for (const r of rounds) {
    const cur = subjectMap.get(r.subject) ?? { subject: r.subject, round: 0, totalRounds: 0 }
    cur.totalRounds++
    cur.round = Math.max(cur.round, r.index)
    if (r.state !== 'done' && (!cur.next || r.target < cur.next.target)) cur.next = r
    subjectMap.set(r.subject, cur)
  }
  const subjectRows = [...subjectMap.values()]
  const paceBySubject = new Map(subjectPaces(rounds, nowMs).map((p) => [p.subject, p]))

  // 自定义计划: 每个学科下一个还没刷完的批次
  const goalSubjectMap = new Map<string, { subject: string; totalBatches: number; rest: number; next?: PlanItem }>()
  for (const g of goals) {
    const cur = goalSubjectMap.get(g.subject) ?? { subject: g.subject, totalBatches: 0, rest: 0 }
    cur.totalBatches++
    if (g.state !== 'done') {
      cur.rest += Math.max(g.quantity - g.done, 0)
      if (!cur.next || g.target < cur.next.target) cur.next = g
    }
    goalSubjectMap.set(g.subject, cur)
  }
  const goalSubjectRows = [...goalSubjectMap.values()]

  // 错题 ∪ 收藏(按题目去重, 计划学科范围内) —— 也算进今日任务
  const reviewSubjects = [...new Set([...roundSubjects, ...goalSubjectMap.keys()])]
  const reviewGoal = reviewCount ?? 0

  const stateTone = (state?: PlanItem['state']) => state === 'done'
    ? 'text-emerald-600 dark:text-emerald-400'
    : state === 'overdue' ? 'text-destructive'
      : state === 'current' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
  const stateLabel = (state?: PlanItem['state']) => state === 'done'
    ? t('plan.roundStateDone')
    : state === 'overdue' ? t('plan.roundStateOverdue')
      : state === 'current' ? t('plan.roundStateCurrent') : t('plan.roundStateUpcoming')
  const daysLeftOf = (item?: PlanItem) => item && item.state !== 'done'
    ? Math.max(Math.ceil((new Date(`${item.target}T23:59:59`).getTime() - nowMs) / 86400000), 0)
    : null

  if (!deadline && goals.length === 0) return null

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
                  disabled={goals.length === 0}
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
                  <span className="tabular-nums">
                    {t('plan.batchRest')} <b className="text-sm font-semibold text-foreground">{goalRest}</b> {t('plan.questions')}
                    <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundStateDone')} {goalDoneCount}/{goals.length}{t('plan.batchesUnit')}
                    <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.aboutPerDay')} <b className="text-foreground">{goalPerDay}</b> {t('plan.perDay')}
                  </span>
                  <span>{t('plan.dailyTarget')}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-pink-500 transition-all duration-700" style={{ width: `${goalPct}%` }} />
                </div>
              </div>
            ) : deadline ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    <b className="text-sm font-semibold text-foreground">{totalDone}</b>/{totalScope} {t('plan.questions')}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{overallPct}%
                    {todayDelta > 0 && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">{t('plan.today')} +{todayDelta}</span>}
                  </span>
                  <span className="tabular-nums">{t('plan.examIn')} <b className="font-semibold text-foreground">{dayLeft}</b> {t('plan.daysUnit')}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{deadline}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {yestSegPct > 0 && <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${yestSegPct}%` }} />}
                  {todaySegPct > 0 && <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${todaySegPct}%` }} />}
                </div>
              </div>
            ) : null}

            {showCustom && goals.length > 0 && (
              <PlanGanttChart
                items={goals}
                color={CUSTOM_PINK}
                unit={t('plan.batchesUnit')}
                selectedId={activeGoal?.id ?? null}
                onSelect={setSelectedGoalId}
              />
            )}
            {!showCustom && rounds.length > 0 && (
              <PlanGanttChart
                items={rounds}
                color={PLAN_BLUE}
                unit={t('plan.roundsUnit')}
                planDeadline={deadline}
                selectedId={activeRound?.id ?? null}
                onSelect={setSelectedRoundId}
              />
            )}
            {!showCustom && rounds.length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground">{t('plan.noMilestoneHint')}</p>
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
            {!showCustom && activeRound && (
              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 truncate font-medium text-blue-600 dark:text-blue-400">
                    {activeRound.subject}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundPrefix')}{activeRound.index}{t('plan.roundsUnit')}
                  </span>
                  <span className={cn('shrink-0 text-[10px]', stateTone(activeRound.state))}>{stateLabel(activeRound.state)}</span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
                  <span>{t('plan.createdAt')} {activeRound.createdAt}</span>
                  <span><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundTarget')} {activeRound.target}</span>
                  {activeRound.doneAt
                    ? <span className="text-emerald-600 dark:text-emerald-400"><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.completedAt')} {activeRound.doneAt}</span>
                    : daysLeftOf(activeRound) !== null && <span><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.remaining')} {daysLeftOf(activeRound)} {t('plan.daysUnit')}</span>}
                </div>
                {activeRound.quantity > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Progress
                      value={Math.min((activeRound.done / activeRound.quantity) * 100, 100)}
                      className={cn('h-1 flex-1', activeRound.state === 'done' ? '[&>div]:bg-emerald-500' : '[&>div]:bg-blue-500')}
                    />
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {activeRound.state === 'done' ? activeRound.quantity : activeRound.done}/{activeRound.quantity}{t('plan.questions')}
                    </span>
                  </div>
                )}
              </div>
            )}
            {showCustom && activeGoal && (
              <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 truncate font-medium text-pink-600 dark:text-pink-400">
                    {activeGoal.subject}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundPrefix')}{activeGoal.index}{t('plan.batchesUnit')}
                  </span>
                  <span className={cn('shrink-0 text-[10px]', stateTone(activeGoal.state))}>{stateLabel(activeGoal.state)}</span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
                  <span>{t('plan.createdAt')} {activeGoal.createdAt}</span>
                  <span><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundTarget')} {activeGoal.target}</span>
                  {activeGoal.doneAt
                    ? <span className="text-emerald-600 dark:text-emerald-400"><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.completedAt')} {activeGoal.doneAt}</span>
                    : daysLeftOf(activeGoal) !== null && <span><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.remaining')} {daysLeftOf(activeGoal)} {t('plan.daysUnit')}</span>}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <Progress
                    value={activeGoal.quantity > 0 ? Math.min((activeGoal.done / activeGoal.quantity) * 100, 100) : 0}
                    className={cn('h-1 flex-1', activeGoal.state === 'done' ? '[&>div]:bg-emerald-500' : '[&>div]:bg-pink-500')}
                  />
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {activeGoal.done}/{activeGoal.quantity}{t('plan.questions')}
                  </span>
                </div>
              </div>
            )}
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
                  {t('plan.bySchedule')} {t('plan.aboutPerDay')} <b className="text-foreground">{longDailyGoal}</b> {t('plan.perDay')}
                  <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.remaining')} <b className="text-foreground">{Math.max(totalScope - totalDone, 0)}</b> {t('plan.questions')}
                </p>
              )}
              {subjectRows.map((s) => {
                const pace = paceBySubject.get(s.subject)
                return (
                  <p key={s.subject} className="flex flex-wrap gap-x-1.5 text-muted-foreground">
                    <span className="shrink-0 text-foreground/80">{s.subject}</span>
                    <span className="tabular-nums">
                      {t('plan.roundPrefix')}{s.next ? s.next.index : s.round}/{s.totalRounds}{t('plan.roundsUnit')}
                    </span>
                    {s.next
                      ? <span className={cn('tabular-nums', s.next.state === 'overdue' ? 'text-destructive' : '')}>
                         <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{s.next.target}{s.next.state === 'overdue' ? ` ${t('plan.roundStateOverdue')}` : ''}
                          {pace ? ` · ${pace.remaining}${t('plan.questions')}/${pace.days}${t('plan.daysUnit')} ≈ ${pace.perDay}${t('plan.perDay')}` : ''}
                        </span>
                      : <span className="text-emerald-600 dark:text-emerald-400"><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundsAllDone')}</span>}
                  </p>
                )
              })}
              {!deadline && <p className="text-muted-foreground/70">{t('plan.notSet')}</p>}
              {reviewGoal > 0 && (
                <p className="text-muted-foreground">
                  {t('plan.reviewIncluded')} <b className="text-foreground">{reviewGoal}</b> {t('plan.questions')}
                  <span className="ml-1 text-[10px] text-muted-foreground/70">
                    ({reviewSubjects.join(' · ')})
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-1 border-t pt-2.5">
              <div className="flex items-center gap-1.5 font-medium text-pink-600 dark:text-pink-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-pink-500" />
                {t('plan.dailyTarget')}
              </div>
              {goals.length === 0 ? (
                <p className="text-muted-foreground/70">{t('plan.noCustomHint')}</p>
              ) : goalSubjectRows.map((s) => (
                <p key={s.subject} className="flex flex-wrap gap-x-1.5 text-muted-foreground">
                  <span className="shrink-0 text-foreground/80">{s.subject}</span>
                  <span className="tabular-nums">
                    {t('plan.roundPrefix')}{s.next ? s.next.index : s.totalBatches}/{s.totalBatches}{t('plan.batchesUnit')}
                  </span>
                  {s.next
                    ? <span className="tabular-nums"><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.remaining')} {s.rest} {t('plan.questions')}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{s.next.target}</span>
                    : <span className="text-emerald-600 dark:text-emerald-400"><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t('plan.roundsAllDone')}</span>}
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