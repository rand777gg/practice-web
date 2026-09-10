import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { bankCountOf, type DemoTopic } from '@/lib/topics-demo'
import { TOPIC_SECTIONS, sectionKeyOf, topicAccent, topicSectionUrl } from './topic-sections'
import { TopicSearchDialog } from './TopicSearchDialog'

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'shrink-0 border-transparent bg-violet-100 px-1.5 py-0 text-[9px] font-semibold leading-4 tracking-wide text-violet-700',
        'dark:bg-violet-900/40 dark:text-violet-300',
        className,
      )}
    >
      DEMO
    </Badge>
  )
}

interface TopicSidebarProps {
  topics: DemoTopic[]
  topic: DemoTopic
}

export function TopicSidebar({ topics, topic }: TopicSidebarProps) {
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const activeSection = sectionKeyOf(pathname)

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-xl border bg-card p-2.5">
        <div className="flex items-center justify-between px-1.5 pb-2">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">全部专业课</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-3 w-3" />
            搜索
          </button>
        </div>
        <nav className="space-y-0.5">
          {topics.map((item, index) => {
            const active = item.id === topic.id
            return (
              <Link
                key={item.id}
                to={topicSectionUrl(item.id, 'intro')}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold',
                    topicAccent(index),
                  )}
                >
                  {item.short}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1 text-[10px] tabular-nums',
                    active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {bankCountOf(item)}
                </span>
              </Link>
            )
          })}
        </nav>
        <div className="mt-1 flex items-center justify-between px-2 py-1.5">
          <Link
            to="/topics"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            返回专题总览
          </Link>
          <span className="text-[10px] text-muted-foreground/70">共 {topics.length} 门</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-2.5">
        <div className="flex items-center justify-between px-1.5 pb-2">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">本专题板块</span>
          <span className="truncate text-[10px] text-muted-foreground/70">{topic.code}</span>
        </div>
        <nav className="space-y-0.5">
          {TOPIC_SECTIONS.map((section) => {
            const Icon = section.icon
            const active = section.key === activeSection
            return (
              <Link
                key={section.key}
                to={topicSectionUrl(topic.id, section.key)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <p className="px-1.5 text-[11px] leading-relaxed text-muted-foreground">
        演示数据，未接入题库与文献数据库。
      </p>

      <TopicSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </aside>
  )
}
