import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { normalizeDailyTargets } from '@/types'
import type { DailyTarget } from '@/types'

export interface PlanSubjectProgress {
  subject: string
  total: number
  doneAll: number
  doneToday: number
}

export interface PlanTargetGroup {
  deadline: string | null
  subjects: { subject: string; count: number; done: number }[]
  total: number
  totalDone: number
}

export interface PlanCompletion {
  loading: boolean
  hasPlan: boolean
  deadline: string | null
  dailyGoal: number
  todayDone: number
  longTerm: PlanSubjectProgress[]
  targets: PlanTargetGroup[]
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

function getDailyTargets(profile: { daily_targets?: string | null } | null): DailyTarget[] {
  if (!profile?.daily_targets) return []
  try { return normalizeDailyTargets(JSON.parse(profile.daily_targets)) } catch { return [] }
}

function subjectKey(s: string) { return s || 'Other' }

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
  const [targets, setTargets] = useState<PlanTargetGroup[]>([])

  useEffect(() => {
    if (!user || !profile) return
    const uid = user.id
    let cancelled = false

    void (async () => {
      try {
        const today = todayStart()
        const deadline = profile.deadline ?? null
        const planSubjects = getPlanSubjects(profile)
        const dailyTargets = getDailyTargets(profile)
        const subjectResets = (profile.subject_reset_at ?? null) as Record<string, string> | null

        const [ltRows, dtRows] = await Promise.all([
          deadline
            ? fetchProgress({
                p_user_id: uid,
                p_plan_reset_at: profile.plan_reset_at || null,
                p_today_since: today,
                p_subjects: planSubjects.length > 0 ? planSubjects : null,
                p_subject_resets: subjectResets,
              })
            : Promise.resolve(null),
          dailyTargets.length > 0
            ? fetchProgress({
                p_user_id: uid,
                p_plan_reset_at: profile.daily_reset_at || null,
                p_today_since: today,
                p_subjects: [...new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))],
                p_subject_resets: subjectResets,
              })
            : Promise.resolve(null),
        ])

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

        if (dailyTargets.length > 0 && dtRows) {
          const doneTodayBySubject = new Map<string, number>()
          for (const r of dtRows) doneTodayBySubject.set(r.subject, Number(r.done_today))
          setTargets(dailyTargets.map((t) => {
            const subjects = t.subjects.map((s) => ({
              subject: s.subject,
              count: s.count,
              done: Math.min(doneTodayBySubject.get(subjectKey(s.subject)) ?? 0, s.count),
            }))
            return {
              deadline: t.deadline ?? null,
              subjects,
              total: subjects.reduce((sum, s) => sum + s.count, 0),
              totalDone: subjects.reduce((sum, s) => sum + s.done, 0),
            }
          }))
        } else {
          setTargets([])
        }

        if (!cancelled) setLoading(false)
      } catch (e) {
        console.error('usePlanCompletion:', e)
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, profile, version])

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

  const hasPlan = !!profile?.deadline || targets.length > 0

  return {
    loading: loading && !!profile,
    hasPlan,
    deadline: profile?.deadline ?? null,
    dailyGoal,
    todayDone,
    longTerm,
    targets,
  }
}
