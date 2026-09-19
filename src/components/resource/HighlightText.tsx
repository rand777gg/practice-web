import type { ReactNode } from 'react'

/**
 * 把命中关键词的片段标出来。
 *
 * 这里用朴素子串匹配, 与数据库侧的匹配语义完全一致: 库里存的是"逐字加空格"的
 * search_text 专供 GIN 索引, 匹配结果等价于原串的 substring —— 所以检索返回的每条
 * 命中都能在这里高亮出来, 不会出现"搜到了却看不到在哪"的情况。
 */
export function HighlightText({ text, query, className }: { text: string; query: string; className?: string }) {
  const needle = query.trim().toLowerCase()
  if (!needle) return <>{text}</>

  const haystack = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  let key = 0
  let idx = haystack.indexOf(needle)

  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx))
    parts.push(
      <mark key={key++} className={className ?? 'rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30'}>
        {text.slice(idx, idx + needle.length)}
      </mark>,
    )
    from = idx + needle.length
    idx = haystack.indexOf(needle, from)
  }

  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}
