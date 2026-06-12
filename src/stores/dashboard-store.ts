import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  // Actions
  setChartCache: (data: ChartData, key: string) => void
  getChartCache: (key: string) => ChartData | null
  setQMetaCache: (data: QMeta[]) => void
  getQMetaCache: () => QMeta[] | null
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
