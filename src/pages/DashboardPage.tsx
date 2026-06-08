import { useEffect, useState, lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { usePrefetchPlanQuestions } from '@/hooks/use-prefetch-questions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Clock, RotateCcw, Star, CalendarDays, PieChart, Target, GitBranch, BookOpen, ListChecks } from 'lucide-react'
import { DashboardPlanCards } from '@/components/layout/DashboardPlanCards'
import { DashboardEbbinghaus } from '@/components/layout/DashboardEbbinghaus'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useT } from '@/i18n/use-t'

const DailyGoalHeatmap = lazy(() => import('@/components/charts/DailyGoalHeatmap').then(m => ({ default: m.DailyGoalHeatmap })))
const SubjectCategorySunburst = lazy(() => import('@/components/charts/SubjectCategorySunburst').then(m => ({ default: m.SubjectCategorySunburst })))
const SubjectDonutCharts = lazy(() => import('@/components/charts/SubjectDonutCharts').then(m => ({ default: m.SubjectDonutCharts })))
const SubjectAccuracyCharts = lazy(() => import('@/components/charts/SubjectAccuracyCharts').then(m => ({ default: m.SubjectAccuracyCharts })))
const SubjectRankChart = lazy(() => import('@/components/charts/SubjectRankChart').then(m => ({ default: m.SubjectRankChart })))
const TimeDistributionHistogram = lazy(() => import('@/components/charts/TimeDistributionHistogram').then(m => ({ default: m.TimeDistributionHistogram })))
const AnswerTimeScatterHistogram = lazy(() => import('@/components/charts/AnswerTimeScatterHistogram').then(m => ({ default: m.AnswerTimeScatterHistogram })))
const TimeScatterChart = lazy(() => import('@/components/charts/TimeScatterChart').then(m => ({ default: m.TimeScatterChart })))
const KnowledgeGraph = lazy(() => import('@/components/charts/KnowledgeGraph').then(m => ({ default: m.KnowledgeGraph })))

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
  knowledgeGraph: {
    nodes: { name: string; questionCount: number; correctRate: number | null; subject: string }[]
    edges: { source: string; target: string; weight: number }[]
  } | null
}

// localStorage caches — survive browser restart
const CACHE_KEY = 'ds_cache'
const Q_META_KEY = 'ds_qmeta'
const Q_META_TTL = 30 * 60 * 1000 // 30 minutes for questions metadata

interface CacheEntry { data: ChartData; key: string; ts: number }

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry
  } catch { /* ignore */ }
  return null
}

function writeCache(data: ChartData, key: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, key, ts: Date.now() }))
  } catch { /* ignore */ }
}

interface QMeta { id: string; subject: string; category: string; question_type: string }
let qMetaCache: QMeta[] | null = null

function readQMetaCache(): QMeta[] | null {
  if (qMetaCache) return qMetaCache
  try {
    const raw = localStorage.getItem(Q_META_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as { data: QMeta[]; ts: number }
    if (Date.now() - entry.ts < Q_META_TTL) { qMetaCache = entry.data; return qMetaCache }
  } catch { /* ignore */ }
  return null
}

function writeQMetaCache(data: QMeta[]) {
  qMetaCache = data
  try {
    localStorage.setItem(Q_META_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore */ }
}

export function Component() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  usePrefetchPlanQuestions(!!user)

  const cacheKey = `${user?.id}|${profile?.deadline}|${profile?.plan_subjects}`
  const cached = readCache()
  const hasCache = !!(cached && cached.key === cacheKey)

  const [chartData, setChartData] = useState<ChartData | null>(hasCache ? cached!.data : null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['plan']))

  useEffect(() => {
    if (!user) return
    async function load() {
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
      let questions = readQMetaCache()
      const qFetchPromise = questions
        ? Promise.resolve(null)
        : supabase.from('questions').select('id, subject, category, question_type')
            .then(({ data }) => { if (data) writeQMetaCache(data as QMeta[]); return null })

      const [{ data: answers }] = await Promise.all([
        supabase
          .from('user_answers')
          .select('is_correct, answered_at, question_id')
          .eq('user_id', user!.id)
          .gte('answered_at', start12wk.toISOString()),
        qFetchPromise,
      ])

      if (!questions) {
        const { data: fresh } = await supabase.from('questions').select('id, subject, category, question_type')
        questions = (fresh ?? []) as QMeta[]
        writeQMetaCache(questions)
      }

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
        knowledgeGraph: null,
      })
      writeCache({
        totalAnswered, correctCount, wrongCount, dailyAnswers, barData, sunburstData, dailyGoal, hourlyDistribution,
        dailySubjectData: { dates: dailySubjectDates, subjects: dailySubjectSubjects, data: dailySubjectData },
        todayHourlyData, subjectAccuracy, heatmapData,
        knowledgeGraph: null,
      }, cacheKey)
      setIsRefreshing(false)
    }
    load()
  }, [user, profile?.deadline, profile?.plan_subjects])

  // Lazy-load key_points for knowledge graph (heavy field, not needed for initial render)
  useEffect(() => {
    if (!chartData || !user) return
    const answers = chartData.totalAnswered
    if (answers === 0) return
    ;(async () => {
      const { data: kpData } = await supabase.from('questions').select('id, key_points, subject')
      if (!kpData) return
      const kpByQ = new Map<string, string[]>()
      const subjMap = new Map<string, string>()
      for (const r of kpData) {
        subjMap.set(r.id, r.subject ?? '')
        if (r.key_points) kpByQ.set(r.id, r.key_points.split(',').map((s: string) => s.trim()).filter(Boolean))
      }
      const ansData = await supabase
        .from('user_answers').select('question_id, is_correct')
        .eq('user_id', user!.id).gte('answered_at', new Date(Date.now() - 12 * 7 * 86400000).toISOString())
      const ansByQ = new Map<string, { correct: number; total: number }>()
      for (const a of ansData.data ?? []) {
        if (!ansByQ.has(a.question_id)) ansByQ.set(a.question_id, { correct: 0, total: 0 })
        const entry = ansByQ.get(a.question_id)!
        entry.total++
        if (a.is_correct) entry.correct++
      }
      // Build nodes
      const nm = new Map<string, { qIds: Set<string>; subs: Map<string, number>; corr: number; tot: number }>()
      for (const [qId, kps] of kpByQ) {
        if (kps.length === 0) continue
        const subj = subjMap.get(qId) ?? ''
        for (const kp of kps) {
          if (!nm.has(kp)) nm.set(kp, { qIds: new Set(), subs: new Map(), corr: 0, tot: 0 })
          const n = nm.get(kp)!
          n.qIds.add(qId)
          n.subs.set(subj, (n.subs.get(subj) ?? 0) + 1)
        }
      }
      for (const [qId, stats] of ansByQ) {
        const kps = kpByQ.get(qId)
        if (!kps) continue
        for (const kp of kps) {
          const n = nm.get(kp)
          if (!n) continue
          n.corr += stats.correct
          n.tot += stats.total
        }
      }
      const nodes = [...nm.entries()]
        .map(([name, info]) => {
          const domSubj = [...info.subs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
          return { name, questionCount: info.qIds.size, correctRate: info.tot > 0 ? info.corr / info.tot : null, subject: domSubj }
        })
        .sort((a, b) => b.questionCount - a.questionCount)
      // Build edges
      const em = new Map<string, number>()
      for (const [, kps] of kpByQ) {
        if (kps.length < 2) continue
        for (let i = 0; i < kps.length; i++) {
          for (let j = i + 1; j < kps.length; j++) {
            const key = kps[i] < kps[j] ? `${kps[i]}|||${kps[j]}` : `${kps[j]}|||${kps[i]}`
            em.set(key, (em.get(key) ?? 0) + 1)
          }
        }
      }
      const nnSet = new Set(nodes.map((n) => n.name))
      const edges = [...em.entries()]
        .filter(([key, w]) => { const [s, t] = key.split('|||'); return w >= 2 && nnSet.has(s) && nnSet.has(t) })
        .map(([key, w]) => { const [s, t] = key.split('|||'); return { source: s, target: t, weight: w } })
      setChartData((prev) => prev ? { ...prev, knowledgeGraph: { nodes, edges } } : prev)
    })()
  }, [chartData?.totalAnswered, user])

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 pb-1">
        <h1 className="text-xl lg:text-2xl font-bold">{t('dashboard.title')}</h1>
        {isRefreshing && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            更新中
          </div>
        )}
      </div>

      {!chartData ? (
        // First load — skeleton shell
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="animate-pulse rounded-lg border p-6 space-y-3">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-40 w-full bg-muted rounded" />
            </div>
            <div className="animate-pulse rounded-lg border p-6 space-y-3">
              <div className="h-4 w-1/4 bg-muted rounded" />
              <div className="h-40 w-full bg-muted rounded" />
            </div>
          </div>
        </div>
      ) : (chartData.totalAnswered === 0 && chartData.sunburstData.length === 0) ? (
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
        <Tabs
          defaultValue="plan"
          className="w-full"
          onValueChange={(v) => setVisitedTabs((prev) => new Set(prev).add(v))}
        >
          <TabsList className="justify-center">
            <TabsTrigger value="plan" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.tabPlan')}</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
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
            <TabsTrigger value="knowledge" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.tabKnowledge')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plan">
            <div className="space-y-4">
              <DashboardPlanCards />
              <DashboardEbbinghaus />
              <div className="flex items-center gap-2 overflow-x-auto">
                {([
                  { icon: Pencil, label: t('dashboard.startPractice'), to: '/practice', variant: 'default' as const },
                  { icon: Clock, label: t('dashboard.takeExam'), to: '/exam', variant: 'default' as const },
                  { icon: Star, label: t('nav.favorites'), to: '/favorites', variant: 'outline' as const },
                  { icon: RotateCcw, label: t('dashboard.reviewMistakes'), to: '/review', variant: 'outline' as const },
                  { icon: BookOpen, label: t('nav.publicNotes'), to: '/notes', variant: 'outline' as const },
                ]).map((btn) => (
                  <Button
                    key={btn.to}
                    variant={btn.variant}
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={() => navigate(btn.to)}
                  >
                    <btn.icon className="h-4 w-4" />
                    {btn.label}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stats">
            {visitedTabs.has('stats') ? (
              <div className="space-y-4">
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
            ) : (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </TabsContent>

          <TabsContent value="subjects">
            {visitedTabs.has('subjects') ? (
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
            ) : (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </TabsContent>

          <TabsContent value="journey">
            {visitedTabs.has('journey') ? (
              <div className="space-y-4">
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
                    <CardTitle className="text-sm text-muted-foreground">{t('dashboard.dailyActivity')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<ChartFallback />}>
                      <DailyGoalHeatmap data={chartData.dailyAnswers} dailyGoal={chartData.dailyGoal} />
                    </Suspense>
                  </CardContent>
                </Card>
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

          <TabsContent value="knowledge">
            {visitedTabs.has('knowledge') ? (
              <Card className="border-0 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{t('dashboard.knowledgeGraph')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!chartData.knowledgeGraph ? (
                    <ChartFallback />
                  ) : chartData.knowledgeGraph.nodes.length > 0 ? (
                    <Suspense fallback={<ChartFallback />}>
                      <KnowledgeGraph
                        nodes={chartData.knowledgeGraph.nodes}
                        edges={chartData.knowledgeGraph.edges}
                      />
                    </Suspense>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noData')}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <SkeletonCard />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
