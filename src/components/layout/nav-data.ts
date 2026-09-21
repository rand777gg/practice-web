import { useLocation } from 'react-router-dom'
import {
  Award, Blocks, BookOpen, Bot, CalendarClock, ChartPie, ClipboardList, Clock, Compass, Database,
  FileDown, FileQuestion, FileText, FileWarning, Bookmark, GitMerge, GraduationCap, HardDrive, History,
  LayoutGrid, LayoutTemplate, Library, LibraryBig, List, PenLine, Pencil, Plug, Plus,
  Puzzle, RotateCcw, Route, Settings2, Sparkles, Star, Swords, Terminal, Trophy, Users, UsersRound, Wand2,
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

export interface Crumb {
  title: string
  url?: string
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
 * 面包屑: 优先用侧边栏条目, 子项带上它所属的一级入口作为父级。
 * 详情页(如 /learning-routes/:id)按最长前缀命中一级入口, 只显示入口名。
 */
export function usePageCrumbs(): Crumb[] {
  const { pathname } = useLocation()
  const groups = useNavGroups()
  const { t } = useT()

  const flat: (Crumb & { parent?: Crumb })[] = []
  for (const group of Object.values(groups)) {
    for (const item of group) {
      flat.push({ title: item.title, url: item.url })
      for (const sub of item.items ?? []) {
        flat.push({ title: sub.title, url: sub.url, parent: { title: item.title, url: item.url } })
      }
    }
  }
  // 侧边栏里没有、但同样要显示标题的页面
  flat.push({ title: t('settings.title'), url: '/settings' })

  const hit = flat
    .filter((c) => c.url && isPathActive(pathname, c.url))
    .sort((a, b) => (b.url?.length ?? 0) - (a.url?.length ?? 0))[0]

  if (!hit) return []
  // 父级与当前项同一个地址(如 /practice 的父项就是它自己)时不再重复显示
  if (hit.parent && hit.parent.url !== hit.url) {
    return [{ title: hit.parent.title, url: hit.parent.url }, { title: hit.title }]
  }
  return [{ title: hit.title }]
}
