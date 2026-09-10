import { useState, type ReactNode } from 'react'
import {
  Check, CheckCircle2, Clock, Copy, Eye, GraduationCap, HeartHandshake, Lock,
  MessageCircle, Search, Send, SlidersHorizontal, Sparkles, Star, UserCheck, UserPlus, UsersRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MentorCard } from '@/components/mentors/MentorCard'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent } from '@/components/topics/topic-sections'
import {
  APPLICATION_STATUS_META, CONTACT_CHANNELS, DEFAULT_MENTOR_SETTINGS, HELP_KINDS, MENTORS,
  MENTOR_STATS, MY_APPLICATIONS, REWARD_KINDS, TIER_CLASS, VISIBILITY_OPTIONS,
  hasVacancy, maskContact, mentorById,
  type ContactChannel, type HelpKind, type Mentor, type MentorshipApplication,
  type MentorSettings, type RewardKind,
} from '@/lib/mentors-demo'
import { DEMO_TOPICS, getDemoTopic, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

type SortKey = 'rating' | 'response' | 'slots' | 'mentees'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: '评分最高' },
  { key: 'response', label: '响应最快' },
  { key: 'slots', label: '名额最多' },
  { key: 'mentees', label: '带过最多' },
]

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function TopicTag({ topicId }: { topicId: string }) {
  const topic = getDemoTopic(topicId)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        topicAccent(topicIndexOf(topicId)),
      )}
    >
      {topic.short} · {topic.name}
    </span>
  )
}

function MentorBrowser({
  statusOf,
  onOpen,
}: {
  statusOf: (mentorId: string) => MentorshipApplication['status'] | undefined
  onOpen: (mentor: Mentor) => void
}) {
  const [query, setQuery] = useState('')
  const [topicId, setTopicId] = useState<string>('all')
  const [help, setHelp] = useState<HelpKind | 'all'>('all')
  const [onlyVacant, setOnlyVacant] = useState(false)
  const [sort, setSort] = useState<SortKey>('rating')

  const keyword = query.trim().toLowerCase()
  const filtered = MENTORS.filter((mentor) => {
    if (topicId !== 'all' && !mentor.topicIds.includes(topicId)) return false
    if (help !== 'all' && !mentor.helps.includes(help)) return false
    if (onlyVacant && !hasVacancy(mentor)) return false
    if (keyword) {
      const haystack = `${mentor.nickname} ${mentor.school} ${mentor.major} ${mentor.headline}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'response') return a.responseHours - b.responseHours
    if (sort === 'slots') return b.slots.total - b.slots.used - (a.slots.total - a.slots.used)
    if (sort === 'mentees') return b.menteeCount - a.menteeCount
    return b.rating - a.rating
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MENTOR_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {stat.value}
                {stat.hint && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{stat.hint}</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            筛选
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              共 {sorted.length} 位引路人
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索院校 / 昵称 / 一句话介绍"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={onlyVacant} onCheckedChange={setOnlyVacant} id="only-vacant" />
              <Label htmlFor="only-vacant" className="text-xs text-muted-foreground">
                只看还有名额
              </Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">专业课方向</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={topicId === 'all'} onClick={() => setTopicId('all')}>
                全部
              </Chip>
              {DEMO_TOPICS.map((topic) => (
                <Chip key={topic.id} active={topicId === topic.id} onClick={() => setTopicId(topic.id)}>
                  <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(topicIndexOf(topic.id)))}>
                    {topic.short}
                  </span>
                  {topic.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">能提供的帮助</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={help === 'all'} onClick={() => setHelp('all')}>
                全部
              </Chip>
              {HELP_KINDS.map((kind) => (
                <Chip key={kind} active={help === kind} onClick={() => setHelp(kind)}>
                  {kind}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">排序</p>
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((item) => (
                <Chip key={item.key} active={sort === item.key} onClick={() => setSort(item.key)}>
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            没有符合条件的引路人，试试放宽筛选条件。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} myStatus={statusOf(mentor.id)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function MyMentorship({
  applications,
  onOpen,
  onWithdraw,
}: {
  applications: MentorshipApplication[]
  onOpen: (mentor: Mentor) => void
  onWithdraw: (applicationId: string) => void
}) {
  const accepted = applications
    .filter((item) => item.status === 'accepted')
    .map((item) => mentorById(item.mentorId))
    .filter((mentor): mentor is Mentor => Boolean(mentor))

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">
          我的引路人
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{accepted.length} 位</span>
        </h2>
        {accepted.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              还没有结对成功。去「找引路人」看看，或者先在专题的「前辈足迹」里找找感觉。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accepted.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} myStatus="accepted" onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">
          我的拜师申请
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{applications.length} 条</span>
        </h2>
        {applications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">暂无申请记录。</CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {applications.map((application) => {
              const mentor = mentorById(application.mentorId)
              if (!mentor) return null
              const meta = APPLICATION_STATUS_META[application.status]
              return (
                <Card key={application.id}>
                  <CardContent className="flex flex-wrap items-start gap-4 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {mentor.nickname.slice(0, 1)}
                    </span>

                    <div className="min-w-[180px] flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{mentor.nickname}</span>
                        <Badge
                          variant="secondary"
                          className={cn('border-transparent text-[9px] font-normal', TIER_CLASS[mentor.schoolTier])}
                        >
                          {mentor.schoolTier}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={cn('border-transparent text-[10px] font-normal', meta.className)}
                        >
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {mentor.school} · {mentor.major} · 申请于 {application.createdAt}
                      </p>
                      <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{application.message}</p>
                      <p className="text-[11px] text-muted-foreground">我的目标：{application.goal}</p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => onOpen(mentor)}>
                        查看主页
                      </Button>
                      {application.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => onWithdraw(application.id)}
                        >
                          撤回申请
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        引路人通常会在 1-3 天内处理申请，超过 7 天未处理会自动关闭。
      </p>
    </div>
  )
}

function BecomeMentor() {
  const [settings, setSettings] = useState<MentorSettings>(DEFAULT_MENTOR_SETTINGS)
  const [contactDrafts, setContactDrafts] = useState<Partial<Record<ContactChannel, string>>>({})

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">开放收徒</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">我愿意公开帮助后来者</p>
                <p className="text-[11px] text-muted-foreground">开启后你会出现在「找引路人」列表里</p>
              </div>
              <Switch
                checked={settings.open}
                onCheckedChange={(open) => setSettings((prev) => ({ ...prev, open }))}
              />
            </div>
            {settings.open && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                已开放，DEMO 阶段不会真的出现在列表里。
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">我能带的专业课</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_TOPICS.map((topic) => (
                <Chip
                  key={topic.id}
                  active={settings.topicIds.includes(topic.id)}
                  onClick={() => setSettings((prev) => ({ ...prev, topicIds: toggle(prev.topicIds, topic.id) }))}
                >
                  <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(topicIndexOf(topic.id)))}>
                    {topic.short}
                  </span>
                  {topic.name}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">我能提供的帮助</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {HELP_KINDS.map((kind) => (
                <Chip
                  key={kind}
                  active={settings.helps.includes(kind)}
                  onClick={() => setSettings((prev) => ({ ...prev, helps: toggle(prev.helps, kind) }))}
                >
                  {kind}
                </Chip>
              ))}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">期望回报</p>
              <div className="flex flex-wrap gap-1.5">
                {REWARD_KINDS.map((reward: RewardKind) => (
                  <Chip
                    key={reward}
                    active={settings.reward === reward}
                    onClick={() => setSettings((prev) => ({ ...prev, reward }))}
                  >
                    {reward}
                  </Chip>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">联系方式</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              勾选愿意公开的渠道并填写，演示数据不会被保存或发送。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_CHANNELS.map((channel) => (
                <Chip
                  key={channel}
                  active={settings.channels.includes(channel)}
                  onClick={() => setSettings((prev) => ({ ...prev, channels: toggle(prev.channels, channel) }))}
                >
                  {channel}
                </Chip>
              ))}
            </div>

            {settings.channels.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {settings.channels.map((channel) => (
                  <div key={channel} className="space-y-1.5">
                    <Label htmlFor={`contact-${channel}`} className="text-xs">
                      {channel}
                    </Label>
                    <Input
                      id={`contact-${channel}`}
                      value={contactDrafts[channel] ?? ''}
                      onChange={(event) =>
                        setContactDrafts((prev) => ({ ...prev, [channel]: event.target.value }))
                      }
                      placeholder={`填写你的${channel}`}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">谁可以看到我的联系方式</p>
              {VISIBILITY_OPTIONS.map((option) => {
                const active = settings.visibility === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, visibility: option.key }))}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                    )}
                  >
                    {active ? (
                      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{option.desc}</span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">其他</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">本轮收徒名额</p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((count) => (
                  <Chip
                    key={count}
                    active={settings.slots === count}
                    onClick={() => setSettings((prev) => ({ ...prev, slots: count }))}
                  >
                    {count} 位
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mentor-note" className="text-xs">
                一句话说明（会显示在名片上）
              </Label>
              <Textarea
                id="mentor-note"
                rows={2}
                value={settings.note}
                onChange={(event) => setSettings((prev) => ({ ...prev, note: event.target.value }))}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            别人看到的你
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              我
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">刷题网用户</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {settings.open ? '正在收徒' : '未开放收徒'}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">可带的专业课</p>
            {settings.topicIds.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">未选择</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {settings.topicIds.map((topicId) => (
                  <TopicTag key={topicId} topicId={topicId} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">能提供的帮助</p>
            <div className="flex flex-wrap gap-1">
              {settings.helps.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">未选择</span>
              ) : (
                settings.helps.map((kind) => (
                  <Badge key={kind} variant="outline" className="text-[10px] font-normal">
                    {kind}
                  </Badge>
                ))
              )}
              <Badge variant="secondary" className="border-transparent text-[10px] font-normal">
                {settings.reward}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>收徒名额</span>
              <span className="tabular-nums">0 / {settings.slots}</span>
            </div>
            <Progress value={0} className="h-1.5" />
          </div>

          {settings.note && <p className="text-[11px] leading-relaxed text-muted-foreground">{settings.note}</p>}

          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            {VISIBILITY_OPTIONS.find((option) => option.key === settings.visibility)?.label}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
            <Sparkles className="h-3 w-3" />
            DEMO：设置只在本地生效，不会写入数据库。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function MentorDialog({
  mentor,
  status,
  onClose,
  onSubmit,
}: {
  mentor: Mentor
  status?: MentorshipApplication['status']
  onClose: () => void
  onSubmit: (goal: string, message: string) => void
}) {
  const [mode, setMode] = useState<'profile' | 'apply'>('profile')
  const [goal, setGoal] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const vacant = hasVacancy(mentor)
  const contactVisible = status === 'accepted'

  async function copyContact(channel: ContactChannel, value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // 剪贴板不可用时也给出反馈，避免按钮像没反应
    }
    setCopied(channel)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {mentor.nickname}
            <Badge
              variant="secondary"
              className={cn('border-transparent text-[10px] font-normal', TIER_CLASS[mentor.schoolTier])}
            >
              {mentor.schoolTier}
            </Badge>
            {mentor.online && (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                在线
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {mentor.school} · {mentor.major} · {mentor.enrollYear} · {mentor.score}
          </DialogDescription>
        </DialogHeader>

        {mode === 'profile' ? (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-foreground/85">{mentor.intro}</p>

            <div className="flex flex-wrap gap-1.5">
              {mentor.topicIds.map((topicId) => (
                <TopicTag key={topicId} topicId={topicId} />
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {mentor.helps.map((help) => (
                <Badge key={help} variant="outline" className="text-[10px] font-normal">
                  {help}
                </Badge>
              ))}
              <Badge variant="secondary" className="border-transparent text-[10px] font-normal">
                期望回报：{mentor.reward}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: '评分', value: mentor.rating.toFixed(1) },
                { label: '带过', value: `${mentor.menteeCount} 人` },
                { label: '平均响应', value: `${mentor.responseHours} 小时` },
                { label: '剩余名额', value: `${mentor.slots.total - mentor.slots.used} 位` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-2.5">
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                {contactVisible ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                联系方式
              </p>
              <div className="space-y-1.5">
                {mentor.contacts.map((contact) => (
                  <div
                    key={contact.channel}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs',
                      contactVisible ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-muted',
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">{contact.channel}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {contactVisible ? contact.value : maskContact(contact.value)}
                    </span>
                    {contactVisible ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 shrink-0 px-2 text-[11px]"
                        onClick={() => copyContact(contact.channel, contact.value)}
                      >
                        {copied === contact.channel ? (
                          <Check className="mr-1 h-3 w-3" />
                        ) : (
                          <Copy className="mr-1 h-3 w-3" />
                        )}
                        {copied === contact.channel ? '已复制' : '复制'}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">拜师通过后可见</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {contactVisible ? (
                <Badge variant="secondary" className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <MessageCircle className="mr-1 h-3 w-3" />
                  已结对，可直接联系
                </Badge>
              ) : status === 'pending' ? (
                <Badge variant="secondary" className={cn('border-transparent', APPLICATION_STATUS_META.pending.className)}>
                  申请已提交，等待对方确认
                </Badge>
              ) : status === 'rejected' ? (
                <Badge variant="secondary" className={cn('border-transparent', APPLICATION_STATUS_META.rejected.className)}>
                  对方名额已满，可换一位
                </Badge>
              ) : (
                <Button size="sm" disabled={!vacant} onClick={() => setMode('apply')}>
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                  {vacant ? '申请拜师' : '名额已满'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onClose}>
                关闭
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
              申请会连同你的目标与进度一起发给 {mentor.nickname}，对方同意后即可看到 TA 的联系方式并开始结对。
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-goal" className="text-xs">
                我的目标与当前进度
              </Label>
              <Input
                id="apply-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="例如：目标 985，数据结构自测 42/70"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-message" className="text-xs">
                想请教的问题
              </Label>
              <Textarea
                id="apply-message"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="说明你卡在哪一步、每周能投入多少时间，越具体越容易被接受。"
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onSubmit(goal, message)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                提交申请
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('profile')}>
                返回
              </Button>
              <span className="text-[11px] text-muted-foreground">DEMO 只在本地记录，不会真的发送。</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function Component() {
  const [applications, setApplications] = useState<MentorshipApplication[]>(MY_APPLICATIONS)
  const [selected, setSelected] = useState<Mentor | null>(null)

  function statusOf(mentorId: string) {
    return applications.find((item) => item.mentorId === mentorId)?.status
  }

  function handleSubmit(goal: string, message: string) {
    if (!selected) return
    if (statusOf(selected.id)) {
      setSelected(null)
      return
    }
    setApplications((prev) => [
      {
        id: `app-${selected.id}-${prev.length + 1}`,
        mentorId: selected.id,
        status: 'pending',
        createdAt: '2026-09-11',
        message: message.trim() || '（未填写）',
        goal: goal.trim() || '（未填写）',
      },
      ...prev,
    ])
    setSelected(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" />
          引路人
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          找到愿意公开联系方式的往届学长学姐，拜师结对、请教择校与专业课问题；等你上岸后，也可以回来把联系方式开放给后来的人。
        </p>
      </div>

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse">
            <UsersRound className="mr-1.5 h-3.5 w-3.5" />
            找引路人
          </TabsTrigger>
          <TabsTrigger value="mine">
            <HeartHandshake className="mr-1.5 h-3.5 w-3.5" />
            我的师门
          </TabsTrigger>
          <TabsTrigger value="become">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            我也要带人
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <MentorBrowser statusOf={statusOf} onOpen={setSelected} />
        </TabsContent>

        <TabsContent value="mine">
          <MyMentorship
            applications={applications}
            onOpen={setSelected}
            onWithdraw={(applicationId) =>
              setApplications((prev) => prev.filter((item) => item.id !== applicationId))
            }
          />
        </TabsContent>

        <TabsContent value="become">
          <BecomeMentor />
        </TabsContent>
      </Tabs>

      {selected && (
        <MentorDialog
          key={selected.id}
          mentor={selected}
          status={statusOf(selected.id)}
          onClose={() => setSelected(null)}
          onSubmit={handleSubmit}
        />
      )}

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Star className="h-3 w-3" />
        引路人均为自愿开放联系方式的用户，平台不参与收费撮合；DEMO 数据中的联系方式均为虚构示例。
      </p>
    </div>
  )
}
