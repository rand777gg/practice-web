import { useLocation, useSearchParams } from 'react-router-dom'
import {
  Award, Blocks, BookOpen, Bot, CalendarClock, ChartPie, ClipboardList, Clock, Compass, Database,
  FileDown, FileQuestion, FileText, FileWarning, Bookmark, GitMerge, GraduationCap, HardDrive, History,
  LayoutGrid, LayoutTemplate, Library, LibraryBig, List, PenLine, Pencil, Plug, Plus,
  Puzzle, RotateCcw, Route, Settings2, Shuffle, Sparkles, Star, Swords, Terminal, Trophy, Users, UsersRound, Wand2,
} from 'lucide-react'

import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import type { SidebarGroup } from '@/lib/nav-order'

export type Tone = 'beta' | 'test' | 'enhance' | 'demo' | 'rc' | 'alpha'

export interface NavSubItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: Tone
  label?: string
}

export interface NavItem {
  /** 与 settings 里"侧边栏顺序"一一对应的稳定标识 */
  id: string
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  tone?: Tone
  label?: string
  items?: NavSubItem[]
}

export interface CrumbMenuItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  active?: boolean
}

export interface Crumb {
  title: string
  url?: string
  /** 有它就把这一段渲染成下拉 (参考 shadcn breadcrumb 的 dropdown 例子) */
  menu?: CrumbMenuItem[]
}

/** 按用户自定义顺序排序: 未出现在顺序表里的新入口排在末尾 */
export function applyOrder(items: NavItem[], order: string[] | undefined): NavItem[] {
  if (!order?.length) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
}

export function isPathActive(pathname: string, url: string) {
  return url === '/' ? pathname === '/' : pathname === url || pathname.startsWith(`${url}/`)
}

/** 同级子项只高亮最长匹配的那个: 否则 /exam 会同时命中 /exam/templates */
export function pickActiveSub(pathname: string, urls: string[]) {
  let best: string | null = null
  for (const url of urls) {
    if (!isPathActive(pathname, url)) continue
    if (best === null || url.length > best.length) best = url
  }
  return best
}

/** 侧边栏四个分组的数据源: 侧边栏与面包屑共用, 避免两处各写一份 */
export function useNavGroups(): Record<SidebarGroup, NavItem[]> {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { t } = useT()

  const learn: NavItem[] = [
    { id: 'dataCenter', title: t('nav.dataCenter'), url: '/data-center', icon: ChartPie },
    {
      id: 'practice',
      title: t('nav.sectionPractice'),
      url: '/practice',
      icon: Pencil,
      items: [
        { title: t('nav.practice'), url: '/practice', icon: PenLine },
        { title: t('nav.wrongReview'), url: '/review', icon: RotateCcw },
        { title: t('nav.favorites'), url: '/favorites', icon: Star },
        { title: t('nav.exportQuestions'), url: '/export', icon: FileDown, tone: 'demo', label: t('nav.demo') },
      ],
    },
    {
      id: 'exam',
      title: t('nav.exam'),
      url: '/exam',
      icon: Clock,
      tone: 'enhance',
      label: t('nav.enhance'),
      items: [
        { title: t('nav.examSetup'), url: '/exam', icon: Settings2 },
        { title: t('nav.examAppointment'), url: '/exam/appointment', icon: CalendarClock },
        { title: t('nav.examHistory'), url: '/exam/history', icon: History },
        { title: t('nav.examExport'), url: '/exam/export', icon: FileDown },
      ],
    },
    {
      id: 'questionBank',
      title: t('nav.sectionQuestionBank'),
      url: '/question-bank',
      icon: Library,
      items: [
        { title: t('nav.questionBank'), url: '/question-bank', icon: Database, tone: 'enhance', label: t('nav.enhance') },
        { title: t('nav.myBank'), url: '/my-bank', icon: HardDrive, tone: 'demo', label: t('nav.demo') },
        { title: t('nav.localJudge'), url: '/judge-local', icon: Terminal, tone: 'beta', label: t('nav.beta') },
      ],
    },
    {
      id: 'templates',
      title: t('nav.sectionTemplates'),
      url: '/templates',
      icon: LayoutTemplate,
      items: [
        { title: t('nav.templateExam'), url: '/templates/exam', icon: FileText },
        { title: t('nav.templateWrong'), url: '/templates/wrong', icon: FileWarning },
        { title: t('nav.templateFavorite'), url: '/templates/favorite', icon: Bookmark },
        { title: t('nav.templateAnswerSheet'), url: '/templates/answer-sheet', icon: ClipboardList },
      ],
    },
    {
      id: 'topics',
      title: t('nav.sectionTopics'),
      url: '/topics',
      icon: Compass,
      tone: 'demo',
      label: t('nav.demo'),
      items: [
        { title: t('nav.topicsOverview'), url: '/topics', icon: LayoutGrid },
        { title: t('nav.topicsRanking'), url: '/topics/ranking', icon: Trophy },
      ],
    },
    { id: 'notes', title: t('nav.publicNotes'), url: '/notes', icon: BookOpen },
    { id: 'resourceLibrary', title: t('nav.resourceLibrary'), url: '/resource-library', icon: LibraryBig, tone: 'rc', label: t('nav.rc') },
    { id: 'studyRooms', title: t('nav.studyRooms'), url: '/study-rooms', icon: UsersRound },
  ]

  const smart: NavItem[] = [
    { id: 'assistant', title: t('nav.assistant'), url: '/assistant', icon: Sparkles, tone: 'alpha', label: t('nav.alpha') },
    { id: 'aiSettings', title: t('nav.aiSettings'), url: '/ai', icon: Bot, tone: 'beta', label: t('nav.beta') },
    { id: 'skills', title: t('nav.skills'), url: '/skills', icon: Puzzle, tone: 'beta', label: t('nav.beta') },
    { id: 'mcp', title: t('nav.mcp'), url: '/mcp', icon: Plug, tone: 'beta', label: t('nav.beta') },
    { id: 'prompts', title: t('nav.prompts'), url: '/prompts', icon: Wand2, tone: 'beta', label: t('nav.beta') },
    { id: 'plugins', title: t('nav.plugins'), url: '/plugins', icon: Blocks, tone: 'beta', label: t('nav.beta') },
  ]

  const community: NavItem[] = [
    { id: 'arena', title: t('nav.arena'), url: '/arena', icon: Swords },
    { id: 'achievements', title: t('nav.achievements'), url: '/achievements', icon: Award },
    { id: 'mentors', title: t('nav.mentors'), url: '/mentors', icon: GraduationCap },
  ]

  const admin: NavItem[] = [
    {
      id: 'adminQuestions',
      title: t('nav.questions'),
      url: '/admin/questions',
      icon: FileQuestion,
      items: [
        { title: t('nav.questionList'), url: '/admin/questions', icon: List },
        { title: t('nav.newQuestion'), url: '/admin/questions/new', icon: Plus },
        { title: t('nav.duplicates'), url: '/admin/duplicates', icon: GitMerge },
      ],
    },
    { id: 'adminLearningRoutes', title: t('nav.learningRoutes'), url: '/admin/learning-routes', icon: Route, tone: 'beta', label: t('nav.beta') },
    { id: 'adminCrawler', title: t('nav.crawler'), url: '/admin/crawler', icon: Bot, tone: 'demo', label: t('nav.demo') },
    { id: 'adminOrganizeExam', title: t('nav.organizeExam'), url: '/admin/organize-exam', icon: CalendarClock, tone: 'demo', label: t('nav.demo') },
    { id: 'adminUsers', title: t('nav.users'), url: '/admin/users', icon: Users, tone: 'test', label: t('nav.test') },
  ]

  return { learn, smart, community, admin: isAdmin ? admin : [] }
}

/**
 * 面包屑按侧边栏层级走, 每一层都是该层级的兄弟项下拉:
 *   分组 dropdown{学习/智能/社区/管理} › 一级 dropdown{组内入口} › 二级 dropdown{该项的子入口}
 * 练习模式页再多一段, 用来切三种刷题模式。
 * 不在侧边栏里的页面(设置、仪表盘等)退回单段标题。
 */
export function usePageCrumbs(): Crumb[] {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const groups = useNavGroups()
  const { t } = useT()

  const groupLabels: Record<SidebarGroup, string> = {
    learn: t('nav.groupLearn'),
    smart: t('nav.groupSmart'),
    community: t('nav.groupCommunity'),
    admin: t('nav.admin'),
  }
  const visibleGroups = (Object.keys(groups) as SidebarGroup[]).filter((g) => groups[g].length > 0)

  // 定位当前页在侧边栏层级里的位置: 同级取最长匹配(否则 /exam 会抢走 /exam/history)
  let hit: { group: SidebarGroup; item: NavItem; sub?: NavSubItem } | null = null
  let bestLen = -1
  for (const group of visibleGroups) {
    for (const item of groups[group]) {
      if (isPathActive(pathname, item.url) && item.url.length > bestLen) {
        bestLen = item.url.length
        hit = { group, item }
      }
      for (const sub of item.items ?? []) {
        if (isPathActive(pathname, sub.url) && sub.url.length >= bestLen) {
          bestLen = sub.url.length
          hit = { group, item, sub }
        }
      }
    }
  }

  if (hit) {
    const { group, item, sub } = hit
    const crumbs: Crumb[] = [
      {
        title: groupLabels[group],
        menu: visibleGroups.map((g) => ({
          title: groupLabels[g],
          url: groups[g][0].url,
          active: g === group,
        })),
      },
      {
        title: item.title,
        url: item.url,
        menu: groups[group].map((i) => ({
          title: i.title,
          url: i.url,
          icon: i.icon,
          active: i.id === item.id,
        })),
      },
    ]

    if (item.items?.length) {
      const activeSub = sub?.url ?? item.url
      crumbs.push({
        title: sub?.title ?? item.title,
        menu: item.items.map((s) => ({
          title: s.title,
          url: s.url,
          icon: s.icon ?? item.icon,
          active: s.url === activeSub,
        })),
      })
    }

    // 练习页最后一段: seq / random / review
    if (pathname === '/practice') {
      const modes = [
        { key: 'seq', title: t('plan.modeSequential'), icon: PenLine },
        { key: 'random', title: t('plan.modeRandom'), icon: Shuffle },
        { key: 'review', title: t('plan.modeReview'), icon: RotateCcw },
      ]
      const mode = searchParams.get('mode') ?? 'seq'
      const current = modes.find((m) => m.key === mode) ?? modes[0]
      crumbs.push({
        title: current.title,
        menu: modes.map((m) => ({
          title: m.title,
          url: `/practice?mode=${m.key}`,
          icon: m.icon,
          active: m.key === current.key,
        })),
      })
    }

    return crumbs
  }

  // 不在侧边栏分组里的页面: 仪表盘(固定在顶部区) + 设置
  const extras: Crumb[] = [
    { title: t('nav.dashboard'), url: '/' },
    { title: t('settings.title'), url: '/settings' },
  ]
  const extra = extras.filter((c) => isPathActive(pathname, c.url!)).sort((a, b) => b.url!.length - a.url!.length)[0]
  return extra ? [{ title: extra.title }] : []
}

