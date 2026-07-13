import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlanDialog } from './PlanDialog'
import { Check, TrendingUp, TrendingDown } from 'lucide-react'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets, getPlanTargets } from '@/types'
import { fetchTargetScopeIds, deriveAnswerSets, scopeProgress } from '@/lib/plan'
import { useT } from '@/i18n/use-t'

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function getDailyTargets(profile: { daily_targets?: string | null } | null): DailyTarget[] {
  if (!profile?.daily_targets) return []
  try { return normalizeDailyTargets(JSON.parse(profile.daily_targets)) } catch { return [] }
}

export function DashboardPlanCards() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const deadline = profile?.deadline ?? null
  const planTargets = getPlanTargets(profile)
  const dailyTargets = getDailyTargets(profile)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [totalScope, setTotalScope] = useState(0)
  const [totalDone, setTotalDone] = useState(0)
  const [yesterdayDone, setYesterdayDone] = useState(0)

  const [targetProgress, setTargetProgress] = useState<{ subjects: string[]; categories: string[]; keyPoints: string[]; wrongOnly: boolean; doneToday: number; goal: number }[]>([])
  const [dailyTargetGoal, setDailyTargetGoal] = useState(0)
  const [customTargetTotalQuestions, setCustomTargetTotalQuestions] = useState(0)
  const [customTotalDone, setCustomTotalDone] = useState(0)

  useEffect(() => {
    if (!user) return
    const uid = user.id
    async function load() {
      const { data: answersRaw } = await supabase
        .from('user_answers')
        .select('question_id, is_correct, answered_at')
        .eq('user_id', uid)
        .order('answered_at', { ascending: false })
        .limit(5000)
      const sets = deriveAnswerSets((answersRaw ?? []) as any[], todayStart())

      if (deadline) {
        let total = 0, done = 0, before = 0
        for (const target of planTargets) {
          const ids = await fetchTargetScopeIds(target)
          const p = scopeProgress(ids, sets, target.wrongOnly)
          total += p.total; done += p.done; before += p.doneBefore
        }
        setTotalScope(total)
        setTotalDone(done)
        setYesterdayDone(before)
      }

      if (dailyTargets.length > 0) {
        let goalTotal = 0
        let scopeTotalAll = 0
        let doneAllTotal = 0
        const progress: typeof targetProgress = []
        // ponytail: one scope query per target; targets are few
        for (const target of dailyTargets) {
          const ids = await fetchTargetScopeIds(target)
          const p = scopeProgress(ids, sets, target.wrongOnly)
          scopeTotalAll += p.total
          doneAllTotal += p.done
          let goal = target.count
          if (target.deadline) {
            const daysLeft = Math.max(Math.ceil((new Date(target.deadline).getTime() - Date.now()) / 86400000), 1)
            goal = Math.ceil(Math.max(p.total - p.done, 0) / daysLeft)
          }
          goalTotal += goal
          progress.push({
            subjects: target.subjects,
            categories: target.categories,
            keyPoints: target.keyPoints,
            wrongOnly: target.wrongOnly,
            doneToday: Math.min(p.todayDone, goal),
            goal,
          })
        }
        setCustomTargetTotalQuestions(scopeTotalAll)
        setCustomTotalDone(doneAllTotal)
        setDailyTargetGoal(goalTotal)
        setTargetProgress(progress)
      } else {
        setTargetProgress([])
        setDailyTargetGoal(0)
        setCustomTargetTotalQuestions(0)
        setCustomTotalDone(0)
      }
    }
    load()
  }, [user?.id, deadline, JSON.stringify(planTargets), JSON.stringify(dailyTargets), version])

  if (!user) return null

  const overallPct = totalScope > 0 ? Math.round((totalDone / totalScope) * 1000) / 10 : 0
  const changeFromYesterday = totalDone - yesterdayDone
  const changePct = yesterdayDone > 0 ? Math.round((Math.abs(changeFromYesterday) / yesterdayDone) * 1000) / 10 : null
  const isUp = changeFromYesterday >= 0

  const doneDaily = targetProgress.reduce((s, t) => s + t.doneToday, 0)
  const customPct = customTargetTotalQuestions > 0 ? Math.min(Math.round((customTotalDone / customTargetTotalQuestions) * 100), 100) : 0

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
                <Progress value={customPct} className="flex-1 h-2 [&>div]:bg-pink-500" />
                <span className="text-[11px] font-medium tabular-nums">{customTotalDone}/{customTargetTotalQuestions}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('plan.doneCount')}: {doneDaily}
                {deadlineText && (
                  <span className="text-muted-foreground"> — {deadlineText}</span>
                )}
              </p>
              <div className="space-y-1">
                {targetProgress.map((tp, i) => {
                  const done = tp.goal > 0 && tp.doneToday >= tp.goal
                  const label = [
                    tp.wrongOnly ? t('plan.wrongOnly') : '',
                    tp.subjects.length ? tp.subjects.join('、') : t('plan.allScope'),
                    ...tp.categories,
                    ...tp.keyPoints,
                  ].filter(Boolean).join(' · ')
                  return (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <span className={done ? 'text-green-500' : 'text-muted-foreground'}>
                        {done ? <Check className="h-3 w-3" /> : <span className="inline-block w-3 h-3 rounded-full border" />}
                      </span>
                      <span className={done ? 'line-through text-muted-foreground truncate' : 'truncate'}>{label}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{tp.doneToday}/{tp.goal}</span>
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
