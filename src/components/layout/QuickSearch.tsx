import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Clock, CornerDownLeft, LibraryBig, Pencil, RotateCcw, Route, Settings, Sparkles, Star,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { useQuickSearchStore } from '@/stores/quick-search-store'
import { useAssistantStore } from '@/stores/assistant-store'
import { getRecentVisits } from '@/hooks/use-recent-visits'
import { useT } from '@/i18n/use-t'
import { useNavGroups } from './nav-data'

interface SearchPage {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  group: string
  /** 额外的匹配词: 路径、英文别名等 */
  keywords: string
}

/** 前缀指令: 学 CF 那套 `ask:` / `练习:` 的写法 */
interface Prefix {
  key: string
  aliases: string[]
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  url?: string
}

const PREFIXES: Prefix[] = [
  { key: 'ask', aliases: ['ai', 'q'], labelKey: 'nav.assistant', icon: Sparkles },
  { key: '练习', aliases: ['practice'], labelKey: 'nav.practice', icon: Pencil, url: '/practice' },
  { key: '考试', aliases: ['exam'], labelKey: 'nav.examSetup', icon: Clock, url: '/exam' },
  { key: '错题', aliases: ['review', 'wrong'], labelKey: 'nav.wrongReview', icon: RotateCcw, url: '/review' },
  { key: '收藏', aliases: ['favorites', 'star'], labelKey: 'nav.favorites', icon: Star, url: '/favorites' },
  { key: '笔记', aliases: ['notes'], labelKey: 'nav.publicNotes', icon: BookOpen, url: '/notes' },
  { key: '资料', aliases: ['resource'], labelKey: 'nav.resourceLibrary', icon: LibraryBig, url: '/resource-library' },
  { key: '路线', aliases: ['route'], labelKey: 'nav.learningRoutes', icon: Route, url: '/learning-routes' },
]

/** 子序列模糊匹配: 子串命中优先, 否则按字序命中并给连续命中加分 */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct !== -1) return 1000 - direct
  let cursor = 0
  let score = 0
  let streak = 0
  for (const ch of q) {
    const at = t.indexOf(ch, cursor)
    if (at === -1) return null
    streak = at === cursor ? streak + 1 : 0
    score += 1 + streak
    cursor = at + 1
  }
  return score
}

function bestScore(query: string, page: SearchPage): number | null {
  const scores = [page.title, page.keywords].map((text) => fuzzyScore(query, text)).filter((s): s is number => s !== null)
  return scores.length ? Math.max(...scores) : null
}

/** `练习: 树` 这种前缀写法; 不认识的词带冒号就当普通查询 */
function parseQuery(raw: string) {
  const m = /^([^\s:：]{1,6})\s*[:：]\s*(.*)$/.exec(raw.trim())
  if (!m) return { prefix: null as Prefix | null, term: raw.trim() }
  const prefix = PREFIXES.find((p) => p.key === m[1] || p.aliases.includes(m[1].toLowerCase())) ?? null
  return prefix ? { prefix, term: m[2].trim() } : { prefix: null, term: raw.trim() }
}

export function QuickSearch() {
  const { t } = useT()
  const open = useQuickSearchStore((s) => s.open)
  const setOpen = useQuickSearchStore((s) => s.setOpen)
  const setAssistantOpen = useAssistantStore((s) => s.setOpen)
  const navigate = useNavigate()
  const groups = useNavGroups()

  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(getRecentVisits)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useQuickSearchStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 每次打开都重读一次最近访问, 并清掉上次的输入
  useEffect(() => {
    if (!open) return
    setRecent(getRecentVisits())
    setQuery('')
  }, [open])

  const pages = useMemo<SearchPage[]>(() => {
    const list: SearchPage[] = []
    const labels: Record<string, string> = {
      learn: t('nav.groupLearn'),
      smart: t('nav.groupSmart'),
      community: t('nav.groupCommunity'),
      admin: t('nav.admin'),
    }
    for (const [group, items] of Object.entries(groups)) {
      for (const item of items) {
        list.push({ title: item.title, url: item.url, icon: item.icon, group: labels[group] ?? group, keywords: item.url })
        for (const sub of item.items ?? []) {
          list.push({ title: sub.title, url: sub.url, icon: sub.icon ?? item.icon, group: item.title, keywords: sub.url })
        }
      }
    }
    list.push({ title: t('settings.title'), url: '/settings', icon: Settings, group: labels.learn, keywords: '/settings' })
    return list
  }, [groups, t])

  const { prefix, term } = parseQuery(query)
  const results = useMemo(() => {
    if (!term) return []
    return pages
      .map((page) => ({ page, score: bestScore(term, page) }))
      .filter((x): x is { page: SearchPage; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.page)
  }, [pages, term])

  const go = (url: string) => {
    setOpen(false)
    navigate(url)
  }

  const askAI = (text: string) => {
    setOpen(false)
    setAssistantOpen(true)
    if (text) useAssistantStore.getState().setPendingInput?.(text)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-xl"
      title={t('quickSearch.title')}
      description={t('quickSearch.placeholder')}
    >
      <CommandInput placeholder={t('quickSearch.placeholder')} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {prefix && prefix.url ? (
            <button type="button" className="text-sm" onClick={() => go(prefix.url!)}>
              {t(prefix.labelKey)} <ArrowRight className="inline size-3.5" />
            </button>
          ) : (
            t('quickSearch.empty')
          )}
        </CommandEmpty>

        {!term && recent.length > 0 && (
          <CommandGroup heading={t('quickSearch.recent')}>
            {recent.map((visit) => (
              <CommandItem key={visit.url} value={`recent:${visit.url}`} onSelect={() => go(visit.url)}>
                <Clock />
                <span>{visit.title}</span>
                <ArrowRight className="ml-auto opacity-50" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!term && (
          <CommandGroup heading={t('quickSearch.hints')}>
            {PREFIXES.map((p) => (
              <CommandItem
                key={p.key}
                value={`hint:${p.key}`}
                onSelect={() => (p.key === 'ask' ? askAI('') : setQuery(`${p.key}: `))}
              >
                <p.icon />
                <span className="font-medium">{p.key}:</span>
                <span className="text-muted-foreground">— {t(p.labelKey)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && results.length > 0 && (
          <CommandGroup heading={t('quickSearch.pages')}>
            {results.map((page) => (
              <CommandItem key={`${page.url}-${page.title}`} value={`page:${page.url}-${page.title}`} onSelect={() => go(page.url)}>
                <page.icon />
                <span>{page.title}</span>
                <span className="text-muted-foreground">— {page.group}</span>
                <ArrowRight className="ml-auto opacity-50" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {term && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('quickSearch.askGroup')}>
              <CommandItem value={`ask:${term}`} onSelect={() => askAI(term)}>
                <Sparkles />
                <span>{t('nav.assistant')}</span>
                <span className="text-muted-foreground">— “{term}”</span>
                <ArrowRight className="ml-auto opacity-50" />
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {t('quickSearch.navHint')}
        </span>
        <span className="flex items-center gap-1">
          <Kbd><CornerDownLeft /></Kbd>
          {t('quickSearch.selectHint')}
        </span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </div>
    </CommandDialog>
  )
}
