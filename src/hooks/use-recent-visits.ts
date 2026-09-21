import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePageCrumbs } from '@/components/layout/nav-data'

const KEY = 'recent_visits'
const MAX = 5

export interface RecentVisit {
  url: string
  title: string
}

export function getRecentVisits(): RecentVisit[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentVisit[]
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.url === 'string' && typeof v.title === 'string') : []
  } catch {
    return []
  }
}

function pushRecentVisit(visit: RecentVisit) {
  try {
    const list = [visit, ...getRecentVisits().filter((v) => v.url !== visit.url)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* noop */ }
}

/** 记录访问过的页面, 给快速搜索的「最近访问」用 */
export function useRecordRecentVisit() {
  const { pathname } = useLocation()
  const crumbs = usePageCrumbs()
  const title = crumbs[crumbs.length - 1]?.title ?? ''

  useEffect(() => {
    if (title) pushRecentVisit({ url: pathname, title })
  }, [pathname, title])
}
