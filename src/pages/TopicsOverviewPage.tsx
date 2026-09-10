import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Compass, FileText, Footprints, Info, ListChecks, ScanSearch, Star, Trophy, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HotRanking } from '@/components/topics/HotRanking'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { TopicSearchDialog } from '@/components/topics/TopicSearchDialog'
import { topicAccent, topicSectionUrl } from '@/components/topics/topic-sections'
import {
  DEMO_TOPICS, RANKING_METRICS, bankCountOf, sortByMetric,
  type DemoTopic, type RankingMetric,
} from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

function OverviewStats() {
  const stats = useMemo(() => {
    const questions = DEMO_TOPICS.reduce((sum, topic) => sum + bankCountOf(topic), 0)
    const literatures = DEMO_TOPICS.reduce((sum, topic) => sum + topic.literatures.length, 0)
    const students = DEMO_TOPICS.reduce((sum, topic) => sum + topic.students, 0)
    return [
      { label: '已收录专业课', value: DEMO_TOPICS.length, unit: '门' },
      { label: '关联题目', value: questions, unit: '题' },
      { label: '原始文献', value: literatures, unit: '篇' },
      { label: '累计在学', value: students, unit: '人次' },
    ]
  }, [])

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3.5">
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {item.value.toLocaleString()}
              <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{item.unit}</span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TopicCard({ topic, index }: { topic: DemoTopic; index: number }) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
              topicAccent(index),
            )}
          >
            {topic.short}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{topic.name}</span>
              {topic.badge && (
                <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[9px] font-normal">
                  {topic.badge}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {topic.code} · {topic.credit} · 占比 {topic.weight}%
            </p>
          </div>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{topic.description}</p>

        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3 w-3" />
            {bankCountOf(topic)} 题
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {topic.literatures.length} 篇文献
          </span>
          <span className="inline-flex items-center gap-1">
            <Footprints className="h-3 w-3" />
            {topic.footprints.length} 条足迹
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-medium tabular-nums">{topic.rating}</span>
            <span className="text-muted-foreground tabular-nums">({topic.ratingCount})</span>
          </span>
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to={topicSectionUrl(topic.id, 'intro')}>
              进入专题 <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TopicsOverview() {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <Compass className="h-5 w-5 text-primary" />
            专业专题
            <DemoBadge />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            以专业课为单位沉淀知识：先读课程框架，再进关联题库练习，最后回到原始文献与前辈经验校准方向。专业课可持续新增，不受门数限制。
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setSearchOpen(true)}>
          <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
          搜索专业课
        </Button>
      </div>

      <TopicSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <OverviewStats />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            全部专业课
            <span className="text-[11px] font-normal text-muted-foreground">{DEMO_TOPICS.length} 门</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DEMO_TOPICS.map((topic, index) => (
              <TopicCard key={topic.id} topic={topic} index={index} />
            ))}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <HotRanking topics={sortByMetric(DEMO_TOPICS, 'popularity')} limit={5} />
        </div>
      </div>
    </div>
  )
}

function RankingPage() {
  const [metric, setMetric] = useState<RankingMetric>('popularity')
  const ranked = useMemo(() => sortByMetric(DEMO_TOPICS, metric), [metric])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Trophy className="h-5 w-5 text-primary" />
          热门专业课排行榜
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按不同维度查看各门专业课的受欢迎程度，帮你判断该从哪门课切入、哪些课竞争最激烈。
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {RANKING_METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMetric(item.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              metric === item.key
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <HotRanking topics={ranked} metric={metric} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            榜单说明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>· 综合热度 = 在学人数 ×0.4 + 近 7 日练习量 ×0.35 + 笔记与讨论量 ×0.25，归一化到 10000 分制。</p>
          <p>· 学员评分为近 30 日有效评价均值，不足 20 条评价的科目不参与评分榜排序。</p>
          <p>· 榜单每周一 06:00 更新；趋势表示相较上周的名次变化（↑ 上升 / ↓ 下降 / — 持平）。</p>
          <p className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <Users className="h-3 w-3" />
            当前为 DEMO 演示数据，未接入实际统计口径。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function Component() {
  const { pathname } = useLocation()
  return pathname === '/topics/ranking' ? <RankingPage /> : <TopicsOverview />
}
