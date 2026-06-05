import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Clock, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { DailyGoalHeatmap } from '@/components/charts/DailyGoalHeatmap'
import { StackedBarChart as StackedBar } from '@/components/charts/StackedBarChart'
import { SubjectCategorySunburst } from '@/components/charts/SubjectCategorySunburst'
import { useT } from '@/i18n/use-t'

interface ChartData {
  totalAnswered: number
  correctCount: number
  wrongCount: number
  dailyAnswers: { date: string; count: number }[]
  barData: { date: string; correct: number; wrong: number }[]
  sunburstData: { subject: string; category: string }[]
  dailyGoal: number
}

interface Metrics {
  todayRate: number | null
  yesterdayRate: number | null
  overallRate: number | null
  overallRateLastWeek: number | null
  weekAvgTime: number | null
  lastWeekAvgTime: number | null
  weekAvgScore: number | null
  lastWeekAvgScore: number | null
}

function trend(val: number | null, prev: number | null) {
  if (val == null || prev == null) return null
  if (val > prev) return 'up'
  if (val < prev) return 'down'
  return null
}

export function Component() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const now = new Date()
      const start12wk = new Date(now)
      start12wk.setDate(start12wk.getDate() - 12 * 7)
      const start14d = new Date(now)
      start14d.setDate(start14d.getDate() - 14)

      const todayStr = now.toISOString().slice(0, 10)
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

      const [{ data: answers }, { data: questions }, { data: todayAnswers }, { data: yesterdayAnswers }, { data: exams }] = await Promise.all([
        supabase
          .from('user_answers')
          .select('is_correct, answered_at, question_id')
          .eq('user_id', user!.id)
          .gte('answered_at', start12wk.toISOString()),
        supabase.from('questions').select('id, subject, category'),
        supabase.from('user_answers').select('is_correct').eq('user_id', user!.id).gte('answered_at', todayStr).lt('answered_at', now.toISOString()),
        supabase.from('user_answers').select('is_correct').eq('user_id', user!.id).gte('answered_at', yesterdayStr).lt('answered_at', todayStr),
        supabase.from('exam_sessions').select('score, duration_ms, completed_at').eq('user_id', user!.id).eq('status', 'completed'),
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
      let dailyGoal = 0
      if (deadline) {
        const totalQuestions = questions?.length ?? 0
        const distinctDone = new Set((answers ?? []).map((a) => a.question_id))
        const remaining = Math.max(totalQuestions - distinctDone.size, 0)
        const daysLeft = Math.max(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000), 1)
        dailyGoal = Math.ceil(remaining / daysLeft)
      }

      // Metrics
      const todayTotal = (todayAnswers ?? []).length
      const todayCorrect = (todayAnswers ?? []).filter((a) => a.is_correct).length
      const todayRate = todayTotal > 0 ? Math.round((todayCorrect / todayTotal) * 100) : null
      const yesterdayTotal = (yesterdayAnswers ?? []).length
      const yesterdayCorrect = (yesterdayAnswers ?? []).filter((a) => a.is_correct).length
      const yesterdayRate = yesterdayTotal > 0 ? Math.round((yesterdayCorrect / yesterdayTotal) * 100) : null

      const overallRate = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : null
      const answersLastWeek = (answers ?? []).filter((a) => (a.answered_at as string) < weekAgo.toISOString())
      const lastWeekTotal = answersLastWeek.length
      const lastWeekCorrect = answersLastWeek.filter((a) => a.is_correct).length
      const overallRateLastWeek = lastWeekTotal > 0 ? Math.round((lastWeekCorrect / lastWeekTotal) * 100) : null

      const thisWeekExams = (exams ?? []).filter((e) => e.completed_at && new Date(e.completed_at) >= weekAgo)
      const lastWeekExams = (exams ?? []).filter((e) => e.completed_at && new Date(e.completed_at) >= twoWeeksAgo && new Date(e.completed_at) < weekAgo)
      const weekAvgTime = thisWeekExams.length > 0 ? Math.round(thisWeekExams.reduce((s, e) => s + (e.duration_ms ?? 0), 0) / thisWeekExams.length / 1000) : null
      const lastWeekAvgTime = lastWeekExams.length > 0 ? Math.round(lastWeekExams.reduce((s, e) => s + (e.duration_ms ?? 0), 0) / lastWeekExams.length / 1000) : null
      const weekAvgScore = thisWeekExams.length > 0 ? Math.round(thisWeekExams.reduce((s, e) => s + (e.score ?? 0), 0) / thisWeekExams.length) : null
      const lastWeekAvgScore = lastWeekExams.length > 0 ? Math.round(lastWeekExams.reduce((s, e) => s + (e.score ?? 0), 0) / lastWeekExams.length) : null

      setMetrics({ todayRate, yesterdayRate, overallRate, overallRateLastWeek, weekAvgTime, lastWeekAvgTime, weekAvgScore, lastWeekAvgScore })
      setChartData({ totalAnswered, correctCount, wrongCount, dailyAnswers, barData, sunburstData, dailyGoal })
      setIsLoading(false)
    }
    load()
  }, [user, profile?.deadline])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('dashboard.title')}</h1>

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
          {metrics && (
            <Card className="border-0 shadow-none">
              <CardContent className="py-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {([
                    { label: t('dashboard.todayCorrectRate'), value: metrics.todayRate != null ? `${metrics.todayRate}%` : '-', tr: trend(metrics.todayRate, metrics.yesterdayRate) },
                    { label: t('dashboard.overallCorrectRate'), value: metrics.overallRate != null ? `${metrics.overallRate}%` : '-', tr: trend(metrics.overallRate, metrics.overallRateLastWeek) },
                    { label: t('dashboard.avgExamTime'), value: metrics.weekAvgTime != null ? `${Math.floor(metrics.weekAvgTime / 60)}min` : '-', tr: trend(metrics.lastWeekAvgTime, metrics.weekAvgTime) },
                    { label: t('dashboard.avgExamScore'), value: metrics.weekAvgScore != null ? `${metrics.weekAvgScore}` : '-', tr: trend(metrics.weekAvgScore, metrics.lastWeekAvgScore) },
                  ] as const).map((m) => (
                    <div key={m.label} className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xl font-bold">{m.value}</span>
                        {m.tr === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {m.tr === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <StackedBar data={chartData.barData} />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectCategory')}</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.sunburstData.length > 0 ? (
                  <SubjectCategorySunburst data={chartData.sunburstData} />
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
                <DailyGoalHeatmap data={chartData.dailyAnswers} dailyGoal={chartData.dailyGoal} />
              </CardContent>
            </Card>
          </div>

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
              <Link to="/review">
                <RotateCcw className="h-4 w-4" />
                {t('dashboard.reviewMistakes')}
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
