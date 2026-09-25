import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { logError } from '@/services/errors'
import { fetchProfile } from '@/services/profiles'
import { fetchQuestionMetaCache } from '@/services/questions'
import { registerUserScopedStore } from '@/stores/user-scope'

export interface PlanCache {
  allSubjects: string[]
  subjectProgress: Record<string, { total: number; done: number; missing_kp: number }>
  fetchedAt: number
  refreshVersion: number
}

const PLAN_CACHE_TTL = 300_000 // 5 minutes — RPC is a single round-trip, refreshVersion handles invalidation

interface ChartData {
  totalAnswered: number
  correctCount: number
  wrongCount: number
  checkinDays: number
  dailyAnswers: { date: string; count: number }[]
  barData: { date: string; correct: number; wrong: number }[]
  sunburstData: { subject: string; category: string; questionType: string }[]
  dailyGoal: number
  hourlyDistribution: number[][]
  dailySubjectData: { dates: string[]; subjects: string[]; data: Record<string, number>[] }
  todayHourlyData: number[]
  subjectAccuracy: { subject: string; correct: number; total: number }[]
  heatmapData: { subject: string; questionType: string; correctRate: number; total: number }[]
}

interface QMeta {
  id: string
  subject: string
  category: string
  categories: string[]
  question_type: string
}

interface DashboardState {
  // Chart data cache
  chartData: ChartData | null
  cacheKey: string
  cacheTs: number
  // Questions metadata cache
  qMeta: QMeta[] | null
  qMetaTs: number
  // Plan progress cache — shared across PlanDialog, PlanProgress, DashboardPlanCards
  planCache: PlanCache | null
  // Actions
  setChartCache: (data: ChartData, key: string) => void
  getChartCache: (key: string) => ChartData | null
  setQMetaCache: (data: QMeta[]) => void
  getQMetaCache: () => QMeta[] | null
  fetchPlanCache: (userId: string, refreshVersion?: number, planResetAt?: string | null) => Promise<PlanCache>
  getPlanCache: () => PlanCache | null
  invalidatePlanCache: () => void
  reset: () => void
}

const Q_META_TTL = 30 * 60 * 1000

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      chartData: null,
      cacheKey: '',
      cacheTs: 0,
      qMeta: null,
      qMetaTs: 0,

      setChartCache: (data, key) =>
        set({ chartData: data, cacheKey: key, cacheTs: Date.now() }),

      getChartCache: (key) => {
        const state = get()
        if (state.chartData && state.cacheKey === key) return state.chartData
        return null
      },

      setQMetaCache: (data) =>
        set({ qMeta: data, qMetaTs: Date.now() }),

      getQMetaCache: () => {
        const state = get()
        if (state.qMeta && Date.now() - state.qMetaTs < Q_META_TTL) return state.qMeta
        return null
      },

      planCache: null,

      fetchPlanCache: async (userId, refreshVersion = 0, planResetAt?: string | null) => {
        const state = get()
        if (state.planCache && Date.now() - state.planCache.fetchedAt < PLAN_CACHE_TTL && state.planCache.refreshVersion === refreshVersion) return state.planCache

        // Get per-subject reset timestamps
        let subjectResets: Record<string, string> | null = null
        try {
          const profile = await fetchProfile(userId)
          subjectResets = (profile?.subject_reset_at ?? null) as Record<string, string> | null
        } catch (e) {
          // 旧代码不看读的结果: 拿不到就按"没有学科重置"算, 别把整个计划缓存打掉
          logError('dashboard.fetchPlanCache.profile', e)
        }

        // Single RPC call replaces: paginated questions + paginated user_answers + client-side Set counting
        // p_plan_reset_at 在库里默认就是 NULL, 传 undefined 让参数整个不出现, 与旧代码传 null 等价
        const { data: rows } = await supabase.rpc('get_subject_progress', {
          p_user_id: userId,
          p_plan_reset_at: planResetAt || undefined,
          p_subject_resets: subjectResets,
        }) as { data: { subject: string; total: number; done_all: number; missing_kp: number }[] | null }

        const subjectProgress: Record<string, { total: number; done: number; missing_kp: number }> = {}
        const subjects = new Set<string>()

        // Load subject list from cached meta (fast — single row)
        try {
          for (const s of (await fetchQuestionMetaCache()).subjects) subjects.add(s)
        } catch (e) {
          logError('dashboard.fetchPlanCache.meta', e)
        }

        for (const r of (rows ?? [])) {
          subjectProgress[r.subject] = { total: Number(r.total), done: Number(r.done_all), missing_kp: Number((r as any).missing_kp ?? 0) }
          subjects.add(r.subject)
        }
        // Ensure meta subjects with 0 questions still appear
        for (const s of subjects) {
          if (!(s in subjectProgress)) subjectProgress[s] = { total: 0, done: 0, missing_kp: 0 }
        }

        const cache: PlanCache = {
          allSubjects: [...subjects].sort(),
          subjectProgress,
          fetchedAt: Date.now(),
          refreshVersion,
        }
        set({ planCache: cache })
        return cache
      },

      getPlanCache: () => {
        const state = get()
        if (state.planCache && Date.now() - state.planCache.fetchedAt < PLAN_CACHE_TTL) return state.planCache
        return null
      },

      invalidatePlanCache: () => set({ planCache: null }),

      // 这些缓存是按用户算出来的（答题统计、计划进度），而这个 store 是持久化的：
      // 不清就等于下一个登录的人先看到上一个人的数据。
      reset: () => set({ chartData: null, cacheKey: '', cacheTs: 0, qMeta: null, qMetaTs: 0, planCache: null }),
    }),
    {
      name: 'dashboard-cache',
      partialize: (state) => ({
        chartData: state.chartData,
        cacheKey: state.cacheKey,
        cacheTs: state.cacheTs,
        qMeta: state.qMeta,
        qMetaTs: state.qMetaTs,
      }),
    },
  ),
)

registerUserScopedStore(() => useDashboardStore.getState().reset())
