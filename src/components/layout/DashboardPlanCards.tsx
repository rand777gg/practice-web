import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Progress } from '@/components/ui/progress'
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
  const [customTargetTotalQuestions, setCustomTargetTotalQuestions] = useState(0)

  useEffect(() => {
    if (!user) return
    const uid = user.id
    async function load() {
      if (deadline) {
        let scopeIds: Set<string>
        if (planSubjects.length > 0) {
          const { data: scopeQs } = await supabase.from('questions').select('id').in('subject', planSubjects)
          scopeIds = new Set((scopeQs ?? []).map((q) => q.id))
        } else {
          const { data: allQs } = await supabase.from('questions').select('id')
          scopeIds = new Set((allQs ?? []).map((q) => q.id))
        }

        let doneQ1 = supabase.from('user_answers').select('question_id').eq('user_id', uid)
        if (planResetAt) doneQ1 = doneQ1.gte('answered_at', planResetAt)
        const { data: done } = await doneQ1
        const doneIds = new Set((done ?? []).map((a) => a.question_id))
        let doneAll = 0
        for (const id of scopeIds) if (doneIds.has(id)) doneAll++
        setTotalScope(scopeIds.size)
        setTotalDone(doneAll)

        let beforeQ = supabase.from('user_answers').select('question_id').eq('user_id', uid).lt('answered_at', todayStart())
        if (planResetAt) beforeQ = beforeQ.gte('answered_at', planResetAt)
        const { data: doneBeforeToday } = await beforeQ
        const yesterdayIds = new Set((doneBeforeToday ?? []).map((a) => a.question_id))
        let doneBefore = 0
        for (const id of scopeIds) if (yesterdayIds.has(id)) doneBefore++
        setYesterdayDone(doneBefore)
      }

      if (dailyTargets.length > 0) {
        const targetSubjectSet = new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))
        const allTargetSubjects = [...targetSubjectSet]

        // Today's answers
        let todayQ = supabase.from('user_answers').select('question_id').eq('user_id', uid).gte('answered_at', todayStart())
        if (dailyResetAt) todayQ = todayQ.gte('answered_at', dailyResetAt)
        const { data: today } = await todayQ
        const todayIds = new Set((today ?? []).map((a) => a.question_id))
        const { data: todayQs } = await supabase.from('questions').select('id, subject').in('id', [...todayIds])

        const subjectCounts = new Map<string, number>()
        for (const q of (todayQs ?? [])) {
          const s = subjectKey(q.subject)
          if (targetSubjectSet.has(s)) subjectCounts.set(s, (subjectCounts.get(s) ?? 0) + 1)
        }

        // Total questions for ALL target subjects (for display)
        const { data: scopeQs } = await supabase.from('questions').select('id, subject').in('subject', allTargetSubjects)
        const totalPerSubj = new Map<string, number>()
        const qSubj = new Map<string, string>()
        for (const q of (scopeQs ?? [])) {
          const s = subjectKey(q.subject)
          totalPerSubj.set(s, (totalPerSubj.get(s) ?? 0) + 1)
          qSubj.set(q.id, s)
        }
        let totalAll = 0
        for (const [, v] of totalPerSubj) totalAll += v
        setCustomTargetTotalQuestions(totalAll)

        // Daily goal for deadline targets
        const deadlineTargets = dailyTargets.filter(t => t.deadline)
        let computedGoal = 0
        if (deadlineTargets.length > 0) {
          let doneQ2 = supabase.from('user_answers').select('question_id').eq('user_id', uid)
          if (dailyResetAt) doneQ2 = doneQ2.gte('answered_at', dailyResetAt)
          const { data: allDone } = await doneQ2
          const allDoneIds = new Set((allDone ?? []).map(a => a.question_id))
          const donePerSubj = new Map<string, number>()
          for (const q of (scopeQs ?? [])) {
            if (allDoneIds.has(q.id)) {
              const s = subjectKey(q.subject)
              donePerSubj.set(s, (donePerSubj.get(s) ?? 0) + 1)
            }
          }
          for (const target of deadlineTargets) {
            const daysLeft = Math.max(Math.ceil((new Date(target.deadline!).getTime() - Date.now()) / 86400000), 1)
            for (const subj of target.subjects) {
              const total = totalPerSubj.get(subj.subject) ?? 0
              const done = donePerSubj.get(subj.subject) ?? 0
              computedGoal += Math.ceil(Math.max(total - done, 0) / daysLeft)
            }
          }
        }
        const manualTotal = dailyTargets
          .filter(t => !t.deadline)
          .reduce((s, t) => s + t.subjects.reduce((sum, subj) => sum + subj.count, 0), 0)
        setDailyTargetGoal(computedGoal + manualTotal)

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
        setDailyTargetGoal(0)
        setCustomTargetTotalQuestions(0)
      }
    }
    load()
  }, [user?.id, deadline, planResetAt, dailyResetAt, planSubjects.join(','), JSON.stringify(dailyTargets), version])

  if (!user) return null

  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 1000) / 10 : 0
  const changeFromYesterday = totalDone - yesterdayDone
  const changePct = yesterdayDone > 0 ? Math.round((Math.abs(changeFromYesterday) / yesterdayDone) * 1000) / 10 : null
  const isUp = changeFromYesterday >= 0

  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)
  const dailyPct = dailyTargetGoal > 0 ? Math.min(Math.round((doneDaily / dailyTargetGoal) * 100), 100) : 0

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
                <span className="text-[11px] font-medium tabular-nums">{overallPct.toFixed(1)}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('plan.doneCount')}: {totalDone}
                {changePct != null && changePct > 0 && (
                  <span className={isUp ? 'text-green-500' : 'text-red-500'}>
                    {' '}{t('plan.vsYesterday')} {isUp ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />} {changePct.toFixed(1)}%
                  </span>
                )}
              </p>
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
                <Progress value={dailyPct} className="flex-1 h-2 [&>div]:bg-pink-500" />
                <span className="text-[11px] font-medium tabular-nums">{doneDaily}/{customTargetTotalQuestions}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('plan.doneCount')}: {doneDaily}
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
            </CardContent>
          </Card>
        )}
      </div>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
