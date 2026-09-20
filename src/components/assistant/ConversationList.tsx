/**
 * 小Q 的会话记录列表 —— 新建、搜索、切换、重命名、删除。
 *
 * 按时间分组而不是一条平铺列表: 会话标题是第一句话截出来的, 相邻的几条常常长得很像
 * (「这题的解析…」「这题为什么…」), 没有"今天/昨天"这层分隔就分不清哪条是哪次问的。
 */
import { useMemo, useState } from 'react'
import { Check, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAssistantStore, type ConversationSummary } from '@/stores/assistant-store'
import { cn } from '@/lib/utils'

const GROUP_ORDER = ['今天', '昨天', '7 天内', '更早'] as const

function startOfDay(offsetDays = 0): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - offsetDays)
  return d.getTime()
}

function groupOf(iso: string): (typeof GROUP_ORDER)[number] {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '更早'
  if (t >= startOfDay()) return '今天'
  if (t >= startOfDay(1)) return '昨天'
  if (t >= startOfDay(7)) return '7 天内'
  return '更早'
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const group = groupOf(iso)
  if (group === '今天') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (group === '昨天') return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function Row({ item }: { item: ConversationSummary }) {
  const activeId = useAssistantStore((s) => s.activeId)
  const openConversation = useAssistantStore((s) => s.openConversation)
  const renameConversation = useAssistantStore((s) => s.renameConversation)
  const deleteConversation = useAssistantStore((s) => s.deleteConversation)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== item.title) void renameConversation(item.id, draft)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(item.title); setEditing(false) }
          }}
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={commit} aria-label="保存名称">
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7 shrink-0"
          onClick={() => { setDraft(item.title); setEditing(false) }} aria-label="取消"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-accent',
        activeId === item.id && 'bg-accent',
      )}
    >
      <button
        type="button"
        onClick={() => void openConversation(item.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <span className={cn('min-w-0 flex-1 truncate text-xs', activeId === item.id && 'font-medium')}>
          {item.title}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground group-hover:hidden">
          {timeLabel(item.updated_at)}
        </span>
      </button>
      <div className="hidden shrink-0 items-center group-hover:flex">
        <Button
          size="icon" variant="ghost" className="h-6 w-6"
          onClick={() => { setDraft(item.title); setEditing(true) }} aria-label="重命名"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => {
            // 删会话是不可逆的(外键 cascade 会把整段对话一起带走), 而这个图标就贴在每一行上,
            // 鼠标划过很容易误点 —— 所以必须确认一次
            if (!window.confirm(`删除会话「${item.title}」？\n整段对话都会一起删掉，不能恢复。`)) return
            void deleteConversation(item.id)
          }}
          aria-label="删除会话"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function ConversationList() {
  const conversations = useAssistantStore((s) => s.conversations)
  const conversationsLoaded = useAssistantStore((s) => s.conversationsLoaded)
  const startNewConversation = useAssistantStore((s) => s.startNewConversation)
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations
    const map = new Map<string, ConversationSummary[]>()
    for (const item of hit) {
      const key = groupOf(item.updated_at)
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }))
  }, [conversations, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={startNewConversation}>
          <MessageSquarePlus className="h-3.5 w-3.5" />
          新会话
        </Button>
      </div>

      <div className="relative px-3 py-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {!conversationsLoaded && <p className="px-2 py-3 text-xs text-muted-foreground">正在读取…</p>}
        {conversationsLoaded && grouped.length === 0 && (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            {query ? '没有匹配的会话。' : '还没有会话记录。问我一个问题，这里就会留下记录。'}
          </p>
        )}
        {grouped.map(({ group, items }) => (
          <div key={group} className="space-y-0.5">
            <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{group}</p>
            {items.map((item) => <Row key={item.id} item={item} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
