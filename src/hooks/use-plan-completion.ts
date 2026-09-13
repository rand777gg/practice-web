import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { resolveGoals, resolveRounds, todayStr } from '@/types'
import type { PlanGoal, PlanRound } from '@/types'

export interface PlanSubjectProgress {
  subject: string
  total: number
  doneAll: number
  doneToday: number
}

/** 一条计划记录的状态: 已刷完 / 过了目标日还没刷完 / 正在刷 / 还没轮到 */
export type PlanItemState = 'done' | 'overdue' | 'current' | 'upcoming'
/** round = 长期计划的一轮(一批 = 该学科题量), goal = 自定义计划的一批(题数自己定) */
export type PlanItemKind = 'round' | 'goal'

/**
 * 一条计划记录。长期计划的一轮和自定义计划的一批是同一个东西:
 * "从创建那天起累计刷够 quantity 题", 只是 quantity 的来源不同。
 */
export interface PlanItem {
  id: string
  subject: string
  kind: PlanItemKind
  /** 第几轮 / 第几批 */
  index: number
  /** 这一批的目标题数 */
  quantity: number
  target: string
  createdAt: string
  /** 实际刷够的那天: 落库值优先, 没有就用作答记录算出来的 */
  doneAt: string | null
  state: PlanItemState
  /** 这一批已经刷了多少题 */
  done: number
}

export interface PlanStat {
  /** 该学科题量 */
  total: number
  /** 统计起点以来"顺序学习"模式的作答次数 */
  attempts: number
  /** 第 1..k 批的实际完成日 */
  doneDates: string[]
}

/** 传给 get_plan_stats 的每科参数: 起点 + 每批题数(steps) 或统一的 size(缺省 = 题量) */
export interface PlanSpecEntry {
  since: string
  size?: number
  steps?: number[]
}

export interface PlanCompletion {
  loading: boolean
  hasPlan: boolean
  deadline: string | null
  dailyGoal: number
  todayDone: number
  longTerm: PlanSubjectProgress[]
  rounds: PlanItem[]
  goals: PlanItem[]
}

interface PlanRecord {
  id: string
  subject: string
  index: number
  /** null = 用该学科题量 */
  quantity: number | null
  target: string
  createdAt: string
  doneAt: string | null
}

/** 每科的统计起点 = 该科最早那条记录的创建日 */
export function planBaselines(records: { subject: string; createdAt: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const r of records) {
    const cur = map[r.subject]
    if (!cur || r.createdAt < cur) map[r.subject] = r.createdAt
  }
  return map
}

/**
 * 长期计划的轮次换成统计参数: 每批题量 = 该学科题量, 所以只给起点。
 */
export function roundPlanSpec(rounds: PlanRound[]): Record<string, PlanSpecEntry> {
  const spec: Record<string, PlanSpecEntry> = {}
  for (const [subject, since] of Object.entries(planBaselines(rounds))) spec[subject] = { since }
  return spec
}

/** 自定义计划的批次换成统计参数: 每批题数自己定, 交给 SQL 累加成阈值 */
export function goalPlanSpec(goals: PlanGoal[]): Record<string, PlanSpecEntry> {
  const spec: Record<string, PlanSpecEntry> = {}
  for (const [subject, since] of Object.entries(planBaselines(goals))) spec[subject] = { since, steps: [] }
  for (const g of goals) {
    const entry = spec[g.subject]
    if (entry) entry.steps!.push(g.count)
  }
  return spec
}

/**
 * 拉取"从起点以来顺序学习的作答次数"和每一批的实际完成日。
 * 第 k 批刷够的时刻 = 起点以来第 (前 k 批题数之和) 次作答, 所以完成日是算出来的,
 * 不需要在刷题时实时打点。
 */
export async function fetchPlanStats(
  userId: string,
  plan: Record<string, PlanSpecEntry>,
): Promise<Map<string, PlanStat>> {
  const map = new Map<string, PlanStat>()
  if (Object.keys(plan).length === 0) return map
  const { data, error } = await supabase.rpc('get_plan_stats', { p_user_id: userId, p_plan: plan })
  if (error) {
    console.error('fetchPlanStats:', error)
    return map
  }
  for (const r of (data ?? []) as { subject: string; total: number; attempts: number; done_dates: string[] | null }[]) {
    map.set(r.subject, {
      total: Number(r.total),
      attempts: Number(r.attempts),
      doneDates: (r.done_dates ?? []) as string[],
    })
  }
  return map
}

/** 把计划里的记录和真实作答统计合起来: 每条的完成日、状态、进度 */
function toPlanItems(kind: PlanItemKind, rows: PlanRecord[], stats: Map<string, PlanStat>): PlanItem[] {
  const bySubject = new Map<string, PlanRecord[]>()
  for (const r of rows) {
    const list = bySubject.get(r.subject)
    if (list) list.push(r)
    else bySubject.set(r.subject, [r])
  }

  const today = todayStr()
  const out: PlanItem[] = []
  for (const [subject, list] of bySubject) {
    const stat = stats.get(subject)
    const attempts = stat?.attempts ?? 0
    // 前面几批的题数之和: 当前这批的进度 = 总作答次数 - 前面已刷掉的
    let prefix = 0
    let metCurrent = false
    ;[...list].sort((a, b) => a.index - b.index).forEach((row, i) => {
      const quantity = row.quantity ?? stat?.total ?? 0
      const doneAt = row.doneAt ?? stat?.doneDates[i] ?? null
      const state: PlanItemState = doneAt
        ? 'done'
        : row.target < today ? 'overdue' : metCurrent ? 'upcoming' : 'current'
      if (!doneAt) metCurrent = true
      out.push({
        id: row.id,
        subject,
        kind,
        index: row.index,
        quantity,
        target: row.target,
        createdAt: row.createdAt,
        doneAt,
        state,
        done: doneAt ? quantity : Math.min(Math.max(attempts - prefix, 0), quantity),
      })
      prefix += quantity
    })
  }
  return out.sort((a, b) =>
    a.subject.localeCompare(b.subject, 'zh-CN') || a.index - b.index)
}

export function buildRoundItems(rounds: PlanRound[], stats: Map<string, PlanStat>): PlanItem[] {
  return toPlanItems('round', rounds.map((r) => ({
    id: r.id,
    subject: r.subject,
    index: r.round,
    quantity: null,
    target: r.target,
    createdAt: r.createdAt,
    doneAt: r.doneAt,
  })), stats)
}

export function buildGoalItems(goals: PlanGoal[], stats: Map<string, PlanStat>): PlanItem[] {
  const counter = new Map<string, number>()
  return toPlanItems('goal', goals.map((g) => {
    const index = (counter.get(g.subject) ?? 0) + 1
    counter.set(g.subject, index)
    return {
      id: g.id,
      subject: g.subject,
      index,
      quantity: g.count,
      target: g.target,
      createdAt: g.createdAt,
      doneAt: g.doneAt,
    }
  }), stats)
}

/**
 * 甘特图只画"还没刷完的 + 每科最近 keepDone 条已完成的", 否则刷得越久行数越多。
 */
export function pickVisibleItems(items: PlanItem[], keepDone = 2): PlanItem[] {
  const bySubject = new Map<string, PlanItem[]>()
  for (const r of items) {
    const list = bySubject.get(r.subject)
    if (list) list.push(r)
    else bySubject.set(r.subject, [r])
  }
  const out: PlanItem[] = []
  for (const list of bySubject.values()) {
    const done = list.filter((r) => r.state === 'done')
    out.push(...list.filter((r) => r.state !== 'done'), ...done.slice(-keepDone))
  }
  return out.sort((a, b) =>
    a.subject.localeCompare(b.subject, 'zh-CN') || a.index - b.index)
}

type ProgressRow = { subject: string; total: number; done_all: number; done_today: number }

function todayStart(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0))
  if (now < d) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

function getPlanSubjects(profile: { plan_subjects?: string | null } | null): string[] {
  if (!profile?.plan_subjects) return []
  try { return JSON.parse(profile.plan_subjects) as string[] } catch { return [] }
}

async function fetchProgress(params: {
  p_user_id: string
  p_plan_reset_at: string | null
  p_today_since: string
  p_subjects: string[] | null
  p_subject_resets: Record<string, string> | null
}): Promise<ProgressRow[] | null> {
  const { data, error } = await supabase.rpc('get_subject_progress', params)
  if (error) {
    console.error('usePlanCompletion:', error)
    return null
  }
  return (data ?? []) as ProgressRow[]
}

export function usePlanCompletion(): PlanCompletion {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const version = useRefreshStore((s) => s.version)

  const [loading, setLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(0)
  const [todayDone, setTodayDone] = useState(0)
  const [longTerm, setLongTerm] = useState<PlanSubjectProgress[]>([])
  const [rounds, setRounds] = useState<PlanItem[]>([])
  const [goals, setGoals] = useState<PlanItem[]>([])

  const roundList = useMemo<PlanRound[]>(() => resolveRounds(profile), [profile])
  const goalList = useMemo<PlanGoal[]>(() => resolveGoals(profile), [profile])

  useEffect(() => {
    if (!user || !profile) return
    const uid = user.id
    const cancelled = false

    void (async () => {
      try {
        const today = todayStart()
        const deadline = profile.deadline ?? null
        const planSubjects = getPlanSubjects(profile)
        const subjectResets = (profile.subject_reset_at ?? null) as Record<string, string> | null

        const ltRows = deadline
          ? await fetchProgress({
              p_user_id: uid,
              p_plan_reset_at: profile.plan_reset_at || null,
              p_today_since: today,
              p_subjects: planSubjects.length > 0 ? planSubjects : null,
              p_subject_resets: subjectResets,
            })
          : null

        if (cancelled) return

        if (deadline && ltRows) {
          const deadlineDate = new Date(deadline + 'T23:59:59')
          const daysLeft = Math.max(daysBetween(new Date(), deadlineDate), 1)
          let scopeTotal = 0, scopeDoneAll = 0, scopeDoneToday = 0
          for (const r of ltRows) {
            scopeTotal += Number(r.total)
            scopeDoneAll += Number(r.done_all)
            scopeDoneToday += Number(r.done_today)
          }
          setDailyGoal(Math.ceil(Math.max(scopeTotal - scopeDoneAll, 0) / daysLeft))
          setTodayDone(scopeDoneToday)
          setLongTerm(ltRows.map((r) => ({
            subject: r.subject,
            total: Number(r.total),
            doneAll: Number(r.done_all),
            doneToday: Number(r.done_today),
          })))
        } else {
          setDailyGoal(0)
          setTodayDone(0)
          setLongTerm([])
        }

        const [roundStats, goalStats] = await Promise.all([
          roundList.length > 0 ? fetchPlanStats(uid, roundPlanSpec(roundList)) : Promise.resolve(null),
          goalList.length > 0 ? fetchPlanStats(uid, goalPlanSpec(goalList)) : Promise.resolve(null),
        ])
        if (cancelled) return
        setRounds(roundStats ? buildRoundItems(roundList, roundStats) : [])
        setGoals(goalStats ? buildGoalItems(goalList, goalStats) : [])

        if (!cancelled) setLoading(false)
      } catch (e) {
        console.error('usePlanCompletion:', e)
        if (!cancelled) setLoading(false)
      }
    })()
  }, [user, profile, version, roundList, goalList])

  // 北京时间零点(UTC 16:00)后重新拉取, 进度按新一天重置
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      const now = new Date()
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0))
      if (now >= next) next.setUTCDate(next.getUTCDate() + 1)
      timer = setTimeout(() => {
        useRefreshStore.getState().bump()
        schedule()
      }, next.getTime() - now.getTime())
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  const hasPlan = !!profile?.deadline || rounds.length > 0 || goals.length > 0

  return {
    loading: loading && !!profile,
    hasPlan,
    deadline: profile?.deadline ?? null,
    dailyGoal,
    todayDone,
    longTerm,
    rounds,
    goals,
  }
}
