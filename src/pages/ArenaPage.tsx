import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, CheckCheck, Copy, Eye, EyeOff, Flag, Handshake, Info, Link2,
  Lock, ShieldUser, Swords, UserRound, Users, Zap,
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
import { topicAccent, topicSectionUrl } from '@/components/topics/topic-sections'
import { DEMO_TOPICS, getDemoTopic } from '@/lib/topics-demo'
import {
  ARENA_PAPERS, ARENA_STATS, DEFAULT_PROFILE, PK_MATCHES, PK_STATUS_META,
  papersOfTopic, questionsOfPaper, type ArenaPaper, type PublicProfile,
} from '@/lib/arena-demo'
import { cn } from '@/lib/utils'

const VISIBILITY_OPTIONS: { key: PublicProfile['visibility']; label: string; desc: string; icon: typeof Lock }[] = [
  { key: 'private', label: '仅自己可见', desc: '不对外展示任何专业课外信息', icon: Lock },
  { key: 'friends', label: '好友可见', desc: '仅我同意的好友能看到我的专业课与战绩', icon: ShieldUser },
  { key: 'public', label: '公开', desc: '出现在排行榜与自习室，任何人均可发起挑战', icon: Eye },
]

function StatsStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ARENA_STATS.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-3.5">
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
            {stat.hint && <p className="text-[10px] text-muted-foreground/80">{stat.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function MatchList() {
  return (
    <div className="space-y-3">
      {PK_MATCHES.map((match) => {
        const topic = getDemoTopic(match.topicId)
        const meta = PK_STATUS_META[match.status]
        const finished = match.status === 'won' || match.status === 'lost' || match.status === 'draw'
        return (
          <Card key={match.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <UserRound className="h-4 w-4 text-muted-foreground" />
              </span>

              <div className="min-w-[160px] flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{match.opponent}</span>
                  <Badge className={cn('border-transparent text-[10px] font-normal', meta.className)}>{meta.label}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{match.opponentTag}</p>
              </div>

              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(DEMO_TOPICS.findIndex((t) => t.id === topic.id)))}>
                    {topic.short}
                  </span>
                  <span className="truncate text-xs">{match.paperName}</span>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {match.questionCount} 题 · {match.durationMin} 分钟 · {match.createdAt}
                </p>
              </div>

              <div className="shrink-0 text-center">
                <p className="text-sm font-semibold tabular-nums">
                  {match.myScore ?? '—'} <span className="text-muted-foreground">:</span> {match.opponentScore ?? '—'}
                </p>
                <p className="text-[10px] text-muted-foreground">我 vs 对手</p>
              </div>

              <div className="flex shrink-0 gap-2">
                {match.status === 'pending' && (
                  <>
                    <Button size="sm" disabled className="h-7">
                      应战
                    </Button>
                    <Button size="sm" variant="ghost" disabled className="h-7">
                      婉拒
                    </Button>
                  </>
                )}
                {match.status === 'ongoing' && (
                  <Button size="sm" disabled className="h-7">
                    进入对局
                  </Button>
                )}
                {finished && (
                  <Button size="sm" variant="outline" disabled className="h-7">
                    查看复盘
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3" />
        对战记录、应战与复盘均需服务端支持，DEMO 阶段按钮不可点击。
      </p>
    </div>
  )
}

function InviteForm() {
  const [topicId, setTopicId] = useState(DEMO_TOPICS[0].id)
  const [paperId, setPaperId] = useState('')
  const [opponent, setOpponent] = useState('')
  const [message, setMessage] = useState('来一场友好的专业课切磋，不计入排名。')
  const [scope, setScope] = useState<'invite' | 'public'>('invite')
  const [invite, setInvite] = useState<{ code: string; paper: ArenaPaper } | null>(null)
  const [copied, setCopied] = useState(false)

  const papers = papersOfTopic(topicId)
  const activePaper = papers.find((item) => item.id === paperId) ?? papers[0] ?? ARENA_PAPERS[0]
  const previewQuestions = questionsOfPaper(activePaper.id).slice(0, 3)

  const inviteLink = invite ? `https://practice-web.example.com/arena/join/${invite.code}` : ''

  function handleGenerate() {
    const code = `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    setInvite({ code, paper: activePaper })
    setCopied(false)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
    } catch {
      setCopied(true)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">发起一场友好 PK</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs">选择专业课</Label>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_TOPICS.map((topic, index) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    setTopicId(topic.id)
                    setPaperId('')
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    topic.id === topicId
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(index))}>{topic.short}</span>
                  {topic.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">关联试卷</Label>
            <div className="space-y-1.5">
              {papers.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  onClick={() => setPaperId(paper.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                    paper.id === activePaper.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{paper.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {paper.source} · {paper.questionCount} 题 · {paper.durationMin} 分钟
                    </span>
                  </span>
                  {paper.id === activePaper.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pk-opponent" className="text-xs">
                对手昵称
              </Label>
              <Input
                id="pk-opponent"
                value={opponent}
                onChange={(event) => setOpponent(event.target.value)}
                placeholder="留空则生成公开邀请链接"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">可见范围</Label>
              <div className="flex gap-1.5">
                {([
                  { key: 'invite', label: '仅受邀人可见' },
                  { key: 'public', label: '公开到大厅' },
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setScope(option.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      scope === option.key
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pk-message" className="text-xs">
              邀请语
            </Label>
            <Textarea
              id="pk-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleGenerate}>
              <Swords className="mr-1.5 h-3.5 w-3.5" />
              生成邀请
            </Button>
            <span className="text-[11px] text-muted-foreground">DEMO 仅在本地生成邀请码，不会真正发出。</span>
          </div>

          {invite && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <CheckCheck className="h-3.5 w-3.5" />
                邀请已生成 · {invite.paper.name}
              </div>
              <p className="font-mono text-lg font-semibold tracking-widest">{invite.code}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px] text-muted-foreground">
                  {inviteLink}
                </code>
                <Button size="sm" variant="outline" className="h-7" onClick={handleCopy}>
                  {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? '已复制' : '复制链接'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">本场关联题目</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            {activePaper.name} · 共 {activePaper.questionCount} 题，以下为前 3 题预览
          </p>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {previewQuestions.map((question, index) => (
            <div key={question.id} className="rounded-lg border p-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground">第 {index + 1} 题</span>
                <Badge variant="outline" className="text-[9px] font-normal">
                  {question.type}
                </Badge>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-foreground/85">{question.stem}</p>
            </div>
          ))}
          <Link
            to={topicSectionUrl(activePaper.topicId, 'question-bank')}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            查看该专业课全部题库 <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function PublicProfilePanel() {
  const [visibility, setVisibility] = useState<PublicProfile['visibility']>(DEFAULT_PROFILE.visibility)
  const [publicTopicIds, setPublicTopicIds] = useState<string[]>(DEFAULT_PROFILE.publicTopicIds)
  const [allowChallenge, setAllowChallenge] = useState(DEFAULT_PROFILE.allowChallenge)
  const [showScore, setShowScore] = useState(DEFAULT_PROFILE.showScore)

  function toggleTopic(id: string) {
    setPublicTopicIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const publicTopics = DEMO_TOPICS.filter((topic) => publicTopicIds.includes(topic.id))

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">谁可以看到我的专业课信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {VISIBILITY_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = visibility === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setVisibility(option.key)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{option.desc}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">公开哪些专业课</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              勾选后，他人可在你的档案与排行榜中看到这些专业课的学习进度与战绩。
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {DEMO_TOPICS.map((topic, index) => {
                const active = publicTopicIds.includes(topic.id)
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => toggleTopic(topic.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(index))}>{topic.short}</span>
                    {topic.name}
                    {active && <Check className="h-3 w-3" />}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">已公开 {publicTopicIds.length} / {DEMO_TOPICS.length} 门</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">其他设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">允许他人向我发起挑战</p>
                <p className="text-[11px] text-muted-foreground">关闭后仅你可主动发起 PK</p>
              </div>
              <Switch checked={allowChallenge} onCheckedChange={setAllowChallenge} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">公开我的对战比分</p>
                <p className="text-[11px] text-muted-foreground">关闭后对手仅能看到胜负，看不到具体分数</p>
              </div>
              <Switch checked={showScore} onCheckedChange={setShowScore} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            他人看到的你
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <UserRound className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{DEFAULT_PROFILE.nickname}</p>
              <p className="truncate text-[11px] text-muted-foreground">{DEFAULT_PROFILE.signature}</p>
            </div>
          </div>

          <Separator />

          {visibility === 'private' ? (
            <p className="flex items-center gap-1.5 py-4 text-xs text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" />
              当前仅自己可见，他人看不到你的专业课信息。
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {visibility === 'friends' ? '好友可见的专业课' : '公开展示的专业课'}
              </p>
              {publicTopics.length === 0 ? (
                <p className="text-xs text-muted-foreground">尚未公开任何专业课。</p>
              ) : (
                publicTopics.map((topic) => {
                  const index = DEMO_TOPICS.findIndex((item) => item.id === topic.id)
                  return (
                    <div key={topic.id} className="flex items-center gap-2 text-xs">
                      <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(index))}>{topic.short}</span>
                      <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        热度 {topic.popularity.toLocaleString()}
                      </span>
                    </div>
                  )
                })
              )}
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Flag className="h-3 w-3" />
                  {allowChallenge ? '接受挑战' : '不接受挑战'}
                </span>
                <span className="inline-flex items-center gap-1">
                  {showScore ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {showScore ? '公开比分' : '仅公开胜负'}
                </span>
              </div>
            </div>
          )}

          <p className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
            <Info className="h-3 w-3" />
            DEMO：设置项仅在本地生效，不会写入数据库。
          </p>
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
          <Swords className="h-5 w-5 text-primary" />
          竞赛
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选一门专业课，公开你的学习信息，邀请同学来一场不计排名的友好 PK。配套试卷与题目自动关联到对应专题。
        </p>
      </div>

      <StatsStrip />

      <Tabs defaultValue="lobby" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lobby">
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            对战大厅
          </TabsTrigger>
          <TabsTrigger value="invite">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            发起邀请
          </TabsTrigger>
          <TabsTrigger value="profile">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            公开档案
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lobby" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Handshake className="h-3.5 w-3.5" />
            全部为友好 PK，不影响排行榜与成绩记录。
          </div>
          <MatchList />
        </TabsContent>

        <TabsContent value="invite">
          <InviteForm />
        </TabsContent>

        <TabsContent value="profile">
          <PublicProfilePanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
