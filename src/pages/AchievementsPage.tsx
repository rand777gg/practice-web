import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award, CheckCircle2, Flame, Layers, Lock, MessageSquare, Rocket, Swords, Trophy, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent, topicSectionUrl } from '@/components/topics/topic-sections'
import {
  ACHIEVEMENTS, ACHIEVEMENT_SUMMARY, MILESTONES, MILESTONE_KIND_META, TIER_META,
  type AchievementCategory, type MilestoneKind,
} from '@/lib/achievements-demo'
import { DEMO_TOPICS, getDemoTopic } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<AchievementCategory, typeof Zap> = {
  刷题: Zap,
  坚持: Flame,
  专题: Layers,
  对战: Swords,
  贡献: Award,
}

const MILESTONE_ICONS: Record<MilestoneKind, typeof Zap> = {
  start: Rocket,
  streak: Flame,
  topic: Layers,
  arena: Swords,
  note: MessageSquare,
  level: Trophy,
}

const CATEGORIES: (AchievementCategory | '全部')[] = ['全部', '刷题', '坚持', '专题', '对战', '贡献']

function LevelCard() {
  const { level, levelTitle, exp, nextLevelExp, totalPoints } = ACHIEVEMENT_SUMMARY
  const unlocked = ACHIEVEMENTS.filter((item) => item.unlockedAt).length
  const percent = Math.round((exp / nextLevelExp) * 100)

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="flex flex-wrap items-center gap-6 p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
            Lv.{level}
          </span>
          <div>
            <p className="text-base font-semibold">{levelTitle}</p>
            <p className="text-[11px] text-muted-foreground">累计经验 {exp.toLocaleString()}</p>
          </div>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>距离 Lv.{level + 1}</span>
            <span className="tabular-nums">
              {exp} / {nextLevelExp}
            </span>
          </div>
          <Progress value={percent} className="mt-1.5 h-2" />
          <p className="mt-1 text-[11px] text-muted-foreground">再获得 {nextLevelExp - exp} 点经验即可升级</p>
        </div>

        <div className="flex gap-6">
          <div>
            <p className="text-[11px] text-muted-foreground">已解锁徽章</p>
            <p className="text-lg font-semibold tabular-nums">
              {unlocked}
              <span className="text-[11px] font-normal text-muted-foreground"> / {ACHIEVEMENTS.length}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">累计成就积分</p>
            <p className="text-lg font-semibold tabular-nums">{totalPoints}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function BadgeWall() {
  const [category, setCategory] = useState<AchievementCategory | '全部'>('全部')
  const list = category === '全部' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((item) => item.category === category)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              category === item
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => {
          const Icon = CATEGORY_ICONS[item.category]
          const tier = TIER_META[item.tier]
          const unlocked = item.unlockedAt !== null
          const percent = Math.min(Math.round((item.progress / item.target) * 100), 100)
          return (
            <Card
              key={item.id}
              className={cn('transition-colors', unlocked ? cn('ring-1', tier.ring) : 'bg-muted/30')}
            >
              <CardContent className="flex gap-3 p-4">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    unlocked ? tier.className : 'bg-muted text-muted-foreground/50',
                  )}
                >
                  {unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </span>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('truncate text-sm font-medium', !unlocked && 'text-muted-foreground')}>
                      {item.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn('shrink-0 border-transparent text-[9px] font-normal', tier.className)}
                    >
                      {tier.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>

                  {unlocked ? (
                    <p className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {item.unlockedAt} 解锁 · +{item.points}
                    </p>
                  ) : (
                    <>
                      <Progress value={percent} className="h-1.5" />
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {item.progress} / {item.target} · 奖励 {item.points} 点
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function FootprintTimeline() {
  return (
    <div className="relative space-y-3 pl-7">
      <span className="absolute left-[11px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {MILESTONES.map((item) => {
        const Icon = MILESTONE_ICONS[item.kind]
        const topic = item.topicId ? getDemoTopic(item.topicId) : null
        const topicIndex = topic ? DEMO_TOPICS.findIndex((entry) => entry.id === topic.id) : -1
        return (
          <div key={item.id} className="relative">
            <span
              className={cn(
                'absolute -left-7 top-3.5 flex h-[23px] w-[23px] items-center justify-center rounded-full',
                MILESTONE_KIND_META[item.kind].className,
              )}
              aria-hidden
            >
              <Icon className="h-3 w-3" />
            </span>
            <Card>
              <CardContent className="space-y-1.5 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{item.date}</span>
                  {topic && (
                    <Link
                      to={topicSectionUrl(topic.id, 'intro')}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(topicIndex))}>
                        {topic.short}
                      </span>
                      {topic.name}
                    </Link>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          </div>
        )
      })}
      <p className="px-1 text-[11px] text-muted-foreground">
        里程碑由练习、打卡、专题阅读与对战行为自动生成，DEMO 阶段为内置示例。
      </p>
    </div>
  )
}

export function Component() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Trophy className="h-5 w-5 text-primary" />
          成就
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把散落在练习、打卡、专题与对战里的学习足迹，汇总成等级、徽章与里程碑。
        </p>
      </div>

      <LevelCard />

      <Tabs defaultValue="badges" className="space-y-4">
        <TabsList>
          <TabsTrigger value="badges">
            <Award className="mr-1.5 h-3.5 w-3.5" />
            徽章墙
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            学习足迹
          </TabsTrigger>
        </TabsList>

        <TabsContent value="badges">
          <BadgeWall />
        </TabsContent>

        <TabsContent value="timeline">
          <FootprintTimeline />
        </TabsContent>
      </Tabs>
    </div>
  )
}
