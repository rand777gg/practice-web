import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface PlanCache {
  allSubjects: string[]
  subjectProgress: Record<string, { total: number; done: number }>
  fetchedAt: number
  refreshVersion: number
}

const PLAN_CACHE_TTL = 60_000 // 1 minute — frequent enough for progress, cheap enough to not hammer DB

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
  fetchPlanCache: (userId: string, refreshVersion?: number) => Promise<PlanCache>
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

      fetchPlanCache: async (userId, refreshVersion = 0) => {
        const state = get()
        if (state.planCache && Date.now() - state.planCache.fetchedAt < PLAN_CACHE_TTL && state.planCache.refreshVersion === refreshVersion) return state.planCache

        // Load subject list from cached meta
        const { data: meta } = await supabase.from('question_meta_cache').select('subjects').single()
        const metaSubjects: string[] = (meta?.subjects ?? []) as string[]

        // Paginate questions to get subject → ids
        const PAGE = 1000
        let from = 0
        const subjectIds = new Map<string, Set<string>>()
        const counts = new Map<string, number>()
        for (const s of metaSubjects) counts.set(s, 0)

        while (true) {
          const { data: page } = await supabase.from('questions').select('id, subject').order('id').range(from, from + PAGE - 1)
          if (!page || page.length === 0) break
          for (const q of page) {
            const s = q.subject || 'Other'
            if (!counts.has(s)) counts.set(s, 0)
            counts.set(s, (counts.get(s) ?? 0) + 1)
            let ids = subjectIds.get(s)
            if (!ids) { ids = new Set(); subjectIds.set(s, ids) }
            ids.add(q.id)
          }
          if (page.length < PAGE) break
          from += PAGE
        }

        // Paginate user answers
        const doneIds = new Set<string>()
        from = 0
        while (true) {
          const { data: page } = await supabase.from('user_answers').select('question_id').eq('user_id', userId).order('question_id').range(from, from + PAGE - 1)
          if (!page || page.length === 0) break
          for (const a of page) doneIds.add(a.question_id)
          if (page.length < PAGE) break
          from += PAGE
        }

        // Build progress
        const subjectProgress: Record<string, { total: number; done: number }> = {}
        for (const [subject, ids] of subjectIds) {
          let done = 0
          for (const id of ids) { if (doneIds.has(id)) done++ }
          subjectProgress[subject] = { total: ids.size, done }
        }
        // Include subjects from meta that have 0 questions
        for (const s of metaSubjects) {
          if (!(s in subjectProgress)) subjectProgress[s] = { total: (counts.get(s) ?? 0), done: 0 }
        }

        const cache: PlanCache = {
          allSubjects: [...new Set([...subjectIds.keys(), ...metaSubjects])].sort(),
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
