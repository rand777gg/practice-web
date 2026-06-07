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
  const planSubjects = getPlanSubjects(profile)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Long-term
  const [totalScope, setTotalScope] = useState(0)
  const [totalDone, setTotalDone] = useState(0)
  const [yesterdayDone, setYesterdayDone] = useState(0)

  // Daily targets
  const [targetProgress, setTargetProgress] = useState<{ subjects: { subject: string; count: number; done: number }[]; total: number; totalDone: number }[]>([])

  useEffect(() => {
    if (!user) return
    const uid = user.id
    async function load() {
      if (deadline) {
        let scopeIds: Set<string>
        if (planSubjects.length > 0) {
          const { data: scopeQs } = await supabase
            .from('questions')
            .select('id')
            .in('subject', planSubjects)
          scopeIds = new Set((scopeQs ?? []).map((q) => q.id))
        } else {
          const { data: allQs } = await supabase.from('questions').select('id')
          scopeIds = new Set((allQs ?? []).map((q) => q.id))
        }

        const { data: done } = await supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', uid)

        const doneIds = new Set((done ?? []).map((a) => a.question_id))
        let doneAll = 0
        for (const id of scopeIds) if (doneIds.has(id)) doneAll++

        setTotalScope(scopeIds.size)
        setTotalDone(doneAll)

        // Yesterday's count (answers before today)
        const { data: doneBeforeToday } = await supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', uid)
          .lt('answered_at', todayStart())

        const yesterdayIds = new Set((doneBeforeToday ?? []).map((a) => a.question_id))
        let doneBefore = 0
        for (const id of scopeIds) if (yesterdayIds.has(id)) doneBefore++
        setYesterdayDone(doneBefore)
      }

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
      }
    }
    load()
  }, [user, deadline, planSubjects.join(','), JSON.stringify(dailyTargets), version])

  if (!user) return null

  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 100) : 0
  const changeFromYesterday = totalDone - yesterdayDone
  const changePct = yesterdayDone > 0 ? Math.round((Math.abs(changeFromYesterday) / yesterdayDone) * 100) : null
  const isUp = changeFromYesterday >= 0

  const totalDaily = dailyTargets.reduce((s, t) => s + t.subjects.reduce((sum, subj) => sum + subj.count, 0), 0)
  const doneDaily = targetProgress.reduce((s, t) => s + t.totalDone, 0)
  const dailyPct = totalDaily > 0 ? Math.min(Math.round((doneDaily / totalDaily) * 100), 100) : 0

  // Nearest deadline
  const nearestDeadline = dailyTargets
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]

  const remainingLabel = nearestDeadline ? (() => {
    const diff = new Date(nearestDeadline.deadline!).getTime() - Date.now()
    if (diff <= 0) return t('plan.deadlinePassed')
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const remaining = totalDaily - doneDaily
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
                <Progress value={overallPct} className="flex-1 h-2 [&>div]:bg-blue-500" />
                <span className="text-[11px] font-medium tabular-nums">{overallPct}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {t('plan.doneCount')}: {totalDone}
                {changePct != null && changePct > 0 && (
                  <span className={isUp ? 'text-green-500' : 'text-red-500'}>
                    {' '}{t('plan.vsYesterday')} {isUp ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />} {changePct}%
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {dailyTargets.length > 0 && (
          <Card className="flex-1 min-w-0 border-0 shadow-none cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDialogOpen(true)}>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm text-pink-600 dark:text-pink-400">{t('plan.dailyTarget')}</CardTitle>
                {remainingLabel && doneDaily < totalDaily && (
                  <span className="text-xs text-muted-foreground shrink-0 max-w-[60%] truncate">
                    {remainingLabel}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Progress value={dailyPct} className="flex-1 h-2 [&>div]:bg-pink-500" />
                <span className="text-[11px] font-medium tabular-nums">{doneDaily}/{totalDaily}</span>
              </div>
              <div className="space-y-1">
                {targetProgress.map((tp, i) => {
                  return (
                    <div key={i} className="space-y-0.5">
                      {tp.subjects.map((subj) => {
                        const subjDone = subj.done >= subj.count
                        return (
                          <div key={subj.subject} className="flex items-center gap-1 text-xs">
                            <span className={subjDone ? 'text-green-500' : 'text-muted-foreground'}>
                              {subjDone ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <span className="inline-block w-3 h-3 rounded-full border" />
                              )}
                            </span>
                            <span className={subjDone ? 'line-through text-muted-foreground' : ''}>
                              {subj.subject}
                            </span>
                            <span className="ml-auto text-muted-foreground tabular-nums">
                              {subj.done}/{subj.count}
                            </span>
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
