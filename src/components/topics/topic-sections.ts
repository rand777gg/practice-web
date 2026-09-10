import type { ComponentType } from 'react'
import { BookOpen, FileText, Footprints, ListChecks } from 'lucide-react'

export type TopicSectionKey = 'intro' | 'question-bank' | 'literature' | 'legacy'

type IconComponent = ComponentType<{ className?: string }>

/** 专题详情页内的四个板块，URL 由 topicSectionUrl 按当前专题拼接 */
export const TOPIC_SECTIONS: { key: TopicSectionKey; title: string; icon: IconComponent }[] = [
  { key: 'intro', title: '专业课介绍', icon: BookOpen },
  { key: 'question-bank', title: '关联题库', icon: ListChecks },
  { key: 'literature', title: '原始文献', icon: FileText },
  { key: 'legacy', title: '前辈足迹', icon: Footprints },
]

/** /topics 下被占用的静态段，避免被当成专题 id */
const RESERVED_SEGMENTS = new Set(['ranking'])

export function topicSectionUrl(topicId: string, key: TopicSectionKey): string {
  return key === 'intro' ? `/topics/${topicId}` : `/topics/${topicId}/${key}`
}

/** 当前路径落在哪个板块；不是专题详情页时返回 null */
export function sectionKeyOf(pathname: string): TopicSectionKey | null {
  const matched = /^\/topics\/([^/]+)(?:\/([^/]+))?$/.exec(pathname)
  if (!matched) return null
  const [, topicId, segment] = matched
  if (RESERVED_SEGMENTS.has(topicId)) return null
  if (!segment) return 'intro'
  if (segment === 'question-bank' || segment === 'literature' || segment === 'legacy') return segment
  return null
}

/** 当前路径对应的专题 id；不是专题详情页时返回 null */
export function topicIdOf(pathname: string): string | null {
  const matched = /^\/topics\/([^/]+)(?:\/(?:question-bank|literature|legacy))?$/.exec(pathname)
  if (!matched) return null
  return RESERVED_SEGMENTS.has(matched[1]) ? null : matched[1]
}

const TOPIC_ACCENTS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
]

/**
 * 专业课数量不设上限，用「字母缩写 + 循环配色」代替图标，
 * 新增专业课不需要再去找对应图标。
 */
export function topicAccent(index: number): string {
  return TOPIC_ACCENTS[index % TOPIC_ACCENTS.length]
}
