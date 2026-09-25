/**
 * 知识点选择器 —— 从**平台已有的知识点**里挑, 不让模型或用户随手编。
 *
 * 为什么非要这样: 平台的知识点是一套带编号的受控词表(`A01-医学的演变、传播与交融`),
 * 练习进度、知识点筛选、知识点解读全按它走, 而这份词表本身就是从 questions.key_points
 * 按学科聚合出来的(get_question_meta)。模型写的"死锁"/"并发"这类自由文本存进去看着没问题,
 * 但跟任何筛选都对不上 —— 等于没写, 还会让"缺知识点"的统计失真。
 *
 * 学科没有词表时(比如新学科)允许手输一个, 但那必须是用户**明确**的动作, 而不是系统替他编。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'
import { normalizeKeyPoints } from '@/lib/create-spec'
import { cn } from '@/lib/utils'

/** 学科 → 知识点词表; 按学科缓存, 同一学科反复打开不再查库 */
const cache = new Map<string, string[]>()
const listeners = new Set<() => void>()

async function loadKeyPoints(subject: string | null): Promise<string[]> {
  const key = subject ?? ''
  const cached = cache.get(key)
  if (cached) return cached
  // 省略 p_subject 即 SQL 的 DEFAULT NULL（全学科）；生成类型只接受 undefined 表示省略
  const { data, error } = await supabase.rpc('get_question_meta', { p_subject: subject ?? undefined })
  const list = error ? [] : ((data as { key_points?: string[] } | null)?.key_points ?? [])
  cache.set(key, list)
  for (const notify of listeners) notify()
  return list
}

function useKeyPointOptions(subject: string | null): string[] {
  const [, bump] = useState(0)
  useEffect(() => {
    const notify = () => bump((n) => n + 1)
    listeners.add(notify)
    void loadKeyPoints(subject)
    return () => { listeners.delete(notify) }
  }, [subject])
  return subject === null ? cache.get('') ?? [] : cache.get(subject) ?? []
}

interface Props {
  subject: string | null
  value: string[]
  onChange: (next: string[]) => void
  /** 紧凑模式: 用在每道题那一行里 */
  compact?: boolean
  disabled?: boolean
}

export function KeyPointPicker({ subject, value, onChange, compact, disabled }: Props) {
  const options = useKeyPointOptions(subject)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, query])

  const toggle = useCallback((kp: string) => {
    onChange(value.includes(kp) ? value.filter((x) => x !== kp) : normalizeKeyPoints([...value, kp]))
  }, [value, onChange])

  const addDraft = useCallback(() => {
    const kp = draft.trim()
    if (!kp) return
    onChange(normalizeKeyPoints([...value, kp]))
    setDraft('')
  }, [draft, value, onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label="选择知识点"
          className={cn(
            'justify-between gap-1.5 font-normal',
            compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 w-full px-2 text-xs',
          )}
        >
          <span className={cn('flex min-w-0 items-center gap-1', value.length === 0 && 'text-muted-foreground')}>
            {value.length === 0 ? (
              <span className="truncate">选择知识点</span>
            ) : value.length === 1 ? (
              // 只有一个就把名字显示出来 —— 每道题那一行必须一眼看得出挂的是哪个知识点,
              // 只显示"1 个知识点"等于逼用户点开才知道
              <span className="truncate">{value[0]}</span>
            ) : (
              <span className="truncate">{value[0]}<span className="ml-1 opacity-70">+{value.length - 1}</span></span>
            )}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索知识点"
              aria-label="搜索知识点"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {options.length === 0 ? (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground">
              {subject ? `「${subject}」这个学科还没有知识点词表。` : '还没选学科。'}
              可以直接在下面输入一个 —— 它就会成为这个学科的第一个知识点。
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">没有匹配的知识点。</p>
          ) : (
            filtered.map((kp) => {
              const on = value.includes(kp)
              return (
                <button
                  key={kp}
                  type="button"
                  onClick={() => toggle(kp)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent/60"
                >
                  <span className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                  )}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] leading-snug">{kp}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-1 border-t p-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
            placeholder="新增知识点..."
            aria-label="新增知识点"
            className="h-7 flex-1 text-xs"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={addDraft} disabled={!draft.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
          {value.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 shrink-0 text-[11px]" onClick={() => onChange([])}>
              清空
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** 已选知识点的小标签, 点 × 摘掉一个 */
export function KeyPointChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  if (value.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {value.map((kp) => (
        <span key={kp} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[10px]">
          <span className="truncate">{kp}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== kp))}
            aria-label={`移除知识点 ${kp}`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
