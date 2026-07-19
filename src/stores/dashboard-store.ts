import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface PlanCache {
  allSubjects: string[]
  subjectProgress: Record<string, { total: number; done: number }>
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

        // Single RPC call replaces: paginated questions + paginated user_answers + client-side Set counting
        const { data: rows } = await supabase.rpc('get_subject_progress', {
          p_user_id: userId,
          p_plan_reset_at: planResetAt || null,
        }) as { data: { subject: string; total: number; done_all: number }[] | null }

        const subjectProgress: Record<string, { total: number; done: number }> = {}
        const subjects = new Set<string>()

        // Load subject list from cached meta (fast — single row)
        const { data: meta } = await supabase.from('question_meta_cache').select('subjects').single()
        for (const s of ((meta?.subjects ?? []) as string[])) subjects.add(s)

        for (const r of (rows ?? [])) {
          subjectProgress[r.subject] = { total: Number(r.total), done: Number(r.done_all) }
          subjects.add(r.subject)
        }
        // Ensure meta subjects with 0 questions still appear
        for (const s of subjects) {
          if (!(s in subjectProgress)) subjectProgress[s] = { total: 0, done: 0 }
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
