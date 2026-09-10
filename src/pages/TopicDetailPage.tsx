import type { ComponentType, ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  ArrowRight, BookMarked, ChevronLeft, ExternalLink, FileText, Flame, Footprints,
  GraduationCap, Heart, Info, Layers, ListChecks, Quote, Star, TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { TopicSidebar } from '@/components/topics/TopicSidebar'
import { sectionKeyOf } from '@/components/topics/topic-sections'
import {
  DEMO_TOPICS, getDemoTopic, type DemoLiterature, type DemoTopic,
} from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const literatureTone: Record<DemoLiterature['type'], string> = {
  教材: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  论文: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  标准: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  真题: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

function SectionHead({
  icon: Icon,
  title,
  desc,
  extra,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  desc: string
  extra?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          {extra}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

function TopicIntro({ topic }: { topic: DemoTopic }) {
  const totalScore = topic.chapters.reduce((sum, c) => sum + c.score, 0)

  return (
    <div className="space-y-4">
      <SectionHead
        icon={Layers}
        title="专业课介绍"
        desc="本专题的学科定位、知识框架与考点分布。分值占比取自近年统考真题统计口径。"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">课程代码 / 学分</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{topic.code}</p>
            <p className="text-[11px] text-muted-foreground">{topic.credit}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">本专题分值占比</p>
            <p className="mt-1 text-lg font-semibold text-primary tabular-nums">{topic.weight}%</p>
            <Progress value={topic.weight} className="mt-2 h-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">整体难度</p>
            <div className="mt-1 flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    'h-3.5 w-3.5',
                    n <= topic.difficulty ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
                  )}
                />
              ))}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">最近更新 {topic.updatedAt}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm leading-relaxed">{topic.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {topic.examTypes.map((type) => (
              <Badge key={type} variant="secondary" className="text-[11px] font-normal">
                {type}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>章节知识框架</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              近五年平均合计 {totalScore} 分 · {topic.chapters.length} 章
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {topic.chapters.map((chapter, index) => (
            <div key={chapter.name} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="w-28 shrink-0 truncate text-sm sm:w-32">{chapter.name}</span>
              <div className="min-w-0 flex-1">
                <Progress value={chapter.density} className="h-1.5" />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {chapter.density}%
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px] font-normal tabular-nums">
                {chapter.score} 分
              </Badge>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            进度条表示考点密度（近五年真题中该章出现的比例），非掌握进度。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function TopicQuestionBanks({ topic }: { topic: DemoTopic }) {
  const total = topic.banks.reduce((sum, b) => sum + b.count, 0)

  return (
    <div className="space-y-4">
      <SectionHead
        icon={ListChecks}
        title="关联题库"
        desc="与本专题绑定的练习题库。正式版本可直接跳转题库练习，当前为演示数据，未关联实际题库。"
        extra={<Badge variant="secondary" className="text-[10px] font-normal">{total} 题</Badge>}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {topic.banks.map((bank) => {
          const sum = bank.difficulty.easy + bank.difficulty.medium + bank.difficulty.hard
          const pct = (n: number) => (sum > 0 ? (n / sum) * 100 : 0)
          return (
            <Card key={bank.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm leading-snug">
                  <BookMarked className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                  {bank.name}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {bank.source} · {bank.yearRange}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 pt-1">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" />
                    {bank.count} 题
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    难度 {Math.round(((bank.difficulty.medium * 2 + bank.difficulty.hard * 3) / sum) * 10) / 10} / 3
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="bg-green-500" style={{ width: `${pct(bank.difficulty.easy)}%` }} />
                    <span className="bg-amber-500" style={{ width: `${pct(bank.difficulty.medium)}%` }} />
                    <span className="bg-red-500" style={{ width: `${pct(bank.difficulty.hard)}%` }} />
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>简单 {bank.difficulty.easy}</span>
                    <span>中等 {bank.difficulty.medium}</span>
                    <span>困难 {bank.difficulty.hard}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {bank.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <Button size="sm" variant="outline" disabled className="mt-auto w-fit">
                  进入练习 <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function TopicLiterature({ topic }: { topic: DemoTopic }) {
  return (
    <div className="space-y-4">
      <SectionHead
        icon={FileText}
        title="原始文献"
        desc="考点的源头材料：教材、经典论文、标准与真题原卷。读原始文献能避免二手转述带来的偏差。"
        extra={
          <Badge variant="secondary" className="text-[10px] font-normal">
            {topic.literatures.length} 篇
          </Badge>
        }
      />

      <div className="space-y-3">
        {topic.literatures.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn('border-transparent text-[10px] font-semibold', literatureTone[item.type])}
                >
                  {item.type}
                </Badge>
                <span className="text-sm font-medium leading-snug">{item.title}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {item.authors} · {item.year} · {item.source}
                {item.cited > 0 && <span className="ml-2">被引 {item.cited.toLocaleString()}</span>}
              </p>
              <p className="flex gap-1.5 text-xs leading-relaxed text-foreground/80">
                <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                {item.summary}
              </p>
              <Button size="sm" variant="ghost" disabled className="h-7 px-2 text-[11px]">
                查看原文 <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function TopicFootprints({ topic }: { topic: DemoTopic }) {
  return (
    <div className="space-y-4">
      <SectionHead
        icon={Footprints}
        title="前辈足迹"
        desc="往届考生在本专题留下的复习经验与踩坑记录。演示数据为虚构内容，正式版本由真实用户贡献。"
        extra={
          <Badge variant="secondary" className="text-[10px] font-normal">
            {topic.footprints.length} 条
          </Badge>
        }
      />

      <div className="relative space-y-3 pl-6">
        <span className="absolute left-[9px] top-2 bottom-2 w-px bg-border" aria-hidden />
        {topic.footprints.map((item) => (
          <div key={item.id} className="relative">
            <span
              className="absolute -left-6 top-4 flex h-[19px] w-[19px] items-center justify-center rounded-full border bg-card"
              aria-hidden
            >
              <GraduationCap className="h-3 w-3 text-primary" />
            </span>
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.author}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.school} · {item.year}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                    {item.score}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-foreground/85">{item.content}</p>
                <Separator />
                <div className="flex flex-wrap items-center gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                      {tag}
                    </Badge>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Heart className="h-3 w-3" />
                    {item.likes}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Component() {
  const { topicId } = useParams()
  const { pathname } = useLocation()
  const topic = getDemoTopic(topicId)
  const section = sectionKeyOf(pathname) ?? 'intro'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/topics" className="inline-flex items-center gap-0.5 hover:text-foreground">
          <ChevronLeft className="h-3 w-3" />
          专业专题
        </Link>
        <span>/</span>
        <span className="text-foreground">{topic.name}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <TopicSidebar topics={DEMO_TOPICS} topic={topic} />

        <main className="min-w-0 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-violet-200/60 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300">
            <Info className="h-3.5 w-3.5 shrink-0" />
            当前为 DEMO 演示版：全部内容为内置示例数据，未关联实际数据库。
          </div>

          <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{topic.name}</span>
              <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
                {topic.code}
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-normal">
                <Flame className="mr-1 h-3 w-3" />
                占比 {topic.weight}%
              </Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{topic.description}</p>
          </div>

          {section === 'question-bank' ? (
            <TopicQuestionBanks topic={topic} />
          ) : section === 'literature' ? (
            <TopicLiterature topic={topic} />
          ) : section === 'legacy' ? (
            <TopicFootprints topic={topic} />
          ) : (
            <TopicIntro topic={topic} />
          )}
        </main>
      </div>
    </div>
  )
}
