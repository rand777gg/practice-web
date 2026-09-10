import { Clock, Eye, Lock, MessageCircle, Star, UserCheck, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { topicAccent } from '@/components/topics/topic-sections'
import {
  TIER_CLASS, hasVacancy, maskContact, type MentorshipApplication, type Mentor,
} from '@/lib/mentors-demo'
import { getDemoTopic, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

interface MentorCardProps {
  mentor: Mentor
  myStatus?: MentorshipApplication['status']
  onOpen: (mentor: Mentor) => void
}

export function MentorCard({ mentor, myStatus, onOpen }: MentorCardProps) {
  const vacant = hasVacancy(mentor)
  const contactVisible = myStatus === 'accepted'
  const firstContact = mentor.contacts[0]

  return (
    <Card className={cn('flex flex-col', mentor.featured && 'ring-1 ring-primary/20')}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {mentor.nickname.slice(0, 1)}
            {mentor.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{mentor.nickname}</span>
              <Badge
                variant="secondary"
                className={cn('shrink-0 border-transparent text-[9px] font-normal', TIER_CLASS[mentor.schoolTier])}
              >
                {mentor.schoolTier}
              </Badge>
              {mentor.featured && (
                <Badge variant="secondary" className="shrink-0 border-transparent bg-primary/10 text-[9px] font-normal text-primary">
                  推荐
                </Badge>
              )}
              {myStatus === 'accepted' && (
                <Badge variant="secondary" className="shrink-0 border-transparent bg-emerald-100 text-[9px] font-normal text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  我的引路人
                </Badge>
              )}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {mentor.school} · {mentor.major}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {mentor.enrollYear} · {mentor.score} · 最近活跃 {mentor.lastActive}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {mentor.topicIds.map((topicId) => {
            const topic = getDemoTopic(topicId)
            return (
              <span
                key={topicId}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  topicAccent(topicIndexOf(topicId)),
                )}
              >
                {topic.short} · {topic.name}
              </span>
            )
          })}
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{mentor.headline}</p>

        <div className="flex flex-wrap gap-1.5">
          {mentor.helps.map((help) => (
            <Badge key={help} variant="outline" className="text-[10px] font-normal">
              {help}
            </Badge>
          ))}
          <Badge variant="secondary" className="border-transparent text-[10px] font-normal">
            {mentor.reward}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-medium tabular-nums text-foreground">{mentor.rating}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="h-3 w-3" />
            带过 {mentor.menteeCount} 人
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            约 {mentor.responseHours} 小时回复
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">收徒名额</span>
            <span className={cn('tabular-nums', vacant ? 'text-foreground' : 'text-muted-foreground')}>
              {mentor.slots.used} / {mentor.slots.total}
            </span>
          </div>
          <Progress value={(mentor.slots.used / mentor.slots.total) * 100} className="h-1.5" />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]',
            contactVisible
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {contactVisible ? <Eye className="h-3 w-3 shrink-0" /> : <Lock className="h-3 w-3 shrink-0" />}
          <span className="truncate">
            {contactVisible
              ? `${firstContact.channel}：${firstContact.value}`
              : `${firstContact.channel}：${maskContact(firstContact.value)}（拜师通过后可见）`}
          </span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-7" onClick={() => onOpen(mentor)}>
            查看主页
          </Button>
          {myStatus === 'accepted' ? (
            <Button size="sm" className="h-7" onClick={() => onOpen(mentor)}>
              <MessageCircle className="mr-1 h-3 w-3" />
              联系 TA
            </Button>
          ) : (
            <Button size="sm" className="h-7" disabled={!vacant} onClick={() => onOpen(mentor)}>
              {vacant ? (
                <>
                  <UserCheck className="mr-1 h-3 w-3" />
                  申请拜师
                </>
              ) : (
                <>
                  <MessageCircle className="mr-1 h-3 w-3" />
                  名额已满
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
