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
 * 一条计划记录。长期计划的一轮 = 把这一遍里该科的题都刷一遍, 自定义计划的一批 = 刷够自己定的题数。
 */
export interface PlanItem {
  id: string
  subject: string
  kind: PlanItemKind
  /** 第几轮 / 第几批 */
  index: number
  /** 这一批的目标题数 */
  quantity: number
  /** 这一轮的起始日(统计起点, 甘特图左端); 自定义批次没有 = null */
  start: string | null
  target: string
  createdAt: string
  /** 实际刷完的那天: 落库值优先, 没有就用作答记录算出来的 */
  doneAt: string | null
  state: PlanItemState
  /** 这一批已经刷了多少题 */
  done: number
}

export interface PlanStat {
  /** 轮次 = 会话队列里该科的题数; 批次 = 整科题量 */
  total: number
  /** 轮次 = 这一遍答过的题数(按题去重); 批次 = 起点以来的作答次数 */
  attempts: number
  /** 轮次最多一条(这一遍刷满的那天); 批次是第 1..k 批的实际完成日 */
  doneDates: string[]
}

/** 传给 get_plan_stats 的每科参数: 起点 + 每批题数(steps) 或统一的 size(缺省 = 题量) */
export interface PlanSpecEntry {
  /** 这一遍的起点: ISO 时刻(重置) 或 YYYY-MM-DD(按当天零点); 空 = 不限起点 */
  since?: string
  size?: number
  steps?: number[]
}

/** 重置时刻: 学科级的优先, 没有就用计划级的(和练习页判断"本次会话已作答"同一规则) */
export interface PlanResets {
  subject_reset_at?: Record<string, string> | null
  plan_reset_at?: string | null
}

export interface PlanCompletion {
  loading: boolean
  hasPlan: boolean
  deadline: string | null
  /** 今日任务 = 计划每天的量 + 错题/收藏去重后的复习量 */
  dailyGoal: number
  todayDone: number
  /** 自定义计划每天要刷的题数 */
  goalPerDay: number
  /** 自定义计划学科今天已经刷掉的题数 */
  goalTodayDone: number
  /** 错题 ∪ 收藏 去重后的题数(计划学科范围内), 已计入 dailyGoal */
  reviewCount: number
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
  /** 轮次的起始日; 批次传 null */
  start: string | null
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
 * 每个学科"当前这一遍"的起点(毫秒时间戳): 取下面三个里最晚的那个 ——
 *   - 该科第一个还没完成的轮次的**起始日**(用户自己定的这一轮从哪天开始);
 *   - 上一轮实际刷完的那天(那之前的作业属于上一遍);
 *   - 学科重置时刻 / 计划重置时刻(重置 = 这一遍从头再来)。
 * 一条都没占上的学科(没起始日、没刷完过、也没重置过)不出现在表里 = 不限起点(从头累计)。
 * 计划侧的轮次统计和练习页的"本次会话已作答"都用它, 两边显示的就永远是同一个数。
 */
export function passStartBySubject(rounds: PlanRound[], resets?: PlanResets | null): Record<string, number> {
  const out: Record<string, number> = {}
  const bySubject = new Map<string, PlanRound[]>()
  for (const r of rounds) {
    const list = bySubject.get(r.subject)
    if (list) list.push(r)
    else bySubject.set(r.subject, [r])
  }
  for (const [subject, list] of bySubject) {
    const ordered = [...list].sort((a, b) => a.round - b.round)
    const open = ordered.findIndex((r) => !r.doneAt)
    const days = [
      (open < 0 ? ordered[ordered.length - 1] : ordered[open - 1])?.doneAt ?? null,
      (open < 0 ? null : ordered[open].start),
    ]
    let ms: number | null = null
    for (const day of days) {
      if (!day) continue
      const t = new Date(`${day}T00:00:00`).getTime()
      if (Number.isFinite(t) && (ms == null || t > ms)) ms = t
    }
    const reset = resetAt(resets, subject)
    if (reset != null && (ms == null || reset > ms)) ms = reset
    if (ms != null) out[subject] = ms
  }
  return out
}

/**
 * 长期计划的轮次换成统计参数。轮次的一遍 = 把这一遍里该科的题都答过, 所以只给"这一遍的起点"
 * (见 passStartBySubject); 起点之后的作答按题去重, 除以该科题量就是这一遍的进度。
 */
export function roundPlanSpec(rounds: PlanRound[], resets?: PlanResets | null): Record<string, PlanSpecEntry> {
  const starts = passStartBySubject(rounds, resets)
  const spec: Record<string, PlanSpecEntry> = {}
  for (const subject of new Set(rounds.map((r) => r.subject))) {
    const since = starts[subject]
    spec[subject] = since == null ? {} : { since: new Date(since).toISOString() }
  }
  return spec
}

/** 重置时刻(学科级优先, 没有就用计划级的 —— 和练习页 isAnsweredAfterReset 同一优先级) */
function resetAt(resets: PlanResets | null | undefined, subject: string): number | null {
  const at = resets?.subject_reset_at?.[subject] ?? resets?.plan_reset_at
  if (!at) return null
  const ms = new Date(at).getTime()
  return Number.isFinite(ms) ? ms : null
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
    const ordered = [...list].sort((a, b) => a.index - b.index)
    // 轮次: 统计只讲"当前这一遍"(第一个还没完成的轮次), 后面的都还没轮到;
    // 批次: 阈值是各批题数的累加, 所以当前这批的进度 = 总作答次数 - 前面已刷掉的
    const openIndex = kind === 'round' ? ordered.findIndex((r) => !r.doneAt) : -1
    let prefix = 0
    let metCurrent = false
    ordered.forEach((row, i) => {
      const quantity = row.quantity ?? stat?.total ?? 0
      const doneAt = kind === 'round'
        ? row.doneAt ?? (i === openIndex ? stat?.doneDates[0] ?? null : null)
        : row.doneAt ?? stat?.doneDates[i] ?? null
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
        start: row.start,
        target: row.target,
        createdAt: row.createdAt,
        doneAt,
        state,
        done: doneAt
          ? quantity
          : kind === 'round'
            ? (i === openIndex ? Math.min(attempts, quantity) : 0)
            : Math.min(Math.max(attempts - prefix, 0), quantity),
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
    start: r.start,
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
      start: null,
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

/** 到目标日当天 24:00 还有几天(已过期或就是今天都算 1 天: 得赶紧补上) */
function daysUntil(day: string, now = Date.now()): number {
  return Math.max(Math.ceil((new Date(`${day}T23:59:59`).getTime() - now) / 86400000), 1)
}

/** 某学科当前最卡进度的那一条: 还差多少题、到目标日还有几天、平均每天多少题 */
export interface SubjectPace {
  subject: string
  /** 卡进度的是第几轮 / 第几批 */
  index: number
  target: string
  remaining: number
  days: number
  perDay: number
}

/**
 * 每天要刷多少题按排期反推: 逐个学科看还没完成的记录, 算"到这一条的目标日为止累计还差
 * 多少题 ÷ 还剩几天", 取最紧的那一条(后面排得紧, 今天就得开始还账)。
 * 题量大的学科自然权重大 —— 剩余题数就是它的量。
 */
export function subjectPaces(items: PlanItem[], now = Date.now()): SubjectPace[] {
  const bySubject = new Map<string, PlanItem[]>()
  for (const r of items) {
    const list = bySubject.get(r.subject)
    if (list) list.push(r)
    else bySubject.set(r.subject, [r])
  }

  const out: SubjectPace[] = []
  for (const [subject, list] of bySubject) {
    const ordered = [...list].sort((a, b) => a.index - b.index)
    const current = ordered.findIndex((r) => r.state !== 'done')
    if (current < 0) continue
    // 当前这一条已经刷掉的部分, 后面几条的账要连着它一起算
    let need = 0
    let tightest: SubjectPace | null = null
    for (let i = current; i < ordered.length; i++) {
      const r = ordered[i]
      need += r.quantity - (i === current ? r.done : 0)
      const days = daysUntil(r.target, now)
      const perDay = Math.ceil(need / days)
      if (!tightest || perDay > tightest.perDay) {
        tightest = { subject, index: r.index, target: r.target, remaining: need, days, perDay }
      }
    }
    if (tightest) out.push(tightest)
  }
  return out.sort((a, b) => b.perDay - a.perDay)
}

/**
 * 每天需要刷多少题 = 各学科最紧那条的速度之和。
 * 完全没排轮次的学科没法按排期算, 回退成"整科剩余 ÷ 计划剩余天数"。
 */
export function dailyPace(
  items: PlanItem[],
  unscheduledRemaining: number,
  planDeadline: string | null,
  now = Date.now(),
): number {
  let total = subjectPaces(items, now).reduce((sum, p) => sum + p.perDay, 0)
  if (planDeadline && unscheduledRemaining > 0) {
    total += Math.ceil(unscheduledRemaining / daysUntil(planDeadline, now))
  }
  return total
}

/**
 * 自定义计划每天要刷的题数 = 每个还没刷完的批次"还差多少题 ÷ 到该批目标日还剩几天", 再加起来。
 */
export function goalPace(items: PlanItem[], now = Date.now()): number {
  return items
    .filter((g) => g.state !== 'done')
    .reduce((sum, g) => sum + Math.ceil(Math.max(g.quantity - g.done, 0) / daysUntil(g.target, now)), 0)
}

type ProgressRow = { subject: string; total: number; done_all: number; done_today: number }

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
  const [reviewCount, setReviewCount] = useState(0)
  const [todayDone, setTodayDone] = useState(0)
  const [longTerm, setLongTerm] = useState<PlanSubjectProgress[]>([])
  const [rounds, setRounds] = useState<PlanItem[]>([])
  const [goals, setGoals] = useState<PlanItem[]>([])
  const [goalPerDay, setGoalPerDay] = useState(0)
  const [goalTodayDone, setGoalTodayDone] = useState(0)

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
        const goalSubjects = [...new Set(goalList.map((g) => g.subject))]
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
          let scopeDoneToday = 0
          for (const r of ltRows) scopeDoneToday += Number(r.done_today)
          setTodayDone(scopeDoneToday)
          setLongTerm(ltRows.map((r) => ({
            subject: r.subject,
            total: Number(r.total),
            doneAll: Number(r.done_all),
            doneToday: Number(r.done_today),
          })))
        } else {
          setTodayDone(0)
          setLongTerm([])
        }

        const [roundStats, goalStats, goalTodayRows] = await Promise.all([
          roundList.length > 0 ? fetchPlanStats(uid, roundPlanSpec(roundList, profile)) : Promise.resolve(null),
          goalList.length > 0 ? fetchPlanStats(uid, goalPlanSpec(goalList)) : Promise.resolve(null),
          // 自定义计划那几科今天刷了多少, 给顶部菜单的"每天"进度条用
          goalSubjects.length > 0
            ? fetchProgress({
                p_user_id: uid,
                p_plan_reset_at: profile.plan_reset_at || null,
                p_today_since: today,
                p_subjects: goalSubjects,
                p_subject_resets: subjectResets,
              })
            : Promise.resolve(null),
        ])
        if (cancelled) return
        const roundItems = roundStats ? buildRoundItems(roundList, roundStats) : []
        const goalItems = goalStats ? buildGoalItems(goalList, goalStats) : []
        setRounds(roundItems)
        setGoals(goalItems)
        setGoalPerDay(goalPace(goalItems))
        let goalDoneToday = 0
        for (const r of goalTodayRows ?? []) goalDoneToday += Number(r.done_today)
        setGoalTodayDone(goalDoneToday)

        // 每天题数按排期算(见 dailyPace); 只有完全没排轮次的学科才退回"剩余 ÷ 剩余天数"
        const scheduled = new Set(roundItems.map((r) => r.subject))
        let unscheduled = 0
        for (const r of ltRows ?? []) {
          if (!scheduled.has(r.subject)) unscheduled += Math.max(Number(r.total) - Number(r.done_all), 0)
        }
        // 错题 ∪ 收藏(去重, 计划学科范围内)单独算: 不进今日任务, 只作为独立信息展示
        const planSubs = [...new Set([
          ...getPlanSubjects(profile),
          ...goalList.map((g) => g.subject),
        ])]
        const reviewRes = await supabase.rpc('get_review_count', {
          p_user_id: uid,
          p_subjects: planSubs.length > 0 ? planSubs : null,
        })
        if (cancelled) return
        setReviewCount(reviewRes.data == null ? 0 : Number(reviewRes.data))
        setDailyGoal(dailyPace(roundItems, deadline ? unscheduled : 0, deadline))

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
    goalPerDay,
    goalTodayDone,
    reviewCount,
    longTerm,
    rounds,
    goals,
  }
}
