import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import {
  addDays,
  daysBetweenDays,
  migrateDailyTargetsToGoals,
  migrateMilestonesToRounds,
  newRoundId,
  normalizePlanGoals,
  normalizePlanRounds,
  resolveGoals,
  resolveRounds,
  toDateStr,
  todayStr,
} from '@/types'
import type { PlanGoal, PlanRound } from '@/types'
import {
  fetchPlanStats,
  goalPlanSpec,
  roundPlanSpec,
  type PlanStat,
} from '@/hooks/use-plan-completion'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/i18n/use-t'
import { Separator } from '@/components/ui/separator'

interface CompletedBatch {
  kind: 'round' | 'goal'
  subject: string
  index: number
  doneAt: string
}

/**
 * 把"真的刷完了"的记录同步进计划:
 *   - 长期计划的轮次: 统计讲的永远是"当前这一遍"什么时候把该科的题都过完了(done_dates[0]),
 *     而这一遍对应的就是该科第一个还没完成的轮次 —— 给它插旗子, 旗子插在这一遍刷满的那天。
 *     这一遍还没刷满就什么都不做(轮次不再按累计作答次数凭空补出来)。
 *   - 自定义计划的批次: 每批题数由用户定, 没定过的批次无从判定, 只补已计划那几批的完成日。
 * 返回 null 表示没有变化。只有该学科没有"还没刷完的记录"时, 才算这一条刷完、该问下次了。
 */
function syncCompletedRounds(
  rounds: PlanRound[],
  stats: Map<string, PlanStat>,
): { rounds: PlanRound[] | null; latest: CompletedBatch | null } {
  const next = rounds.map((r) => ({ ...r }))
  const candidates: CompletedBatch[] = []
  let changed = false

  for (const [subject, stat] of stats) {
    const ordered = next
      .filter((r) => r.subject === subject)
      .sort((a, b) => a.round - b.round)
    if (ordered.length === 0) continue

    const open = ordered.find((r) => !r.doneAt)
    if (!open) continue
    const doneAt = stat.doneDates[0]
    if (!doneAt) continue

    open.doneAt = doneAt
    changed = true
    // 后面还排着没完成的轮次 -> 不用问下次, 用户早就安排好了
    if (!ordered.some((r) => !r.doneAt)) {
      candidates.push({ kind: 'round', subject, index: open.round, doneAt })
    }
  }

  if (!changed) return { rounds: null, latest: null }
  candidates.sort((a, b) => b.doneAt.localeCompare(a.doneAt) || b.index - a.index)
  return {
    rounds: next.sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.round - b.round),
    latest: candidates[0] ?? null,
  }
}

/** 自定义计划那一侧: 只补已计划批次的实际完成日 */
function syncCompletedGoals(
  goals: PlanGoal[],
  stats: Map<string, PlanStat>,
): { goals: PlanGoal[] | null; latest: CompletedBatch | null } {
  const next = goals.map((g) => ({ ...g }))
  const candidates: CompletedBatch[] = []
  let changed = false

  for (const [subject, stat] of stats) {
    const ordered = next.filter((g) => g.subject === subject)
    if (ordered.length === 0) continue

    let newest: CompletedBatch | null = null
    ordered.forEach((g, i) => {
      const doneAt = stat.doneDates[i]
      if (doneAt && !g.doneAt) {
        g.doneAt = doneAt
        changed = true
        if (!newest || doneAt > newest.doneAt) newest = { kind: 'goal', subject, index: i + 1, doneAt }
      }
    })
    if (newest && ordered.every((g) => g.doneAt)) candidates.push(newest)
  }

  if (!changed) return { goals: null, latest: null }
  candidates.sort((a, b) => b.doneAt.localeCompare(a.doneAt) || b.index - a.index)
  return {
    goals: next.sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.target.localeCompare(b.target)),
    latest: candidates[0] ?? null,
  }
}

/** 下一条目标完成日的建议值: 按这个学科上一次的间隔往后推, 且不超过长期计划最后一天 */
function suggestNextTarget(doneDates: string[], planDeadline: string | null): string {
  const today = todayStr()
  const done = [...doneDates].sort()
  const last = done[done.length - 1]
  const gap = done.length >= 2 ? Math.max(daysBetweenDays(done[done.length - 2], last), 1) : 7
  let next = addDays(last && last > today ? last : today, gap)
  if (planDeadline && next > planDeadline) next = planDeadline
  if (next < today) next = today
  return next
}

function doneDatesOf(records: { subject: string; doneAt: string | null }[], subject: string): string[] {
  return records.filter((r) => r.subject === subject && r.doneAt).map((r) => r.doneAt as string)
}

/**
 * 计划监视器(AppLayout 挂载一次, 仅登录态有效):
 *   - 老的时间窗里程碑 / 每日定额一次性搬成轮次与批次
 *   - 每次刷题后检查有没有刷完的记录: 补记录、落完成日, 并问一下下次刷题时间
 */
export function PlanWatcher() {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const rounds = useMemo(() => resolveRounds(profile), [profile])
  const goals = useMemo(() => resolveGoals(profile), [profile])
  const planDeadline = profile?.deadline ?? null

  const [ask, setAsk] = useState<CompletedBatch | null>(null)
  const [start, setStart] = useState('')
  const [target, setTarget] = useState('')
  const [count, setCount] = useState(0)
  const busy = useRef(false)

  // 老数据一次性搬家。旧列无论如何都要清空 —— 留着的话, 用户把计划删空之后
  // 下一次加载又会被搬回来(凭空复活已删掉的记录)。
  useEffect(() => {
    if (!user || !profile) return
    const patch: Record<string, unknown> = {}
    if (profile.milestones) {
      if (normalizePlanRounds(profile.plan_rounds).length === 0) {
        const migrated = migrateMilestonesToRounds(profile.milestones, todayStr())
        patch.plan_rounds = migrated.length > 0 ? migrated : null
      }
      patch.milestones = null
    }
    if (profile.daily_targets) {
      if (normalizePlanGoals(profile.plan_goals).length === 0) {
        const migrated = migrateDailyTargetsToGoals(profile.daily_targets, todayStr())
        patch.plan_goals = migrated.length > 0 ? migrated : null
      }
      patch.daily_targets = null
    }
    if (Object.keys(patch).length === 0) return
    void supabase.from('profiles').update(patch).eq('id', user.id).then(() => refreshProfile())
  }, [user, profile, refreshProfile])

  useEffect(() => {
    if (!user || !profile || (rounds.length === 0 && goals.length === 0)) return
    let cancelled = false
    void (async () => {
      const [roundStats, goalStats] = await Promise.all([
        rounds.length > 0 ? fetchPlanStats(user.id, roundPlanSpec(rounds, profile)) : Promise.resolve(null),
        goals.length > 0 ? fetchPlanStats(user.id, goalPlanSpec(goals)) : Promise.resolve(null),
      ])
      if (cancelled || busy.current) return

      const patch: Record<string, unknown> = {}
      let latest: CompletedBatch | null = null
      let latestDates: string[] = []
      if (roundStats) {
        const synced = syncCompletedRounds(rounds, roundStats)
        if (synced.rounds) {
          patch.plan_rounds = synced.rounds
          if (synced.latest) {
            latest = synced.latest
            latestDates = doneDatesOf(synced.rounds, synced.latest.subject)
          }
        }
      }
      if (goalStats) {
        const synced = syncCompletedGoals(goals, goalStats)
        if (synced.goals) {
          patch.plan_goals = synced.goals
          if (synced.latest && (!latest || synced.latest.doneAt > latest.doneAt)) {
            latest = synced.latest
            latestDates = doneDatesOf(synced.goals, synced.latest.subject)
          }
        }
      }
      if (Object.keys(patch).length === 0) return

      busy.current = true
      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
      busy.current = false
      if (error) {
        console.error('PlanWatcher:', error)
        return
      }
      await refreshProfile()
      if (cancelled || !latest) return
      if (latest.kind === 'goal') {
        const prev = goals.filter((g) => g.subject === latest!.subject)
        setCount(prev[prev.length - 1]?.count ?? 0)
      }
      setStart(latest.kind === 'round' ? latest.doneAt : '')
      setTarget(suggestNextTarget(latestDates, latest.kind === 'round' ? planDeadline : null))
      setAsk(latest)
    })()
    return () => { cancelled = true }
  }, [user, profile, rounds, goals, version, planDeadline, refreshProfile])

  const confirmNext = async () => {
    if (!user || !ask) return
    const current = useAuthStore.getState().profile
    setAsk(null)
    if (ask.kind === 'round') {
      const list = resolveRounds(current).filter((r) => r.subject === ask.subject)
      const nextRound = list.reduce((max, r) => Math.max(max, r.round), 0) + 1
      await supabase.from('profiles').update({
        plan_rounds: [...resolveRounds(current), {
          id: newRoundId(),
          subject: ask.subject,
          round: nextRound,
          start,
          target,
          createdAt: todayStr(),
          doneAt: null,
        }].sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.round - b.round),
      }).eq('id', user.id)
    } else {
      await supabase.from('profiles').update({
        plan_goals: [...resolveGoals(current), {
          id: newRoundId(),
          subject: ask.subject,
          count: Math.max(1, count),
          target,
          createdAt: todayStr(),
          doneAt: null,
        }].sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.target.localeCompare(b.target)),
      }).eq('id', user.id)
    }
    await refreshProfile()
  }

  return (
    <Dialog open={!!ask} onOpenChange={(open) => { if (!open) setAsk(null) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ask?.kind === 'goal' ? t('plan.goalDoneTitle') : t('plan.roundDoneTitle')}</DialogTitle>
        </DialogHeader>
        {ask && (
          <div className="space-y-2 text-xs">
            <p>
              <b className="font-semibold">{ask.subject}</b>
              <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />
              {t('plan.roundPrefix')}{ask.index}{ask.kind === 'goal' ? t('plan.batchesUnit') : t('plan.roundsUnit')}
              <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />
              <span className="text-emerald-600 dark:text-emerald-400">
                {t('plan.completedAt')} {ask.doneAt}
              </span>
            </p>
            <p className="text-muted-foreground">{t('plan.nextAsk')}</p>
            {ask.kind === 'goal' && (
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-muted-foreground">{t('plan.nextCount')}</span>
                <Input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-24 text-xs"
                />
              </label>
            )}
            {ask.kind === 'round' && (
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-muted-foreground">{t('plan.roundStart')}</span>
                <DatePicker
                  date={start ? new Date(`${start}T00:00:00`) : undefined}
                  onSelect={(d) => setStart(d ? toDateStr(d) : '')}
                  placeholder={t('plan.roundStart')}
                  className="h-8 flex-1 text-xs"
                />
              </label>
            )}
            <DatePicker
              date={target ? new Date(`${target}T00:00:00`) : undefined}
              onSelect={(d) => setTarget(d ? toDateStr(d) : '')}
              placeholder={t('plan.roundTarget')}
              className="h-8 w-full text-xs"
            />
            {planDeadline && <p className="text-[11px] text-muted-foreground">{t('plan.roundBeforePlanDeadline')} {planDeadline}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setAsk(null)}>
            {t('plan.roundAskLater')}
          </Button>
          <Button size="sm" className="text-xs" onClick={confirmNext} disabled={!target || (ask?.kind === 'round' && !start)}>
            {t('plan.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
