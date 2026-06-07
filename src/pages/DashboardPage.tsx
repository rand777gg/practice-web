import { useEffect, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Clock, RotateCcw, Star, CalendarDays, PieChart, Target } from 'lucide-react'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { DashboardPlanCards } from '@/components/layout/DashboardPlanCards'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useT } from '@/i18n/use-t'

const DailyGoalHeatmap = lazy(() => import('@/components/charts/DailyGoalHeatmap').then(m => ({ default: m.DailyGoalHeatmap })))
const SubjectCategorySunburst = lazy(() => import('@/components/charts/SubjectCategorySunburst').then(m => ({ default: m.SubjectCategorySunburst })))
const SubjectDonutCharts = lazy(() => import('@/components/charts/SubjectDonutCharts').then(m => ({ default: m.SubjectDonutCharts })))
const SubjectAccuracyCharts = lazy(() => import('@/components/charts/SubjectAccuracyCharts').then(m => ({ default: m.SubjectAccuracyCharts })))
const SubjectRankChart = lazy(() => import('@/components/charts/SubjectRankChart').then(m => ({ default: m.SubjectRankChart })))
const TimeDistributionHistogram = lazy(() => import('@/components/charts/TimeDistributionHistogram').then(m => ({ default: m.TimeDistributionHistogram })))
const AnswerTimeScatterHistogram = lazy(() => import('@/components/charts/AnswerTimeScatterHistogram').then(m => ({ default: m.AnswerTimeScatterHistogram })))
const TimeScatterChart = lazy(() => import('@/components/charts/TimeScatterChart').then(m => ({ default: m.TimeScatterChart })))

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
  sunburstData: { subject: string; category: string; questionType: string }[]
  dailyGoal: number
  hourlyDistribution: number[][] // 7 rows (Mon-Sun) x 24 cols (hours)
  dailySubjectData: { dates: string[]; subjects: string[]; data: Record<string, number>[] }
  todayHourlyData: number[] // 24 hours, count of answers today
  subjectAccuracy: { subject: string; correct: number; total: number }[]
  heatmapData: { subject: string; questionType: string; correctRate: number; total: number }[]
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
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const start12wk = new Date(today)
      start12wk.setDate(start12wk.getDate() - 12 * 7)
      const start7d = new Date(today)
      start7d.setDate(start7d.getDate() - 7)
      const end7d = new Date(today)
      end7d.setDate(end7d.getDate() + 7)

      const [{ data: answers }, { data: questions }] = await Promise.all([
        supabase
          .from('user_answers')
          .select('is_correct, answered_at, question_id')
          .eq('user_id', user!.id)
          .gte('answered_at', start12wk.toISOString()),
        supabase.from('questions').select('id, subject, category, question_type'),
      ])

      function normalizeSubject(s: string): string {
        return /^\d{4}真题$/.test(s) ? '真题' : s
      }

      const qMap = new Map<string, { subject: string; category: string; questionType: string }>()
      for (const q of questions ?? []) {
        qMap.set(q.id, { subject: normalizeSubject(q.subject ?? ''), category: q.category ?? '', questionType: q.question_type ?? '' })
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

      // Bar data for today ±7 days (15 days)
      const barData: { date: string; correct: number; wrong: number }[] = []
      for (let d = new Date(start7d); d <= end7d; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        const entry = dailyMap.get(key)
        barData.push({ date: key, correct: entry?.correct ?? 0, wrong: entry?.wrong ?? 0 })
      }

      // Sunburst data from all questions (not just answered)
      const sunburstData = (questions ?? []).map((q) => ({
        subject: normalizeSubject(q.subject || ''),
        category: q.category || '',
        questionType: q.question_type || '',
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

      // Today's hourly distribution
      const todayStr = today.toISOString().slice(0, 10)
      const todayHourlyData = new Array(24).fill(0)
      for (const a of answers ?? []) {
        if ((a.answered_at as string).slice(0, 10) === todayStr) {
          todayHourlyData[new Date(a.answered_at as string).getHours()]++
        }
      }

      // Hourly distribution by day of week: 7 rows (Mon=0..Sun=6) x 24 hours
      const hourlyDistribution = Array.from({ length: 7 }, () => new Array(24).fill(0))
      for (const a of answers ?? []) {
        const d = new Date(a.answered_at as string)
        const dayOfWeek = (d.getDay() + 6) % 7 // Sun=0 -> Mon=0, Sun=6
        const h = d.getHours()
        hourlyDistribution[dayOfWeek][h]++
      }

      // Daily subject stacked bar data for today ±7 days (15 days)
      const dailySubjectDates: string[] = []
      const subjectSet = new Set<string>()
      const dateSubjectMap = new Map<string, Map<string, number>>()
      for (let d = new Date(start7d); d <= end7d; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        dailySubjectDates.push(key)
        dateSubjectMap.set(key, new Map())
      }
      for (const a of answers ?? []) {
        const dateKey = (a.answered_at as string).slice(0, 10)
        const daySubjectMap = dateSubjectMap.get(dateKey)
        if (!daySubjectMap) continue
        const qInfo = qMap.get(a.question_id)
        const subject = qInfo?.subject || '未分类'
        subjectSet.add(subject)
        daySubjectMap.set(subject, (daySubjectMap.get(subject) ?? 0) + 1)
      }
      const dailySubjectSubjects = Array.from(subjectSet)
      const dailySubjectData = dailySubjectDates.map((date) => {
        const dayMap = dateSubjectMap.get(date)!
        const row: Record<string, number> = {}
        for (const s of dailySubjectSubjects) {
          row[s] = dayMap.get(s) ?? 0
        }
        return row
      })

      // Subject accuracy
      const subjAccMap = new Map<string, { correct: number; total: number }>()
      const heatmapMap = new Map<string, { correct: number; total: number }>()
      for (const a of answers ?? []) {
        const q = qMap.get(a.question_id)
        const subj = q?.subject || '未分类'
        if (!subjAccMap.has(subj)) subjAccMap.set(subj, { correct: 0, total: 0 })
        const sa = subjAccMap.get(subj)!
        sa.total++
        if (a.is_correct) sa.correct++
        const qt = q?.questionType || '未分类'
        const hk = `${subj}|||${qt}`
        if (!heatmapMap.has(hk)) heatmapMap.set(hk, { correct: 0, total: 0 })
        const hm = heatmapMap.get(hk)!
        hm.total++
        if (a.is_correct) hm.correct++
      }
      const subjectAccuracy = [...subjAccMap.entries()]
        .map(([subject, v]) => ({ subject, ...v }))
        .filter((s) => s.total > 0)
      const heatmapData = [...heatmapMap.entries()]
        .map(([key, v]) => {
          const [subject, questionType] = key.split('|||')
          return { subject, questionType, correctRate: v.total > 0 ? v.correct / v.total : 0, total: v.total }
        })

      setChartData({
        totalAnswered, correctCount, wrongCount, dailyAnswers, barData, sunburstData, dailyGoal, hourlyDistribution,
        dailySubjectData: { dates: dailySubjectDates, subjects: dailySubjectSubjects, data: dailySubjectData },
        todayHourlyData, subjectAccuracy, heatmapData,
      })
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
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="justify-center">
            <TabsTrigger value="today" className="gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.tabStats')}</span>
            </TabsTrigger>
            <TabsTrigger value="subjects" className="gap-1.5">
              <PieChart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.tabSubjects')}</span>
            </TabsTrigger>
            <TabsTrigger value="journey" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.tabJourney')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today">
            <div className="space-y-4">
              <DashboardPlanCards />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                <Card className="border-0 shadow-none flex flex-col">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm text-muted-foreground">做题时间分布</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<ChartFallback />}>
                      <TimeDistributionHistogram data={chartData.hourlyDistribution} />
                    </Suspense>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none flex flex-col">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm text-muted-foreground">做题时间散点</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<ChartFallback />}>
                      <TimeScatterChart data={chartData.todayHourlyData} />
                    </Suspense>
                  </CardContent>
                </Card>
              </div>
              <Card className="border-0 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">每日答题分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<ChartFallback />}>
                    <AnswerTimeScatterHistogram
                      dates={chartData.dailySubjectData.dates}
                      subjects={chartData.dailySubjectData.subjects}
                      data={chartData.dailySubjectData.data}
                      barData={chartData.barData}
                    />
                  </Suspense>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">正确率分析</CardTitle>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<ChartFallback />}>
                    <SubjectAccuracyCharts
                      subjectAccuracy={chartData.subjectAccuracy}
                      heatmapData={chartData.heatmapData}
                    />
                  </Suspense>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="subjects">
            <div className="space-y-4">
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
              <Card className="border-0 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectBreakdown')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Suspense fallback={<ChartFallback />}>
                      <SubjectDonutCharts data={chartData.sunburstData} />
                    </Suspense>
                    <Suspense fallback={<ChartFallback />}>
                      <SubjectRankChart data={chartData.sunburstData} />
                    </Suspense>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="journey">
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartFallback />}>
                  <DailyGoalHeatmap data={chartData.dailyAnswers} dailyGoal={chartData.dailyGoal} />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
