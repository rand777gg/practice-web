import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScrollArea } from '@radix-ui/themes'
import { Spinner } from '@/components/ui/spinner'
import { fetchAnsweredQuestionIds } from '@/services/practice'
import { fetchQuestionMetaRows, fetchQuestionOfflineRows, type QuestionMetaRow } from '@/services/questions'
import { fetchDailyStats } from '@/services/stats'
import { updateProfile } from '@/services/profiles'
import { logError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { prefetchQuestions, clearPrefetchedQuestions } from '@/lib/offline-db'
import { hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, PieChart, ListChecks } from 'lucide-react'
import { DashboardPlanCards } from '@/components/layout/DashboardPlanCards'
import { DashboardEbbinghaus } from '@/components/layout/DashboardEbbinghaus'
import { SubjectAccuracyTodayList } from '@/components/charts/SubjectAccuracyTodayList'
import { SubjectCompositionDonut, TypeRadarChart, WeekHourHeat } from '@/components/dashboard/DashPreviewTop'
import { YearHeatPreview, MilestonesCard } from '@/components/dashboard/DashJourneyTop'
import { ExamGoalPicker } from '@/components/dashboard/ExamGoalPicker'
import { examGoalLabel } from '@/lib/exam-goals'
import { resolveGoals, getPlanSubjects } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkeletonCard } from '@/components/ui/skeleton'
import { LazyChart } from '@/components/layout/LazyChart'
import { useT } from '@/i18n/use-t'
import { PlanCompletionChart } from '@/components/charts/PlanCompletionChart'
import { SubjectAccuracyBar } from '@/components/charts/SubjectAccuracyBar'
import { SubjectTypeRadar } from '@/components/charts/SubjectTypeRadar'
import { Separator } from '@/components/ui/separator'

const DailyGoalHeatmap = lazy(() => import('@/components/charts/DailyGoalHeatmap').then(m => ({ default: m.DailyGoalHeatmap })))
const SubjectCategorySunburst = lazy(() => import('@/components/charts/SubjectCategorySunburst').then(m => ({ default: m.SubjectCategorySunburst })))

const SubjectDonutCharts = lazy(() => import('@/components/charts/SubjectDonutCharts').then(m => ({ default: m.SubjectDonutCharts })))
const SubjectTreemap = lazy(() => import('@/components/charts/SubjectTreemap').then(m => ({ default: m.SubjectTreemap })))
const TimeDistributionHistogram = lazy(() => import('@/components/charts/TimeDistributionHistogram').then(m => ({ default: m.TimeDistributionHistogram })))

const TimeScatterChart = lazy(() => import('@/components/charts/TimeScatterChart').then(m => ({ default: m.TimeScatterChart })))
const SubjectDailyStack = lazy(() => import('@/components/charts/SubjectDailyStack').then(m => ({ default: m.SubjectDailyStack })))
const AiChartInsight = lazy(() => import('@/components/charts/AiChartInsight').then(m => ({ default: m.AiChartInsight })))

const ChartSkeleton = ({ h = 360 }: { h?: number }) => (
  <div className="animate-pulse space-y-3 p-4" style={{ height: h }}>
    <div className="h-4 w-1/3 bg-muted rounded" />
      <div className="flex gap-4 flex-1" style={{ height: h - 48 }}>
        <div className="flex-1 space-y-2">
          {['72%', '62%', '80%', '58%', '66%'].map((w, i) => (
            <div key={i} className="h-8 bg-muted rounded" style={{ width: w }} />
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

// 服务层的题目元数据是领域形状(可空 + camelCase), 缓存里存的仍是页面这套窄形状
function toQMeta(rows: QuestionMetaRow[]): QMeta[] {
  return rows.map((r) => ({ id: r.id, subject: r.subject ?? '', category: r.category ?? '', categories: r.categories, question_type: r.questionType }))
}

export function Component() {
  const { t } = useT()
  const { user, profile, setProfile, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const { isEnabled, defaultPage } = useSettingsStore()
  const showAiInsight = hasAiConfig() && isEnabled('analysis')
  const dashboardStore = useDashboardStore()

  const applyGoal = async (v: string) => {
    if (!user || !profile) return
    const next = v || null
    setProfile({ ...profile, goal_type: next })
    await updateProfile(user.id, { goal_type: next }).catch((e: unknown) => logError('dashboard.setGoalType', e))
    await refreshProfile()
  }

  const applyDeadline = async (date: string) => {
    if (!user || !profile) return
    const next = date || null
    setProfile({ ...profile, deadline: next })
    await updateProfile(user.id, { deadline: next }).catch((e: unknown) => logError('dashboard.setDeadline', e))
    await refreshProfile()
  }

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : hour < 23 ? '晚上好' : '夜深了'
  const goalName = examGoalLabel(profile?.goal_type)

  const daysLeft = profile?.deadline
    ? Math.max(Math.ceil((new Date(profile.deadline).getTime() - nowMs) / 86400000), 0)
    : null

  const planSubjectList = getPlanSubjects(profile)
  const targetSubjectList = resolveGoals(profile).map((g) => g.subject)
  const subjectUnion = [...new Set([...planSubjectList, ...targetSubjectList])]
  const hasPlanOrTarget = subjectUnion.length > 0

  const cacheKey = `${user?.id}|${profile?.deadline}|${profile?.plan_subjects}`
  const hasCache = !!(dashboardStore.getChartCache(cacheKey))

  const [chartData, setChartData] = useState<ChartData | null>(hasCache ? dashboardStore.chartData : null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['overview']))
  const [todayText] = useState(() =>
    new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
  )
  const loadGenRef = useRef(0)

  useEffect(() => {
    if (defaultPage && defaultPage !== '/') navigate(defaultPage, { replace: true })
  }, [defaultPage, navigate])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const isStale = (gen: number) => loadGenRef.current !== gen || cancelled
    async function load() {
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

      // 题目元数据: 命中缓存就不查; 冷缓存时并行拉一次, 拉回来的结果直接用, 不再丢掉重查
      let questions = dashboardStore.getQMetaCache()
      const qMetaPromise = questions
        ? Promise.resolve(null)
        : fetchQuestionMetaRows()
            .then(toQMeta)
            .catch((e: unknown) => {
              logError('dashboard.questionMeta', e)
              return null
            })

      // 预聚合每日统计: 行数是 天数 × 学科 × 题型, 长期用户过千行, 所以走会翻页的服务函数
      const [statsRows, answeredIds, freshQMeta] = await Promise.all([
        fetchDailyStats(user!.id, start12wk.toISOString().slice(0, 10)).catch((e: unknown) => {
          logError('dashboard.dailyStats', e)
          return []
        }),
        fetchAnsweredQuestionIds(user!.id).catch((e: unknown) => {
          logError('dashboard.answeredIds', e)
          return []
        }),
        qMetaPromise,
      ])
      if (isStale(myGen)) { setIsRefreshing(false); return }

      if (!questions) {
        if (freshQMeta) {
          questions = freshQMeta
        } else {
          // 并行那次没回来就再试一次(老代码的顺序是第一次只写缓存、第二次才用于计算)
          try {
            questions = toQMeta(await fetchQuestionMetaRows())
          } catch (e) {
            logError('dashboard.questionMeta', e)
            questions = []
          }
          if (isStale(myGen)) { setIsRefreshing(false); return }
        }
        dashboardStore.setQMetaCache(questions)
      }

      const rows = statsRows

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
      const planSubjects = getPlanSubjects(profile)
      let dailyGoal = 0
      if (deadline) {
        const scopeIds = new Set(
          (questions ?? [])
            .filter((q) => planSubjects.length === 0 || planSubjects.includes(q.subject ?? ''))
            .map((q) => q.id),
        )
        // Use knowledge-graph answers for question-level uniqueness
        const distinctDone = new Set(answeredIds.filter((id) => scopeIds.has(id)))
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
          const data = await fetchQuestionOfflineRows(lastSync)
          if (loadGenRef.current !== prefetchGen) return
          if (data.length > 0) {
            // Full sync on first run; incremental upsert thereafter
            if (!lastSync) await clearPrefetchedQuestions()
            if (loadGenRef.current !== prefetchGen) return
            await prefetchQuestions(data.map((q) => ({ id: q.id, data: q })))
          }
          // 拉失败就别推进时间戳: 否则这一段增量会被永久跳过(由下面的 catch 兜住)
          localStorage.setItem(SYNC_TS_KEY, new Date().toISOString())
        } catch (e) {
          logError('dashboard.prefetchQuestions', e)
        }
      })()
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, profile?.deadline, profile?.plan_subjects])

  return (
    <div className="dash-shell space-y-6 w-full">
      {isRefreshing && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pb-1">
          <Spinner className="size-3" />
          更新中
        </div>
      )}

      <Tabs
        defaultValue="overview"
        className="w-full"
        onValueChange={(v) => setVisitedTabs((prev) => new Set(prev).add(v))}
      >
        <ScrollArea scrollbars="horizontal">
          <TabsList className="justify-center">
            <TabsTrigger value="overview" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden md:inline">总览</span>
            </TabsTrigger>
            <TabsTrigger value="subjects" className="gap-1.5">
              <PieChart className="h-3.5 w-3.5" />
              <span className="hidden md:inline">学科分析</span>
            </TabsTrigger>
            <TabsTrigger value="journey" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden md:inline">学习足迹</span>
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

          <TabsContent value="overview">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                    {greeting}
                    {profile?.nickname ? `，${profile.nickname}` : ''}
                    {goalName && (
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                        {goalName}冲刺中
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {todayText}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />
                    {goalName
                      ? daysLeft != null
                        ? `距${goalName}还有 ${daysLeft} 天,按计划推进、稳扎稳打`
                        : `已选定「${goalName}」目标,点右侧「考试日期」设定时间后开始冲刺`
                      : '可以先设定备考目标(考研 / 考公 / 期末考),再制定冲刺计划'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ExamGoalPicker value={profile?.goal_type ?? ''} onChange={(v) => applyGoal(v)} compact />
                  {goalName && (
                    <>
                      <label className="relative inline-flex h-8 items-center overflow-hidden rounded-lg border bg-card pr-2">
                        <span className="pl-2.5 text-xs text-muted-foreground">考试</span>
                        <input
                          type="date"
                          aria-label="考试日期"
                          value={profile?.deadline ? String(profile.deadline).slice(0, 10) : ''}
                          onChange={(e) => applyDeadline(e.target.value)}
                          className="h-8 bg-transparent px-1.5 text-xs text-foreground outline-none"
                        />
                      </label>
                      {daysLeft != null && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${daysLeft <= 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                          {daysLeft <= 0 ? '今天开考' : `${daysLeft} 天`}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              <DashboardPlanCards />

              {hasPlanOrTarget && (
                <LazyChart rootMargin="260px">
                  <PlanCompletionChart planSubjects={planSubjectList} targetSubjects={targetSubjectList} />
                </LazyChart>
              )}

              {chartData ? (
                <DashboardEbbinghaus />
              ) : (
                <div className="h-[260px] rounded-lg bg-muted/30 animate-pulse" />
              )}
            </div>
          </TabsContent>
          <TabsContent value="subjects">
            {visitedTabs.has('subjects') && chartData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">题库构成</CardTitle>
                      <p className="text-xs text-muted-foreground/70">按学科题量占比</p>
                    </CardHeader>
                    <CardContent>
                      <SubjectCompositionDonut rows={chartData.sunburstData} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">题型能力雷达</CardTitle>
                      <p className="text-xs text-muted-foreground/70">单选<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />多选<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />判断<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />填空<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />简答 正确率</p>
                    </CardHeader>
                    <CardContent>
                      <TypeRadarChart cells={chartData.heatmapData} />
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">各科正确率与趋势</CardTitle>
                    <p className="text-xs text-muted-foreground/70">今日正确率<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />与昨日对比</p>
                  </CardHeader>
                  <CardContent>
                    <SubjectAccuracyTodayList />
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SubjectAccuracyBar />
                  {hasPlanOrTarget ? <SubjectTypeRadar planSubjects={subjectUnion} /> : null}
                </div>
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
                <LazyChart rootMargin="400px">
                  <Card className="border-0 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">科目每日答题量趋势</CardTitle>
                      <p className="text-xs text-muted-foreground/70">近 15 天各科答题量堆叠</p>
                    </CardHeader>
                    <CardContent>
                      <Suspense fallback={<ChartSkeleton />}>
                        <SubjectDailyStack data={chartData.dailySubjectData} />
                      </Suspense>
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
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground">累计答题</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{chartData.totalAnswered.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">一路刷过来的证据</p>
                  </div>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground">已打卡</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{chartData.checkinDays}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">近 12 周内有记录的天数</p>
                  </div>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground">累计正确率</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{chartData.totalAnswered > 0 ? Math.round((chartData.correctCount / chartData.totalAnswered) * 100) : 0}%</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">正确 {chartData.correctCount} / 总 {chartData.totalAnswered}</p>
                  </div>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground">累计错题</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{chartData.wrongCount.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">都在错题本里等你翻篇</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-start">
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">2026 学习热力图</CardTitle>
                        <p className="text-xs text-muted-foreground/70">每日答题量<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />目标 {chartData.dailyGoal} 题/天</p>
                      </CardHeader>
                      <CardContent>
                        <YearHeatPreview data={chartData.dailyAnswers} />
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">一周 × 24 时段热力</CardTitle>
                        <p className="text-xs text-muted-foreground/70">颜色越深刷题越多</p>
                      </CardHeader>
                      <CardContent>
                        <WeekHourHeat data={chartData.hourlyDistribution} />
                        <p className="mt-3 text-[11px] text-muted-foreground">把难点章节安排在深色时段,效率更高</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">本月里程碑</CardTitle>
                        <p className="text-xs text-muted-foreground/70">按真实进度计算</p>
                      </CardHeader>
                      <CardContent>
                        <MilestonesCard dailyAnswers={chartData.dailyAnswers} totalAnswered={chartData.totalAnswered} />
                      </CardContent>
                    </Card>
                  </div>
                </div>
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
