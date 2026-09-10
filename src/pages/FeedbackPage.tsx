import { useMemo, useState } from 'react'
import {
  Bug, Check, CircleDot, HelpCircle, Info, Lightbulb, MessageSquare, Search, Send,
  ThumbsUp, TriangleAlert, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  FEEDBACK_STATS, KIND_META, LABELS, MY_ISSUES, NEXT_ISSUE_NUMBER, PUBLIC_ISSUES,
  SEVERITY_META, STATUS_META,
  type FeedbackIssue, type IssueKind, type Severity,
} from '@/lib/feedback-demo'
import { cn } from '@/lib/utils'

const KIND_ICONS: Record<IssueKind, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  content: TriangleAlert,
  question: HelpCircle,
  other: CircleDot,
}

const KINDS: IssueKind[] = ['bug', 'feature', 'content', 'question', 'other']
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']

/** 自动采集的环境信息，用户不用手填 */
function collectEnv(): string {
  if (typeof window === 'undefined') return '—'
  const ua = window.navigator.userAgent
  const browser =
    ua.includes('Edg/') ? 'Edge' :
    ua.includes('Chrome/') ? 'Chrome' :
    ua.includes('Safari/') && !ua.includes('Chrome') ? 'Safari' :
    ua.includes('Firefox/') ? 'Firefox' : '未知浏览器'
  const version = ua.match(/(?:Chrome|Edg|Firefox|Safari)\/(\d+)/)?.[1] ?? '?'
  const os =
    ua.includes('Windows') ? 'Windows' :
    ua.includes('Macintosh') ? 'macOS' :
    ua.includes('Android') ? 'Android' :
    ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : '未知系统'
  const theme = document.documentElement.classList.contains('dark') ? '深色' : '浅色'
  return `${browser} ${version} / ${os} / ${theme} / ${window.innerWidth}×${window.innerHeight}`
}

function IssueRow({
  issue,
  onUpvote,
  mine,
}: {
  issue: FeedbackIssue
  onUpvote?: () => void
  mine?: boolean
}) {
  const kind = KIND_META[issue.kind]
  const status = STATUS_META[issue.status]
  const severity = SEVERITY_META[issue.severity]
  const KindIcon = KIND_ICONS[issue.kind]
  const [voted, setVoted] = useState(false)

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
      <KindIcon className={cn('mt-0.5 h-4 w-4 shrink-0', issue.kind === 'bug' ? 'text-rose-500' : issue.kind === 'feature' ? 'text-blue-500' : 'text-amber-500')} />

      <div className="min-w-[240px] flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">#{issue.number} {issue.title}</span>
          <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', kind.className)}>
            {kind.label}
          </Badge>
          <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', status.className)}>
            {status.label}
          </Badge>
          {!issue.public && (
            <Badge variant="outline" className="text-[9px] font-normal">仅自己可见</Badge>
          )}
        </div>
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{issue.body}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {issue.labels.map((label) => (
            <span key={label} className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>{mine ? '我' : issue.author} 提交于 {issue.createdAt}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-2.5 w-2.5" />
            {issue.comments} 条评论
          </span>
          <span>·</span>
          <span className={cn('font-medium', severity.className)}>严重程度：{severity.label}</span>
          <span>·</span>
          <span className="font-mono">{issue.env}</span>
        </div>
      </div>

      {!mine && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0"
          disabled={voted}
          onClick={() => {
            setVoted(true)
            onUpvote?.()
          }}
        >
          <ThumbsUp className="mr-1 h-3 w-3" />
          {issue.upvotes + (voted ? 1 : 0)}
        </Button>
      )}
    </div>
  )
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  ...Object.entries(STATUS_META).map(([key, meta]) => ({ key, label: meta.label })),
]

function NewIssueForm({ onSubmit }: { onSubmit: (issue: FeedbackIssue) => void }) {
  const env = useMemo(() => collectEnv(), [])
  const [kind, setKind] = useState<IssueKind>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [steps, setSteps] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [labels, setLabels] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)

  const canSubmit = title.trim().length >= 5 && body.trim().length >= 10

  function toggleLabel(label: string) {
    setLabels((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]))
  }

  function submit() {
    if (!canSubmit) return
    onSubmit({
      number: NEXT_ISSUE_NUMBER,
      title: title.trim(),
      kind,
      status: 'open',
      severity,
      labels,
      author: '我',
      createdAt: new Date().toISOString().slice(0, 10),
      comments: 0,
      upvotes: 0,
      public: isPublic,
      env,
      body: body.trim(),
      steps: steps.trim() || undefined,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
    })
    setTitle(''); setBody(''); setSteps(''); setExpected(''); setActual(''); setLabels([])
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">选择反馈类型</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-5">
          {KINDS.map((item) => {
            const meta = KIND_META[item]
            const Icon = KIND_ICONS[item]
            const active = kind === item
            return (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition-colors',
                  active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <p className={cn('flex items-center gap-1.5 text-xs font-medium', active && 'text-primary')}>
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{meta.hint}</p>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="fb-title" className="text-xs">
              标题 <span className="text-muted-foreground">（一句话说清问题，至少 5 个字）</span>
            </Label>
            <Input
              id="fb-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例：练习模式连续答题时偶尔重复出现刚做过的题"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-body" className="text-xs">
              详细描述 <span className="text-muted-foreground">（至少 10 个字）</span>
            </Label>
            <Textarea
              id="fb-body"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="说清你在做什么、看到了什么、觉得哪里不对。"
              className="text-sm"
            />
          </div>

          {kind === 'bug' && (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-steps" className="text-xs">复现步骤</Label>
                  <Textarea
                    id="fb-steps"
                    rows={3}
                    value={steps}
                    onChange={(event) => setSteps(event.target.value)}
                    placeholder={'1. 进入…\n2. 点击…\n3. 观察到…'}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-expected" className="text-xs">期望结果</Label>
                    <Input
                      id="fb-expected"
                      value={expected}
                      onChange={(event) => setExpected(event.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-actual" className="text-xs">实际结果</Label>
                    <Input
                      id="fb-actual"
                      value={actual}
                      onChange={(event) => setActual(event.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-1.5">
            <p className="text-xs">严重程度</p>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSeverity(item)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    severity === item
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {SEVERITY_META[item].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs">标签 <span className="text-muted-foreground">（可多选，方便分类处理）</span></p>
            <div className="flex flex-wrap gap-1.5">
              {LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleLabel(label)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    labels.includes(label)
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] text-muted-foreground">环境信息（自动采集，无需填写）</p>
            <p className="mt-0.5 font-mono text-[11px]">{env}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              当前页面：{typeof window !== 'undefined' ? window.location.pathname : '—'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm">公开这条反馈</p>
              <p className="text-[11px] text-muted-foreground">
                公开后其他人可以看到并 +1；涉及账号与密钥信息请保持不公开
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!canSubmit} onClick={submit}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              提交反馈
            </Button>
            {!canSubmit && (
              <span className="text-[11px] text-muted-foreground">标题至少 5 字、描述至少 10 字</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function Component() {
  const [mine, setMine] = useState<FeedbackIssue[]>(MY_ISSUES)
  const [publicIssues, setPublicIssues] = useState<FeedbackIssue[]>(PUBLIC_ISSUES)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all')
  const [submitted, setSubmitted] = useState<FeedbackIssue | null>(null)

  const filteredPublic = publicIssues.filter((issue) => {
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false
    if (keyword.trim()) {
      const haystack = `${issue.title} ${issue.body} ${issue.labels.join(' ')}`.toLowerCase()
      if (!haystack.includes(keyword.trim().toLowerCase())) return false
    }
    return true
  })

  function handleSubmit(issue: FeedbackIssue) {
    setMine((prev) => [issue, ...prev])
    if (issue.public) setPublicIssues((prev) => [issue, ...prev])
    setSubmitted(issue)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Bug className="h-5 w-5 text-primary" />
          问题反馈
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          参照 GitHub issue 的流程提交：说清类型、现象、复现步骤与环境信息。公开反馈其他人可以 +1，处理进度会同步更新。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FEEDBACK_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
              {stat.hint && <p className="text-[10px] leading-snug text-muted-foreground">{stat.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {submitted && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5 shrink-0" />
          已提交 #{submitted.number}「{submitted.title}」，可在「我提交的」里跟踪进度。
          <button
            type="button"
            onClick={() => setSubmitted(null)}
            className="ml-auto inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
          >
            知道了 <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            提交反馈
          </TabsTrigger>
          <TabsTrigger value="mine">
            <CircleDot className="mr-1.5 h-3.5 w-3.5" />
            我提交的
            <Badge variant="secondary" className="ml-1.5 px-1 text-[9px] font-normal">{mine.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="public">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            公开反馈
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <NewIssueForm onSubmit={handleSubmit} />
        </TabsContent>

        <TabsContent value="mine" className="space-y-3">
          {mine.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                你还没有提交过反馈。
              </CardContent>
            </Card>
          ) : (
            mine.map((issue) => <IssueRow key={issue.number} issue={issue} mine />)
          )}
        </TabsContent>

        <TabsContent value="public" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题、描述或标签"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setStatusFilter(filter.key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    statusFilter === filter.key
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {filteredPublic.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                没有符合条件的公开反馈。
              </CardContent>
            </Card>
          ) : (
            filteredPublic.map((issue) => <IssueRow key={issue.number} issue={issue} />)
          )}
        </TabsContent>
      </Tabs>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        本页为 DEMO 演示：提交与 +1 只在本地生效，不会发送到任何服务器。正式版会接入真实的 issue 跟踪服务，
        并对「题目纠错」类反馈提供有奖捉虫与审核回执。
      </p>
    </div>
  )
}
