import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import { Check, TrendingUp, TrendingDown } from 'lucide-react'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { useT } from '@/i18n/use-t'

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
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
  const dailyResetAt = profile?.daily_reset_at ?? null
  const planSubjects = getPlanSubjects(profile)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [totalScope, setTotalScope] = useState(0)
  const [totalDone, setTotalDone] = useState(0)
  const [yesterdayDone, setYesterdayDone] = useState(0)

  const [targetProgress, setTargetProgress] = useState<{ subjects: { subject: string; count: number; done: number }[]; total: number; totalDone: number }[]>([])
  const [dailyTargetGoal, setDailyTargetGoal] = useState(0)
  const [customTargetTotal, setCustomTargetTotal] = useState(0)
  const [customTargetDone, setCustomTargetDone] = useState(0)
  const [customTargetTodayDone, setCustomTargetTodayDone] = useState(0)
  const [planSubjProgress, setPlanSubjProgress] = useState<{ subject: string; done: number; total: number }[]>([])
  const [targetSubjProgress, setTargetSubjProgress] = useState<{ subject: string; done: number; total: number }[]>([])

  useEffect(() => {
    if (!user) return
    const uid = user.id
    async function load() {
      const today = todayStart()

      if (deadline) {
        const longTodaySince = planResetAt || today
        const { data: lt } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid, p_plan_reset_at: planResetAt || null, p_today_since: longTodaySince,
          p_subjects: planSubjects.length > 0 ? planSubjects : null,
        }) as { data: { subject: string; total: number; done_all: number; done_today: number }[] | null }

        let scopeTotal = 0, scopeDoneAll = 0, scopeDoneToday = 0
        const planSubj: typeof planSubjProgress = []
        for (const r of (lt ?? [])) {
          scopeTotal += Number(r.total); scopeDoneAll += Number(r.done_all); scopeDoneToday += Number(r.done_today)
          planSubj.push({ subject: r.subject, done: Number(r.done_all), total: Number(r.total) })
        }
        setPlanSubjProgress(planSubj)
        setTotalScope(scopeTotal)
        setTotalDone(scopeDoneAll)
        setYesterdayDone(scopeDoneAll - scopeDoneToday)
      }

      if (dailyTargets.length > 0) {
        const dailyTodaySince = dailyResetAt || today
        const targetSubjects = [...new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))]

        const { data: dt } = await supabase.rpc('get_subject_progress', {
          p_user_id: uid,
          p_plan_reset_at: dailyResetAt || null,
          p_today_since: dailyTodaySince,
          p_subjects: targetSubjects,
        }) as { data: { subject: string; total: number; done_all: number; done_today: number }[] | null }

        const subjTotal = new Map<string, number>()
        const subjDoneAll = new Map<string, number>()
        const subjDoneToday = new Map<string, number>()
        let totalAll = 0
        for (const r of (dt ?? [])) {
          subjTotal.set(r.subject, Number(r.total))
          subjDoneAll.set(r.subject, Number(r.done_all))
          subjDoneToday.set(r.subject, Number(r.done_today))
          totalAll += Number(r.total)
        }
        const totalDoneAll = [...subjDoneAll.values()].reduce((a, b) => a + b, 0)
        const totalDoneToday = [...subjDoneToday.values()].reduce((a, b) => a + b, 0)
        const tSubjProg: typeof targetSubjProgress = []
        for (const [s, t] of subjTotal) tSubjProg.push({ subject: s, done: subjDoneAll.get(s) ?? 0, total: t })
        setTargetSubjProgress(tSubjProg)
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
        setTargetSubjProgress([])
      }
    }
    load()
  }, [user?.id, deadline, planResetAt, dailyResetAt, planSubjects.join(','), JSON.stringify(dailyTargets), version])

  if (!user) return null

  const changeFromYesterday = totalDone - yesterdayDone
  const changePct = yesterdayDone > 0 ? Math.round((Math.abs(changeFromYesterday) / yesterdayDone) * 1000) / 10 : null
  const isUp = changeFromYesterday >= 0

  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)

  const nearestDeadline = dailyTargets.filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  const deadlineText = nearestDeadline ? (() => {
    const diff = new Date(nearestDeadline.deadline!).getTime() - Date.now()
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
      <div className="flex flex-col sm:flex-row gap-4">
        {deadline && (
          <Card className="flex-1 min-w-0 border-0 shadow-none cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDialogOpen(true)}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-blue-600 dark:text-blue-400">{t('plan.longTerm')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                  {(() => {
                    const yesterdayPct = totalScope > 0 ? (yesterdayDone / totalScope) * 100 : 0
                    const todayPct = totalScope > 0 ? ((totalDone - yesterdayDone) / totalScope) * 100 : 0
                    return (
                      <>
                        {yesterdayPct > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${yesterdayPct}%` }} />}
                        {todayPct > 0 && <div className="h-full bg-green-500 transition-all" style={{ width: `${todayPct}%` }} />}
                      </>
                    )
                  })()}
                </div>
                <span className="text-[11px] font-medium tabular-nums">{totalDone}/{totalScope}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('plan.doneCount')}: {totalDone}
                {changePct != null && changePct > 0 && (
                  <span className={isUp ? 'text-green-500' : 'text-red-500'}>
                    {' '}{t('plan.vsYesterday')} {isUp ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />} {changePct.toFixed(1)}%
                  </span>
                )}
              </p>
              {planSubjProgress.length > 0 && (
                <div className="space-y-1 pt-1">
                  {planSubjProgress.map((s) => {
                    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
                    return (
                      <div key={s.subject} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-muted-foreground w-16 truncate">{s.subject}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-muted-foreground tabular-nums">{s.done}/{s.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {dailyTargets.length > 0 && (
          <Card className="flex-1 min-w-0 border-0 shadow-none cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDialogOpen(true)}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-pink-600 dark:text-pink-400">{t('plan.dailyTarget')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                  {(() => {
                    const yesterday = customTargetDone - customTargetTodayDone
                    const yPct = customTargetTotal > 0 ? (yesterday / customTargetTotal) * 100 : 0
                    const tPct = customTargetTotal > 0 ? (customTargetTodayDone / customTargetTotal) * 100 : 0
                    return (
                      <>
                        {yPct > 0 && <div className="h-full bg-pink-300 dark:bg-pink-800 transition-all" style={{ width: `${yPct}%` }} />}
                        {tPct > 0 && <div className="h-full bg-pink-500 transition-all" style={{ width: `${tPct}%` }} />}
                      </>
                    )
                  })()}
                </div>
                <span className="text-[11px] font-medium tabular-nums">{customTargetDone}/{customTargetTotal}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('plan.doneCount')}: {customTargetDone}
                {deadlineText && (
                  <span className="text-muted-foreground"> — {deadlineText}</span>
                )}
              </p>
              <div className="space-y-1">
                {targetProgress.map((tp, i) => {
                  return (
                    <div key={i} className="space-y-0.5">
                      {tp.subjects.map((subj) => {
                        const subjDone = subj.done >= subj.count
                        return (
                          <div key={subj.subject} className="flex items-center gap-1 text-xs">
                            <span className={subjDone ? 'text-green-500' : 'text-muted-foreground'}>
                              {subjDone ? <Check className="h-3 w-3" /> : <span className="inline-block w-3 h-3 rounded-full border" />}
                            </span>
                            <span className={subjDone ? 'line-through text-muted-foreground' : ''}>{subj.subject}</span>
                            <span className="ml-auto text-muted-foreground tabular-nums">{subj.done}/{subj.count}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              {targetSubjProgress.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/30">
                  {targetSubjProgress.map((s) => {
                    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
                    return (
                      <div key={s.subject} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-muted-foreground w-16 truncate">{s.subject}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-muted-foreground tabular-nums">{s.done}/{s.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
