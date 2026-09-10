import { Link } from 'react-router-dom'
import { ArrowUpRight, Minus, Trophy, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RANKING_METRICS, metricValue, type DemoTopic, type RankingMetric } from '@/lib/topics-demo'
import { topicAccent, topicSectionUrl } from './topic-sections'

const rankTone = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
]

function formatMetric(topic: DemoTopic, metric: RankingMetric): string {
  const value = metricValue(topic, metric)
  if (metric === 'rating') return value.toFixed(1)
  if (metric === 'students') return value.toLocaleString()
  return value.toLocaleString()
}

export function HotRanking({
  topics,
  metric = 'popularity',
  limit,
}: {
  topics: DemoTopic[]
  metric?: RankingMetric
  limit?: number
}) {
  const rows = typeof limit === 'number' ? topics.slice(0, limit) : topics
  const metricLabel = RANKING_METRICS.find((item) => item.key === metric)?.label ?? '综合热度'
  const max = rows.length ? metricValue(rows[0], metric) : 1

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-primary" />
          热门专业课排行榜
          <span className="text-[11px] font-normal text-muted-foreground">
            按{metricLabel}排序 · 每周一 06:00 更新
          </span>
          <Link
            to="/topics/ranking"
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-normal text-primary hover:underline"
          >
            完整榜单 <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-1">
        {rows.map((topic, index) => {
          const trend = topic.trend
          return (
            <Link
              key={topic.id}
              to={topicSectionUrl(topic.id, 'intro')}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums',
                  index < 3 ? rankTone[index] : 'bg-muted text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold',
                  topicAccent(index),
                )}
              >
                {topic.short}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{topic.name}</span>
                  {topic.badge && (
                    <Badge variant="secondary" className="hidden shrink-0 px-1 py-0 text-[9px] font-normal sm:inline-flex">
                      {topic.badge}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/60"
                    style={{ width: `${max > 0 ? Math.max((metricValue(topic, metric) / max) * 100, 4) : 4}%` }}
                  />
                </div>
              </div>

              <div className="w-20 shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatMetric(topic, metric)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {metric === 'rating' ? `${topic.ratingCount} 人评` : RANKING_METRICS.find((m) => m.key === metric)?.unit}
                </p>
              </div>

              <span
                className={cn(
                  'flex w-8 shrink-0 items-center justify-end gap-0.5 text-[10px] tabular-nums',
                  trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : trend < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
                )}
                title="相较上周排名变化"
              >
                {trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : trend < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {trend !== 0 && Math.abs(trend)}
              </span>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
