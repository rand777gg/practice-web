import { useEffect, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Clock, RotateCcw, Star } from 'lucide-react'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { DashboardPlanCards } from '@/components/layout/DashboardPlanCards'
import { useT } from '@/i18n/use-t'

const DailyGoalHeatmap = lazy(() => import('@/components/charts/DailyGoalHeatmap').then(m => ({ default: m.DailyGoalHeatmap })))
const StackedBar = lazy(() => import('@/components/charts/StackedBarChart').then(m => ({ default: m.StackedBarChart })))
const SubjectCategorySunburst = lazy(() => import('@/components/charts/SubjectCategorySunburst').then(m => ({ default: m.SubjectCategorySunburst })))
const SubjectDonutCharts = lazy(() => import('@/components/charts/SubjectDonutCharts').then(m => ({ default: m.SubjectDonutCharts })))

const ChartFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
  </div>
)

interface ChartData {
  totalAnswered: number
  correctCount: number
  wrongCount: number
  dailyAnswers: { date: string; count: number }[]
  barData: { date: string; correct: number; wrong: number }[]
  sunburstData: { subject: string; category: string }[]
  dailyGoal: number
}

export function Component() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const now = new Date()
      const start12wk = new Date(now)
      start12wk.setDate(start12wk.getDate() - 12 * 7)
      const start14d = new Date(now)
      start14d.setDate(start14d.getDate() - 14)

      const [{ data: answers }, { data: questions }] = await Promise.all([
        supabase
          .from('user_answers')
          .select('is_correct, answered_at, question_id')
          .eq('user_id', user!.id)
          .gte('answered_at', start12wk.toISOString()),
        supabase.from('questions').select('id, subject, category'),
      ])

      const qMap = new Map<string, { subject: string; category: string }>()
      for (const q of questions ?? []) {
        qMap.set(q.id, { subject: q.subject ?? '', category: q.category ?? '' })
      }

      let correctCount = 0
      const dailyMap = new Map<string, { correct: number; wrong: number; ids: Set<string> }>()

      for (const a of answers ?? []) {
        const day = (a.answered_at as string).slice(0, 10)
        if (!dailyMap.has(day)) dailyMap.set(day, { correct: 0, wrong: 0, ids: new Set() })
        const entry = dailyMap.get(day)!
        entry.ids.add(a.question_id)
        if (a.is_correct) { correctCount++; entry.correct++ }
        else entry.wrong++
      }

      const totalAnswered = (answers ?? []).length
      const wrongCount = totalAnswered - correctCount

      // Daily answers for heatmap
      const dailyAnswers = Array.from(dailyMap.entries()).map(([date, v]) => ({
        date,
        count: v.ids.size,
      }))

      // Bar data for last 14 days
      const barData: { date: string; correct: number; wrong: number }[] = []
      for (let d = new Date(start14d); d <= now; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        const entry = dailyMap.get(key)
        barData.push({ date: key, correct: entry?.correct ?? 0, wrong: entry?.wrong ?? 0 })
      }

      // Sunburst data from all questions (not just answered)
      const sunburstData = (questions ?? []).map((q) => ({
        subject: q.subject || '',
        category: q.category || '',
      }))

      // Daily goal
      const deadline = profile?.deadline
      const planSubjects: string[] = (() => {
        if (!profile?.plan_subjects) return []
        try { return JSON.parse(profile.plan_subjects) as string[] } catch { return [] }
      })()
      let dailyGoal = 0
      if (deadline) {
        const scopeIds = new Set(
          (questions ?? [])
            .filter((q) => planSubjects.length === 0 || planSubjects.includes(q.subject ?? ''))
            .map((q) => q.id),
        )
        const distinctDone = new Set(
          (answers ?? [])
            .filter((a) => scopeIds.has(a.question_id))
            .map((a) => a.question_id),
        )
        const totalInScope = scopeIds.size
        const remaining = Math.max(totalInScope - distinctDone.size, 0)
        const daysLeft = Math.max(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000), 1)
        dailyGoal = Math.ceil(remaining / daysLeft)
      }

      setChartData({ totalAnswered, correctCount, wrongCount, dailyAnswers, barData, sunburstData, dailyGoal })
      setIsLoading(false)
    }
    load()
  }, [user, profile?.deadline, profile?.plan_subjects])

  if (isLoading) {
    return (
      <LoadingTips className="py-12" compact />
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">{t('dashboard.title')}</h1>
        {chartData && chartData.totalAnswered > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/practice">
                <Pencil className="h-4 w-4" />
                {t('dashboard.startPractice')}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/exam">
                <Clock className="h-4 w-4" />
                {t('dashboard.takeExam')}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/favorites">
                <Star className="h-4 w-4" />
                {t('nav.favorites')}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/review">
                <RotateCcw className="h-4 w-4" />
                {t('dashboard.reviewMistakes')}
              </Link>
            </Button>
          </div>
        )}
      </div>

      <DashboardPlanCards />

      {!chartData || (chartData.totalAnswered === 0 && chartData.sunburstData.length === 0) ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{t('dashboard.noData')}</p>
          <Button asChild size="sm">
            <Link to="/practice">
              <Pencil className="h-4 w-4" />
              {t('dashboard.startPractice')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartFallback />}>
                  <StackedBar data={chartData.barData} />
                </Suspense>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectCategory')}</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.sunburstData.length > 0 ? (
                  <Suspense fallback={<ChartFallback />}>
                    <SubjectCategorySunburst data={chartData.sunburstData} />
                  </Suspense>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noData')}</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartFallback />}>
                  <DailyGoalHeatmap data={chartData.dailyAnswers} dailyGoal={chartData.dailyGoal} />
                </Suspense>
              </CardContent>
            </Card>
          </div>

          {chartData.sunburstData.length > 0 && (
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartFallback />}>
                  <SubjectDonutCharts data={chartData.sunburstData} />
                </Suspense>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </div>
  )
}
