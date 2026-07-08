import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScrollArea, Spinner } from '@radix-ui/themes'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { prefetchQuestions, clearPrefetchedQuestions } from '@/lib/offline-db'
import { hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Clock, RotateCcw, Star, CalendarDays, PieChart, Target, BookOpen, ListChecks } from 'lucide-react'
import { DashboardPlanCards } from '@/components/layout/DashboardPlanCards'
import { DashboardEbbinghaus } from '@/components/layout/DashboardEbbinghaus'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkeletonCard } from '@/components/ui/skeleton'
import { LazyChart } from '@/components/layout/LazyChart'
import { useT } from '@/i18n/use-t'

const DailyGoalHeatmap = lazy(() => import('@/components/charts/DailyGoalHeatmap').then(m => ({ default: m.DailyGoalHeatmap })))
const SubjectCategorySunburst = lazy(() => import('@/components/charts/SubjectCategorySunburst').then(m => ({ default: m.SubjectCategorySunburst })))
const SubjectAccuracyCharts = lazy(() => import('@/components/charts/SubjectAccuracyCharts').then(m => ({ default: m.SubjectAccuracyCharts })))
const SubjectDonutCharts = lazy(() => import('@/components/charts/SubjectDonutCharts').then(m => ({ default: m.SubjectDonutCharts })))
const SubjectTreemap = lazy(() => import('@/components/charts/SubjectTreemap').then(m => ({ default: m.SubjectTreemap })))
const TimeDistributionHistogram = lazy(() => import('@/components/charts/TimeDistributionHistogram').then(m => ({ default: m.TimeDistributionHistogram })))
const AnswerTimeScatterHistogram = lazy(() => import('@/components/charts/AnswerTimeScatterHistogram').then(m => ({ default: m.AnswerTimeScatterHistogram })))
const TimeScatterChart = lazy(() => import('@/components/charts/TimeScatterChart').then(m => ({ default: m.TimeScatterChart })))
const AiChartInsight = lazy(() => import('@/components/charts/AiChartInsight').then(m => ({ default: m.AiChartInsight })))

const ChartSkeleton = ({ h = 360 }: { h?: number }) => (
  <div className="animate-pulse space-y-3 p-4" style={{ height: h }}>
    <div className="h-4 w-1/3 bg-muted rounded" />
    <div className="flex gap-4 flex-1" style={{ height: h - 48 }}>
      <div className="flex-1 space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-muted rounded" style={{ width: `${60 + Math.random() * 35}%` }} />
        ))}
      </div>
      <div className="flex-1">
        <div className="h-full w-full bg-muted rounded-xl" />
      </div>
    </div>
  </div>
)

interface ChartData {
  totalAnswered: number
  correctCount: number
  wrongCount: number
  checkinDays: number
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

interface QMeta { id: string; subject: string; category: string; categories: string[]; question_type: string }

export function Component() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const { isEnabled } = useSettingsStore()
  const showAiInsight = hasAiConfig() && isEnabled('analysis')
  const dashboardStore = useDashboardStore()

  const cacheKey = `${user?.id}|${profile?.deadline}|${profile?.plan_subjects}`
  const hasCache = !!(dashboardStore.getChartCache(cacheKey))

  const [chartData, setChartData] = useState<ChartData | null>(hasCache ? dashboardStore.chartData : null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedBtn, setExpandedBtn] = useState<number | null>(null)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['plan']))
  const [chartsRequested, setChartsRequested] = useState(false)
  const needsCharts = chartsRequested || visitedTabs.has('stats') || visitedTabs.has('subjects') || visitedTabs.has('journey')
  const btnRowRef = useRef<HTMLDivElement>(null)
  const loadGenRef = useRef(0)

  useEffect(() => {
    if (expandedBtn === null) return
    const handler = (e: MouseEvent) => {
      if (btnRowRef.current && !btnRowRef.current.contains(e.target as Node)) {
        setExpandedBtn(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expandedBtn])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const isStale = (gen: number) => loadGenRef.current !== gen || cancelled
    async function load() {
      // ponytail: skip heavy chart queries until user visits a chart tab
      if (!needsCharts) return
      loadGenRef.current++
      const myGen = loadGenRef.current

      if (chartData) setIsRefreshing(true)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const start12wk = new Date(today)
      start12wk.setDate(start12wk.getDate() - 12 * 7)
      const start7d = new Date(today)
      start7d.setDate(start7d.getDate() - 7)
      const end7d = new Date(today)
      end7d.setDate(end7d.getDate() + 7)

      // Questions metadata: try cache first, otherwise fetch (without heavy key_points)
      let questions = dashboardStore.getQMetaCache()
      const qFetchPromise = questions
        ? Promise.resolve(null)
        : supabase.from('questions').select('id, subject, category, categories, question_type')
            .then(({ data }) => { if (data) dashboardStore.setQMetaCache(data as QMeta[]); return null })

      // Pre-aggregated daily stats (lightweight — replaces raw user_answers for charts)
      const [{ data: statsRows }, { data: kgAnswers }] = await Promise.all([
        supabase
          .from('user_daily_stats')
          .select('date, subject, question_type, total, correct, hourly')
          .eq('user_id', user!.id)
          .gte('date', start12wk.toISOString().slice(0, 10)),
        supabase
          .from('user_answers')
          .select('question_id')
          .eq('user_id', user!.id),
        qFetchPromise,
      ])
      if (isStale(myGen)) { setIsRefreshing(false); return }

      if (!questions) {
        const { data: fresh } = await supabase.from('questions').select('id, subject, category, categories, question_type')
        if (isStale(myGen)) { setIsRefreshing(false); return }
        questions = (fresh ?? []) as QMeta[]
        dashboardStore.setQMetaCache(questions)
      }

      type StatsRow = { date: string; subject: string; question_type: string; total: number; correct: number; hourly: number[] }
      const rows = (statsRows ?? []) as StatsRow[]

      let correctCount = 0
      let totalAnswered = 0
      const dailyMap = new Map<string, { correct: number; wrong: number; total: number }>()
      const dateSubjectMap = new Map<string, Map<string, number>>()
      const subjectSet = new Set<string>()
      const subjAccMap = new Map<string, { correct: number; total: number }>()
      const heatmapMap = new Map<string, { correct: number; total: number }>()
      const hourlyDistribution = Array.from({ length: 7 }, () => new Array(24).fill(0))
      let todayHourlyData = new Array(24).fill(0)
      const todayStr = today.toISOString().slice(0, 10)

      for (const r of rows) {
        totalAnswered += r.total
        correctCount += r.correct

        // Daily map
        if (!dailyMap.has(r.date)) dailyMap.set(r.date, { correct: 0, wrong: 0, total: 0 })
        const dm = dailyMap.get(r.date)!
        dm.correct += r.correct
        dm.wrong += r.total - r.correct
        dm.total += r.total

        // Date-subject map (for 15-day window)
        if (r.date >= start7d.toISOString().slice(0, 10)) {
          if (!dateSubjectMap.has(r.date)) dateSubjectMap.set(r.date, new Map())
          const dsm = dateSubjectMap.get(r.date)!
          const subj = r.subject || '未分类'
          subjectSet.add(subj)
          dsm.set(subj, (dsm.get(subj) ?? 0) + r.total)
        }

        // Subject accuracy
        const subj = r.subject || '未分类'
        if (!subjAccMap.has(subj)) subjAccMap.set(subj, { correct: 0, total: 0 })
        const sa = subjAccMap.get(subj)!
        sa.correct += r.correct
        sa.total += r.total

        // Heatmap (subject × question_type)
        const qt = r.question_type || '未分类'
        const hk = `${subj}|||${qt}`
        if (!heatmapMap.has(hk)) heatmapMap.set(hk, { correct: 0, total: 0 })
        const hm = heatmapMap.get(hk)!
        hm.correct += r.correct
        hm.total += r.total

        // Hourly distribution
        const d = new Date(r.date + 'T00:00:00')
        const dayOfWeek = (d.getDay() + 6) % 7
        for (let h = 0; h < 24; h++) {
          if (r.hourly[h]) {
            hourlyDistribution[dayOfWeek][h] += r.hourly[h]
          }
        }

        // Today hourly
        if (r.date === todayStr) {
          const merged = new Array(24).fill(0)
          for (let h = 0; h < 24; h++) merged[h] = todayHourlyData[h] + (r.hourly[h] ?? 0)
          todayHourlyData = merged
        }
      }

      const wrongCount = totalAnswered - correctCount
      const checkinDays = dailyMap.size

      // Daily answers for heatmap
      const dailyAnswers = Array.from(dailyMap.entries()).map(([date, v]) => ({
        date,
        count: v.total,
      }))

      // Bar data for today ±7 days (15 days)
      const barData: { date: string; correct: number; wrong: number }[] = []
      for (let d = new Date(start7d); d <= end7d; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        const entry = dailyMap.get(key)
        barData.push({ date: key, correct: entry?.correct ?? 0, wrong: entry?.wrong ?? 0 })
      }

      // Sunburst — one row per category (explode multi-category questions)
      const sunburstData: { subject: string; category: string; questionType: string }[] = []
      for (const q of questions ?? []) {
        const cats = q.categories?.length ? q.categories : [q.category || '']
        for (const c of cats) {
          sunburstData.push({
            subject: /^\d{4}真题$/.test(q.subject || '') ? '真题' : q.subject || '',
            category: c || '',
            questionType: q.question_type || '',
          })
        }
      }

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
        // Use knowledge-graph answers for question-level uniqueness
        const distinctDone = new Set(
          (kgAnswers ?? [])
            .filter((a: { question_id: string }) => scopeIds.has(a.question_id))
            .map((a: { question_id: string }) => a.question_id),
        )
        const totalInScope = scopeIds.size
        const remaining = Math.max(totalInScope - distinctDone.size, 0)
        const daysLeft = Math.max(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000), 1)
        dailyGoal = Math.ceil(remaining / daysLeft)
      }

      // Daily subject data (15-day window)
      const dailySubjectDates: string[] = []
      for (let d = new Date(start7d); d <= end7d; d.setDate(d.getDate() + 1)) {
        dailySubjectDates.push(d.toISOString().slice(0, 10))
      }
      const dailySubjectSubjects = Array.from(subjectSet)
      const dailySubjectData = dailySubjectDates.map((date) => {
        const dayMap = dateSubjectMap.get(date)
        const row: Record<string, number> = {}
        for (const s of dailySubjectSubjects) {
          row[s] = dayMap?.get(s) ?? 0
        }
        return row
      })

      const subjectAccuracy = [...subjAccMap.entries()]
        .map(([subject, v]) => ({ subject, ...v }))
        .filter((s) => s.total > 0)
      const heatmapData = [...heatmapMap.entries()]
        .map(([key, v]) => {
          const [subject, questionType] = key.split('|||')
          return { subject, questionType, correctRate: v.total > 0 ? v.correct / v.total : 0, total: v.total }
        })

      setChartData({
        totalAnswered, correctCount, wrongCount, checkinDays, dailyAnswers, barData, sunburstData, dailyGoal, hourlyDistribution,
        dailySubjectData: { dates: dailySubjectDates, subjects: dailySubjectSubjects, data: dailySubjectData },
        todayHourlyData, subjectAccuracy, heatmapData,
      })
      dashboardStore.setChartCache({
        totalAnswered, correctCount, wrongCount, checkinDays, dailyAnswers, barData, sunburstData, dailyGoal, hourlyDistribution,
        dailySubjectData: { dates: dailySubjectDates, subjects: dailySubjectSubjects, data: dailySubjectData },
        todayHourlyData, subjectAccuracy, heatmapData,
      }, cacheKey)
      setIsRefreshing(false)

      // Background incremental sync questions for offline practice
      const prefetchGen = myGen
      ;(async () => {
        try {
          const SYNC_TS_KEY = 'q_last_sync_ts'
          const lastSync = localStorage.getItem(SYNC_TS_KEY)
          // ponytail: exclude analysis/key_points/answer_explanation to cut ~60% egress; offline practice doesn't need them
          let query = supabase.from('questions').select('id,question_type,question_text,options,correct_answer,category,categories,subject,seq_number,created_at,updated_at,created_by,verified,import_mode,allow_unordered')
          if (lastSync) {
            query = query.gte('updated_at', lastSync)
          }
          const { data } = await query
          if (loadGenRef.current !== prefetchGen) return
          if (data && data.length > 0) {
            // Full sync on first run; incremental upsert thereafter
            if (!lastSync) await clearPrefetchedQuestions()
            if (loadGenRef.current !== prefetchGen) return
            await prefetchQuestions(data.map((q: Record<string, unknown>) => ({ id: q.id as string, data: q })))
          }
          localStorage.setItem(SYNC_TS_KEY, new Date().toISOString())
        } catch { /* best-effort */ }
      })()
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, profile?.deadline, profile?.plan_subjects, needsCharts])

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-2 pb-1">
        <h1 className="text-xl lg:text-2xl font-bold">{t('dashboard.title')}</h1>
        {isRefreshing && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Spinner size="1" />
            更新中
          </div>
        )}
      </div>

      <Tabs
        defaultValue="plan"
        className="w-full"
        onValueChange={(v) => {
          setVisitedTabs((prev) => new Set(prev).add(v))
          if (v !== 'plan') setChartsRequested(true)
        }}
      >
        <ScrollArea scrollbars="horizontal">
          <TabsList className="justify-center">
            <TabsTrigger value="plan" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('dashboard.tabPlan')}</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('dashboard.tabStats')}</span>
            </TabsTrigger>
            <TabsTrigger value="subjects" className="gap-1.5">
              <PieChart className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('dashboard.tabSubjects')}</span>
            </TabsTrigger>
            <TabsTrigger value="journey" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('dashboard.tabJourney')}</span>
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

          <TabsContent value="plan">
            <div className="space-y-4">
              <DashboardPlanCards />
              <DashboardEbbinghaus />
              <div className="xl:hidden flex items-center gap-2 overflow-x-auto" ref={btnRowRef}>
                {([
                  { icon: Pencil, label: t('dashboard.startPractice'), to: '/practice', variant: 'default' as const },
                  { icon: Clock, label: t('dashboard.takeExam'), to: '/exam', variant: 'default' as const },
                  { icon: Star, label: t('nav.favorites'), to: '/favorites', variant: 'outline' as const },
                  { icon: RotateCcw, label: t('dashboard.reviewMistakes'), to: '/review', variant: 'outline' as const },
                  { icon: BookOpen, label: t('nav.publicNotes'), to: '/notes', variant: 'outline' as const },
                ]).map((btn, i) => {
                  const isExpanded = expandedBtn === i
                  const Icon = btn.icon
                  return (
                    <Button
                      key={btn.to}
                      variant={btn.variant}
                      size="sm"
                      className={`shrink-0 gap-0 transition-all duration-300 ease-out sm:px-3 sm:gap-2 ${isExpanded ? 'px-3 gap-2' : 'px-1.5'}`}
                      onClick={() => {
                        if (window.innerWidth >= 640) {
                          navigate(btn.to)
                        } else if (isExpanded) {
                          setExpandedBtn(null)
                          navigate(btn.to)
                        } else {
                          setExpandedBtn(i)
                        }
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ease-out sm:max-w-[120px] sm:opacity-100 sm:pl-0 ${isExpanded ? 'max-w-[120px] opacity-100 pl-2' : 'max-w-0 opacity-0 pl-0'}`}>
                        {btn.label}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stats">
            {visitedTabs.has('stats') && chartData ? (
              <div className="space-y-4">
                <LazyChart>
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">每日答题分布</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Suspense fallback={<ChartSkeleton />}>
                        <AnswerTimeScatterHistogram
                          dates={chartData.dailySubjectData.dates}
                          subjects={chartData.dailySubjectData.subjects}
                          data={chartData.dailySubjectData.data}
                          barData={chartData.barData}
                        />
                      </Suspense>
                      {showAiInsight && (
                      <Suspense fallback={null}>
                        <AiChartInsight
                          title="每日答题分布"
                          dataDesc={`最近15天每日各学科答题量。学科：${chartData.dailySubjectData.subjects.join('、')}。总答题${chartData.totalAnswered}道，正确${chartData.correctCount}道，错误${chartData.wrongCount}道。`}
                        />
                      </Suspense>
                      )}
                    </CardContent>
                  </Card>
                </LazyChart>
                <LazyChart rootMargin="400px">
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">正确率分析</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Suspense fallback={<ChartSkeleton />}>
                        <SubjectAccuracyCharts
                          subjectAccuracy={chartData.subjectAccuracy}
                          heatmapData={chartData.heatmapData}
                        />
                      </Suspense>
                      {showAiInsight && (
                      <Suspense fallback={null}>
                        <AiChartInsight
                          title="正确率分析"
                          dataDesc={`各学科正确率：${chartData.subjectAccuracy.map(s => `${s.subject} ${Math.round((s.correct/s.total)*100)}%(${s.total}题)`).join('、')}`}
                        />
                      </Suspense>
                      )}
                    </CardContent>
                  </Card>
                </LazyChart>
              </div>
            ) : (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </TabsContent>

          <TabsContent value="subjects">
            {visitedTabs.has('subjects') && chartData ? (
              <div className="space-y-4">
                <LazyChart>
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectCategory')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {chartData.sunburstData.length > 0 ? (
                        <>
                          <Suspense fallback={<ChartSkeleton />}>
                            <SubjectCategorySunburst data={chartData.sunburstData} />
                          </Suspense>
                          {showAiInsight && (
                          <Suspense fallback={null}>
                            <AiChartInsight
                              title={t('dashboard.subjectCategory')}
                              dataDesc={`${chartData.sunburstData.length}道题目的学科分类分布。`}
                            />
                          </Suspense>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noData')}</p>
                      )}
                    </CardContent>
                  </Card>
                </LazyChart>
                <LazyChart rootMargin="400px">
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">{t('dashboard.subjectBreakdown')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Suspense fallback={<ChartSkeleton />}>
                          <SubjectDonutCharts data={chartData.sunburstData} />
                        </Suspense>
                        <Suspense fallback={<ChartSkeleton />}>
                          <SubjectTreemap data={chartData.sunburstData} />
                        </Suspense>
                      </div>
                      {showAiInsight && (
                      <Suspense fallback={null}>
                        <AiChartInsight
                          title={t('dashboard.subjectBreakdown')}
                          dataDesc={`${chartData.sunburstData.length}道题目的类型和分类分布。`}
                        />
                      </Suspense>
                      )}
                    </CardContent>
                  </Card>
                </LazyChart>
              </div>
            ) : (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </TabsContent>

          <TabsContent value="journey">
            {visitedTabs.has('journey') && chartData ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="rounded-lg border bg-card px-4 py-3 text-center min-w-[100px]">
                    <p className="text-xs text-muted-foreground">已打卡</p>
                    <p className="text-3xl font-bold tabular-nums">{chartData.checkinDays}</p>
                    <p className="text-xs text-muted-foreground">天</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                  <LazyChart>
                    <Card className="border-0 shadow-none flex flex-col">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm text-muted-foreground">做题时间分布</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Suspense fallback={<ChartSkeleton />}>
                          <TimeDistributionHistogram data={chartData.hourlyDistribution} />
                        </Suspense>
                        {showAiInsight && (
                        <Suspense fallback={null}>
                          <AiChartInsight
                            title="做题时间分布"
                            dataDesc={`一周7天×24小时答题热力分布，总计${chartData.totalAnswered}次答题。`}
                          />
                        </Suspense>
                        )}
                      </CardContent>
                    </Card>
                  </LazyChart>
                  <LazyChart>
                    <Card className="border-0 shadow-none flex flex-col">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm text-muted-foreground">做题时间散点</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Suspense fallback={<ChartSkeleton />}>
                          <TimeScatterChart data={chartData.todayHourlyData} />
                        </Suspense>
                        {showAiInsight && (
                        <Suspense fallback={null}>
                          <AiChartInsight
                            title="做题时间散点"
                            dataDesc={`今日24小时各时段答题数量分布。`}
                          />
                        </Suspense>
                        )}
                      </CardContent>
                    </Card>
                  </LazyChart>
                </div>
                <LazyChart rootMargin="400px">
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyActivity')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Suspense fallback={<ChartSkeleton />}>
                        <DailyGoalHeatmap data={chartData.dailyAnswers} dailyGoal={chartData.dailyGoal} />
                      </Suspense>
                      {showAiInsight && (
                      <Suspense fallback={null}>
                        <AiChartInsight
                          title="每日学习热力图"
                          dataDesc={`全年每日答题热力图，共${chartData.dailyAnswers.length}天有记录，每日目标${chartData.dailyGoal}题。`}
                        />
                      </Suspense>
                      )}
                    </CardContent>
                  </Card>
                </LazyChart>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                <SkeletonCard />
              </div>
            )}
          </TabsContent>

        </Tabs>
    </div>
  )
}
