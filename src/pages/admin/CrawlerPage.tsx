import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity, Bot, Check, Cpu, Database, ExternalLink, Gauge, Globe, Info, MessageSquareText,
  Pause, Play, Radar, RotateCw, ScanSearch, Server, ShieldCheck, TriangleAlert, UserRound, Waypoints, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent } from '@/components/topics/topic-sections'
import {
  CRAWLER_NODES, CRAWL_LOGS, CRAWL_PIPELINE, CRAWL_SOURCES, CRAWLED_QUESTIONS,
  EXPERIENCE_NODES, EXPERIENCE_PLATFORMS, EXPERIENCE_POSTS,
  NODE_STATUS_META, POST_STATUS_META, QUESTION_STATUS_META,
  type CrawlerNode, type CrawlerTab, type ExperiencePost,
} from '@/lib/crawler-demo'
import { getDemoTopic, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const LOG_POOL: { level: 'info' | 'warn' | 'error'; node: string; text: string }[] = [
  { level: 'info', node: '华东-01', text: '模拟客户端完成第 %d 次指纹轮换，命中率 98.2%' },
  { level: 'info', node: '华北-01', text: '多模态抽取：识别到公式块 2 处、表格 1 处，已还原为结构化文本' },
  { level: 'warn', node: '华南-01', text: '站点响应变慢（P95 2.4s），自动降速至 6 页/分' },
  { level: 'info', node: '华东-02', text: '语义查重比对完成，相似度 0.93，转入人工复核' },
  { level: 'error', node: '海外-01', text: '连续 403，节点已熔断，等待人工确认授权' },
  { level: 'info', node: '华北-01', text: '结构化归一：选项顺序重排、全角符号统一完成' },
  { level: 'info', node: '华东-01', text: '入库成功，来源与采集节点已一并写入审计记录' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 基于 tick 推演的模拟时间戳，避免真随机导致每次渲染都抖动 */
function stamp(tick: number, offset: number): string {
  const base = new Date(2026, 8, 11, 5, 12, 41)
  base.setSeconds(base.getSeconds() + (tick - offset) * 2)
  return `${pad(base.getHours())}:${pad(base.getMinutes())}:${pad(base.getSeconds())}`
}

function liveNode(node: CrawlerNode, tick: number): CrawlerNode {
  if (node.status !== 'running') return node
  const perTick = Math.max(1, Math.round(node.pagesPerMin / 4))
  return { ...node, fetched: node.fetched + tick * perTick }
}

function NodeCard({ node, tick }: { node: CrawlerNode; tick: number }) {
  const current = liveNode(node, tick)
  const meta = NODE_STATUS_META[node.status]
  return (
    <Card>
      <CardContent className="space-y-2.5 p-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Server className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{node.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {node.region} · {node.ip}
            </p>
          </div>
          <Badge variant="secondary" className={cn('shrink-0 border-transparent text-[9px] font-normal', meta.className)}>
            {meta.label}
          </Badge>
        </div>

        <p className="truncate rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground" title={current.currentUrl}>
          {current.currentUrl}
        </p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">吞吐</p>
            <p className="text-xs font-semibold tabular-nums">{node.pagesPerMin}/分</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">已抓取</p>
            <p className="text-xs font-semibold tabular-nums">{current.fetched.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">失败</p>
            <p className={cn('text-xs font-semibold tabular-nums', node.failed > 30 && 'text-rose-600 dark:text-rose-400')}>
              {node.failed}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-2.5 w-2.5" />
            负责 {node.operator}
          </span>
          <span>心跳 {node.lastHeartbeat}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function PipelineFlow() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {CRAWL_PIPELINE.map((step, index) => (
        <div key={step.key} className="relative rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
              {index + 1}
            </span>
            <span className="truncate text-xs font-medium">{step.name}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{step.desc}</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold tabular-nums">{step.count.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">均 {step.avgMs}ms</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function LiveLogs({ tick, live }: { tick: number; live: boolean }) {
  const generated = Array.from({ length: 4 }, (_, index) => {
    const source = LOG_POOL[(tick + index) % LOG_POOL.length]
    return {
      time: stamp(tick, index),
      level: source.level,
      node: source.node,
      text: source.text.replace('%d', String(120 + ((tick * 7 + index) % 90))),
    }
  })
  const logs = [...generated, ...CRAWL_LOGS].slice(0, 8)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          实时日志
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground')} />
            {live ? '采集中' : '已暂停'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-1">
        {logs.map((log, index) => (
          <div key={`${log.time}-${index}`} className="flex gap-2 font-mono text-[11px] leading-relaxed">
            <span className="shrink-0 text-muted-foreground">{log.time}</span>
            <span
              className={cn(
                'shrink-0',
                log.level === 'error'
                  ? 'text-rose-600 dark:text-rose-400'
                  : log.level === 'warn'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {log.level.toUpperCase()}
            </span>
            <span className="shrink-0 text-muted-foreground">[{log.node}]</span>
            <span className="min-w-0 flex-1">{log.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function TopicTag({ topicId }: { topicId: string }) {
  const topic = getDemoTopic(topicId)
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', topicAccent(topicIndexOf(topicId)))}>
      {topic.short}
    </span>
  )
}

function QuestionCrawler() {
  const [live, setLive] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setTick((value) => value + 1), 1600)
    return () => window.clearInterval(id)
  }, [live])

  const nodes = CRAWLER_NODES.map((node) => liveNode(node, tick))
  const totalFetched = nodes.reduce((sum, node) => sum + node.fetched, 0)
  const totalFailed = nodes.reduce((sum, node) => sum + node.failed, 0)
  const target = 4628
  const progress = Math.min(97, Math.round((totalFetched / target) * 100))

  const stats = [
    { label: '已抓取页面', value: totalFetched.toLocaleString(), hint: `目标 ${target.toLocaleString()}` },
    { label: '解析成功', value: '4,390', hint: '多模态抽取' },
    { label: '去重后待审', value: '2,976', hint: '语义查重通过' },
    { label: '来源站点', value: String(CRAWL_SOURCES.length), hint: '含 2 个已授权' },
    { label: '失败 / 熔断', value: totalFailed.toLocaleString(), hint: '自动重试中' },
    { label: '活跃节点', value: String(nodes.filter((node) => node.status === 'running').length), hint: `共 ${nodes.length} 个` },
  ]

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant={live ? 'outline' : 'default'} onClick={() => setLive((value) => !value)}>
              {live ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {live ? '暂停采集' : '继续采集'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTick(0)}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              重置演示
            </Button>
            <span className="text-[11px] text-muted-foreground">
              任务：全量采集 408 四门 + 数据库 / 编译原理，多模态解析后去重入库
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>总体进度</span>
              <span className="tabular-nums">
                {totalFetched.toLocaleString()} / {target.toLocaleString()} 页 · {progress}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Waypoints className="h-4 w-4 text-primary" />
          采集管线
          <span className="text-[11px] font-normal text-muted-foreground">
            模拟客户端 → 多模态大模型解析 → 结构化 → 查重 → 入库
          </span>
        </h2>
        <PipelineFlow />
      </div>

      <div className="space-y-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-primary" />
          分布式节点
          <span className="text-[11px] font-normal text-muted-foreground">{nodes.length} 个节点 · 跨 6 个区域</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} tick={tick} />
          ))}
        </div>
      </div>

      <LiveLogs tick={tick} live={live} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScanSearch className="h-4 w-4 text-primary" />
            采集结果
            <span className="text-[11px] font-normal text-muted-foreground">
              每条记录都保留内容来源与操作人，可追溯到原始页面
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[240px]">题目</TableHead>
                  <TableHead>内容来源</TableHead>
                  <TableHead>采集节点</TableHead>
                  <TableHead>发起人</TableHead>
                  <TableHead>审核人</TableHead>
                  <TableHead className="text-right">置信度</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CRAWLED_QUESTIONS.map((question) => {
                  const meta = QUESTION_STATUS_META[question.status]
                  return (
                    <TableRow key={question.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <TopicTag topicId={question.topicId} />
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-xs leading-relaxed">{question.title}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {question.type} · {question.modality}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">{question.sourceSite}</p>
                        <a
                          href={question.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex max-w-[200px] items-center gap-1 truncate text-[10px] text-primary hover:underline"
                        >
                          {question.sourceUrl}
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{question.node}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3 text-muted-foreground" />
                          {question.operator}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{question.reviewer}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'text-xs font-medium tabular-nums',
                            question.confidence >= 0.9
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : question.confidence >= 0.7
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {question.confidence.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn('border-transparent text-[10px] font-normal', meta.className)}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            来源站点与合规
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {CRAWL_SOURCES.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium">{source.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{source.domain}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'border-transparent text-[9px] font-normal',
                      source.authorized
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                    )}
                  >
                    {source.authorized ? '已授权' : '未授权 / 限速'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{source.compliance}</p>
              </div>
              <div className="flex gap-1">
                {source.topicIds.map((topicId) => (
                  <TopicTag key={topicId} topicId={topicId} />
                ))}
              </div>
              <div className="flex shrink-0 gap-4 text-right">
                <div>
                  <p className="text-[10px] text-muted-foreground">页面</p>
                  <p className="text-xs font-semibold tabular-nums">{source.pages}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">题目</p>
                  <p className="text-xs font-semibold tabular-nums">{source.questions}</p>
                </div>
              </div>
            </div>
          ))}
          <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            采集前校验 robots 与授权状态，命中未授权站点立即降速或熔断；入库题目保留来源站点与原始 URL，权利人可申请下架。DEMO 不会发起任何真实请求。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ExperiencePanel() {
  const [posts, setPosts] = useState<ExperiencePost[]>(EXPERIENCE_POSTS)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1800)
    return () => window.clearInterval(id)
  }, [])

  function decide(id: string, status: ExperiencePost['status']) {
    setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, status } : post)))
  }

  const pendingCount = posts.filter((post) => post.status === 'pending').length
  const approvedCount = posts.filter((post) => post.status === 'approved').length
  const rejectedCount = posts.filter((post) => post.status === 'rejected').length

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {EXPERIENCE_PLATFORMS.map((platform) => (
          <Card key={platform.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{platform.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{platform.domain}</p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-semibold tabular-nums">
                    {(platform.collected + tick * 2).toLocaleString()}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">已采集</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-amber-50 py-1.5 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">{platform.pending}</p>
                  <p className="text-[10px] text-muted-foreground">待审核</p>
                </div>
                <div className="rounded-md bg-emerald-50 py-1.5 dark:bg-emerald-950/30">
                  <p className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{platform.approved}</p>
                  <p className="text-[10px] text-muted-foreground">已采纳</p>
                </div>
                <div className="rounded-md bg-rose-50 py-1.5 dark:bg-rose-950/30">
                  <p className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">{platform.rejected}</p>
                  <p className="text-[10px] text-muted-foreground">已驳回</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{platform.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-primary" />
          经验采集节点
          <span className="text-[11px] font-normal text-muted-foreground">
            按平台分组，同一节点串行抓取以避免触发风控
          </span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EXPERIENCE_NODES.map((node) => (
            <NodeCard key={node.id} node={node} tick={tick} />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Radar className="h-4 w-4 text-primary" />
            经验分享管理
            <span className="text-[11px] font-normal text-muted-foreground">
              待审核 {pendingCount} · 已采纳 {approvedCount} · 已驳回 {rejectedCount}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {posts.map((post) => {
            const meta = POST_STATUS_META[post.status]
            return (
              <div key={post.id} className="rounded-lg border p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[240px] flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{post.title}</span>
                      <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{post.excerpt}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {post.topicIds.map((topicId) => (
                        <TopicTag key={topicId} topicId={topicId} />
                      ))}
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="w-full space-y-1.5 text-[11px] sm:w-64">
                    <p className="flex items-center gap-1.5">
                      <MessageSquareText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{post.platform}</span>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        原文 <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {post.hasImages && (
                        <Badge variant="outline" className="text-[9px] font-normal">
                          含配图
                        </Badge>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <UserRound className="h-3 w-3 shrink-0" />
                      原作者 <span className="text-foreground">{post.author}</span>
                      <span className="font-mono">{post.authorHandle}</span>
                      {post.authorVerified && <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                    </p>
                    <p className="text-muted-foreground">
                      采集人 <span className="text-foreground">{post.operator}</span> · {post.node} · {post.collectedAt}
                    </p>
                    <p className="text-muted-foreground tabular-nums">原文获赞 {post.likes.toLocaleString()}</p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {post.status === 'pending' ? (
                      <>
                        <Button size="sm" className="h-7" onClick={() => decide(post.id, 'approved')}>
                          <Check className="mr-1 h-3 w-3" />
                          采纳
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => decide(post.id, 'rejected')}>
                          <X className="mr-1 h-3 w-3" />
                          驳回
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => decide(post.id, 'pending')}>
                        <RotateCw className="mr-1 h-3 w-3" />
                        重置为待审
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            经验内容合规策略
          </p>
          <div className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
            <p>· 仅采集公开发布的内容，不抓取私密笔记、付费专栏与私信。</p>
            <p>· 全部保留原作者昵称、主页标识与原文链接，可一键跳转原文。</p>
            <p>· 命中推广词库、引流联系方式的内容自动驳回，不进审核队列。</p>
            <p>· 作者可提交申请，要求下架或转为「仅站内摘要」。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function Component() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: CrawlerTab = searchParams.get('tab') === 'experience' ? 'experience' : 'questions'

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Bot className="h-5 w-5 text-primary" />
          分布式采集
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          多节点模拟客户端访问公开题库，由多模态大模型完成题干、公式与图表的抽取与结构化，去重后进入待审队列；
          同时支持从小红书 / 知乎采集公开的经验分享。全过程记录操作人与内容来源。
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {[
          { icon: Cpu, text: '模拟客户端 · 无头浏览器 + 指纹轮换' },
          { icon: ScanSearch, text: '多模态抽取 · 题干 / 公式 / 图表' },
          { icon: Database, text: '语义查重 · 与现有题库双通道比对' },
          { icon: Gauge, text: '限速与熔断 · 按 robots 与授权状态' },
        ].map((item) => (
          <span
            key={item.text}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground"
          >
            <item.icon className="h-3 w-3 text-primary" />
            {item.text}
          </span>
        ))}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === 'questions' ? {} : { tab: value }, { replace: true })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="questions">
            <Database className="mr-1.5 h-3.5 w-3.5" />
            题库采集
          </TabsTrigger>
          <TabsTrigger value="experience">
            <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
            经验分享管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-4">
          <QuestionCrawler />
        </TabsContent>

        <TabsContent value="experience" className="space-y-4">
          <ExperiencePanel />
        </TabsContent>
      </Tabs>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        本页为 DEMO 演示：所有节点、站点、用户与统计数据均为内置示例，页面不会发起任何真实网络请求，也不会写入数据库。
      </p>
    </div>
  )
}
