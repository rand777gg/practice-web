import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, ChartPie, Clock, Database, Info, Layers, RotateCcw, Target,
  TrendingDown, TrendingUp, UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChordDiagram } from '@/components/charts/ChordDiagram'
import { DailyTrendBars } from '@/components/charts/DailyTrendBars'
import { LazyChart } from '@/components/layout/LazyChart'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent, topicSectionUrl } from '@/components/topics/topic-sections'
import {
  CHORD_PRESETS, DATA_CENTER_STATS, QUESTION_COUNTS, toChord,
} from '@/lib/data-center-demo'
import {
  PERSONAL_HOUR_DISTRIBUTION, PERSONAL_STATS, PERSONAL_SUBJECT_ACCURACY,
  PERSONAL_VS_PUBLIC, PERSONAL_WRONG_BY_TYPE, personalDaily,
} from '@/lib/data-center-personal-demo'
import { getDemoTopic, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

function BarRow({
  label,
  value,
  max,
  suffix,
  accent,
}: {
  label: string
  value: number
  max: number
  suffix?: string
  accent?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full', accent ?? 'bg-primary/70')}
            style={{ width: `${max > 0 ? Math.max((value / max) * 100, 2) : 2}%` }}
          />
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </span>
    </div>
  )
}

function PublicTab() {
  const [presetKey, setPresetKey] = useState(CHORD_PRESETS[0].key)
  const preset = CHORD_PRESETS.find((item) => item.key === presetKey) ?? CHORD_PRESETS[0]
  const chord = toChord(preset)

  const totalQuestions = QUESTION_COUNTS.reduce((sum, row) => sum + row.total, 0)
  const totalObjective = QUESTION_COUNTS.reduce((sum, row) => sum + row.objective, 0)
  const totalSubjective = QUESTION_COUNTS.reduce((sum, row) => sum + row.subjective, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {DATA_CENTER_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
              {stat.hint && <p className="text-[10px] leading-snug text-muted-foreground">{stat.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-primary" />
            题目数量披露
            <span className="text-[11px] font-normal text-muted-foreground">
              合计 {totalQuestions.toLocaleString()} 题 · 客观题 {totalObjective.toLocaleString()} · 主观题 {totalSubjective.toLocaleString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {QUESTION_COUNTS.map((row) => {
            const topic = getDemoTopic(row.topicId)
            const objectiveRate = Math.round((row.objective / row.total) * 100)
            return (
              <div key={row.topicId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                    topicAccent(topicIndexOf(row.topicId)),
                  )}
                >
                  {topic.short}
                </span>
                <div className="min-w-[150px] flex-1">
                  <Link to={topicSectionUrl(row.topicId, 'intro')} className="text-xs font-medium hover:text-primary">
                    {topic.name}
                  </Link>
                  <p className="text-[10px] text-muted-foreground">真题年份 {row.yearRange}</p>
                </div>
                <div className="min-w-[160px] flex-[2] space-y-1">
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    <span className="bg-primary/70" style={{ width: `${objectiveRate}%` }} />
                    <span className="bg-violet-400/80" style={{ width: `${100 - objectiveRate}%` }} />
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>客观 {row.objective.toLocaleString()}</span>
                    <span>主观 {row.subjective.toLocaleString()}</span>
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <p className="text-[10px] text-muted-foreground">含解析</p>
                  <div className="flex items-center gap-1.5">
                    <Progress value={row.withAnalysisRate} className="h-1.5 flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">{row.withAnalysisRate}%</span>
                  </div>
                </div>
                <div className="w-24 shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{row.total.toLocaleString()}</p>
                  <p className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-2.5 w-2.5" />
                    本月 +{row.addedThisMonth}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            用户知识点选择分布
            <DemoBadge />
            <span className="text-[11px] font-normal text-muted-foreground">
              弦带越宽，表示该组合被用户勾选的次数越多
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {CHORD_PRESETS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPresetKey(item.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  presetKey === item.key
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{preset.desc}</p>

          <LazyChart>
            <ChordDiagram
              nodes={chord.nodes}
              links={chord.links}
              sideLabels={[preset.rowLabel, preset.colLabel]}
              centerLabel={preset.centerLabel}
            />
          </LazyChart>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-primary/60" />
              圆环弧长与弦带宽度均按勾选量等比映射
            </span>
            <span>悬停节点可高亮该节点的全部关联</span>
            <span>圆心显示当前选中项的总量与该类别占比</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            统计口径
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <p>· 题目数量按「已发布且通过查重」计，被下架或驳回的采集题目不计入。</p>
          <p>· 知识点勾选量按用户在一道题上勾选的每个知识点各计 1 次，同一用户重复勾选不重复计数。</p>
          <p>· 弦图两侧弧长分别等于该节点在全部关系中的权重之和，因此可为不同量级的集合做同图对比。</p>
          <p className="flex items-center gap-1">
            <Badge variant="secondary" className="border-transparent bg-violet-100 text-[10px] font-normal text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              DEMO
            </Badge>
            本页所有数字均为内置示例数据，未接入真实统计。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function PersonalTab() {
  const daily = personalDaily()
  const maxHour = Math.max(...PERSONAL_HOUR_DISTRIBUTION.map((item) => item.count))
  const maxType = Math.max(...PERSONAL_WRONG_BY_TYPE.map((item) => item.count))
  const weakTopics = [...PERSONAL_SUBJECT_ACCURACY]
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 3)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PERSONAL_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
              {stat.hint && <p className="text-[10px] leading-snug text-muted-foreground">{stat.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-primary" />
            近 15 天练习趋势
            <span className="text-[11px] font-normal text-muted-foreground">
              绿色为答对、红色为答错，空白为未练习
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <LazyChart>
            <DailyTrendBars data={daily} />
          </LazyChart>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              各专业课正确率
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {PERSONAL_SUBJECT_ACCURACY.map((row) => {
              const topic = getDemoTopic(row.topicId)
              const rate = Math.round((row.correct / row.total) * 100)
              return (
                <div key={row.topicId} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold',
                        topicAccent(topicIndexOf(row.topicId)),
                      )}
                    >
                      {topic.short}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px]">{topic.name}</span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums">{rate}%</span>
                    <span
                      className={cn(
                        'inline-flex w-9 shrink-0 items-center justify-end gap-0.5 text-[10px] tabular-nums',
                        row.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {row.delta >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {Math.abs(row.delta)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-7">
                    <Progress value={rate} className="h-1.5 flex-1" />
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {row.correct}/{row.total}
                    </span>
                  </div>
                </div>
              )
            })}
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <RotateCcw className="h-3 w-3" />
              正确率最低的三门：
              {weakTopics.map((row) => getDemoTopic(row.topicId).name).join('、')}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                练习时段分布
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-1">
              {PERSONAL_HOUR_DISTRIBUTION.map((item) => (
                <BarRow key={item.label} label={item.label} value={item.count} max={maxHour} suffix=" 题" />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-primary" />
                错题按题型分布
                <span className="text-[11px] font-normal text-muted-foreground">
                  共 {PERSONAL_WRONG_BY_TYPE.reduce((sum, item) => sum + item.count, 0)} 题
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-1">
              {PERSONAL_WRONG_BY_TYPE.map((item) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxType}
                  accent="bg-rose-400/80"
                  suffix=" 题"
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            我和全站公开数据对比
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {PERSONAL_VS_PUBLIC.map((row) => (
            <div key={row.metric} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
              <span className="min-w-[110px] flex-1 text-xs">{row.metric}</span>
              <span className="text-[11px] tabular-nums">
                我 <b className={cn('font-semibold', row.better ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{row.mine}</b>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">全站均值 {row.publicAvg}</span>
              <Badge
                variant="secondary"
                className={cn(
                  'border-transparent text-[9px] font-normal',
                  row.better
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                )}
              >
                {row.better ? '高于均值' : '低于均值'}
              </Badge>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            错题复盘率低于均值时，去
            <Link to="/review" className="mx-1 text-primary hover:underline">
              错题回顾
            </Link>
            把积压的错题过一遍通常比刷新题更划算。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          本 tab 使用示例数据固定版面与口径；正式版会将仪表盘的个人统计接口接进来。
          <Link to="/achievements" className="inline-flex items-center gap-0.5 text-primary hover:underline">
            查看成就与里程碑 <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

export function Component() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <ChartPie className="h-5 w-5 text-primary" />
          数据中心
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          公开数据是全站题库规模与知识点选择分布；我的数据是你自己的练习趋势、专业课正确率与时段分布。
        </p>
      </div>

      <Tabs defaultValue="public" className="space-y-4">
        <TabsList>
          <TabsTrigger value="public">
            <Database className="mr-1.5 h-3.5 w-3.5" />
            公开数据
          </TabsTrigger>
          <TabsTrigger value="personal">
            <UserRound className="mr-1.5 h-3.5 w-3.5" />
            我的数据
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PublicTab />
        </TabsContent>

        <TabsContent value="personal">
          <PersonalTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
