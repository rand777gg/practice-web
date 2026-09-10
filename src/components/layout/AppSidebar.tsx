import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Award, Bookmark, BookOpen, Bot, Bug, CalendarClock, ChartPie, ChevronRight, ClipboardList,
  Clock, Compass, Database, FileDown, FileQuestion, FileText, FileWarning, GitMerge,
  GraduationCap, HardDrive, HeartHandshake, History, LayoutDashboard, LayoutGrid, LayoutTemplate,
  Library, List, PenLine, Pencil, Plus, RotateCcw, Route, Settings2, Sparkles, Star, Swords,
  Terminal, Trophy, Users, UsersRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { BrandLogo } from "./BrandLogo"
import { SidebarAccountMenu } from "./SidebarAccountMenu"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { SidebarGroup as SidebarNavGroup } from "@/lib/nav-order"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

type Tone = "beta" | "test" | "enhance" | "demo" | "rc"

const toneClass: Record<Tone, string> = {
  beta: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  test: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  enhance: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  demo: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  rc: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
}

const collapsibleAnim =
  "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"

interface NavSubItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: Tone
  label?: string
}

interface NavItem {
  /** 与 settings 里"侧边栏顺序"一一对应的稳定标识 */
  id: string
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  tone?: Tone
  label?: string
  items?: NavSubItem[]
}

/** 按用户自定义顺序排序: 未出现在顺序表里的新入口排在末尾 */
function applyOrder(items: NavItem[], order: string[] | undefined): NavItem[] {
  if (!order?.length) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
}

function isPathActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`)
}

/** 同级子项只高亮最长匹配的那个: 否则 /exam 会同时命中 /exam/templates */
function pickActiveSub(pathname: string, urls: string[]) {
  let best: string | null = null
  for (const url of urls) {
    if (!isPathActive(pathname, url)) continue
    if (best === null || url.length > best.length) best = url
  }
  return best
}

function SubBadge({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("mr-1 shrink-0 px-1 py-0 text-[9px] leading-none", toneClass[tone], className)}
    >
      {label}
    </Badge>
  )
}

function NavMenu({ items, group }: { items: NavItem[]; group: SidebarNavGroup }) {
  const { pathname } = useLocation()
  const sidebarOrder = useSettingsStore((s) => s.sidebarOrder)
  const ordered = applyOrder(items, sidebarOrder[group])

  return (
    <SidebarMenu>
      {ordered.map((item) =>
        item.items?.length ? (
          <CollapsibleNavItem
            key={item.title}
            item={item}
            pathname={pathname}
            activeSub={pickActiveSub(pathname, item.items.map((sub) => sub.url))}
          />
        ) : (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild tooltip={item.title} isActive={isPathActive(pathname, item.url)}>
              <Link to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
            {item.tone && item.label && (
              <SidebarMenuBadge className={cn("text-[9px] font-semibold", toneClass[item.tone])}>
                {item.label}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  )
}

/** 收起为图标时点一下直接弹出二级菜单, 不用先展开侧边栏 */
function CollapsedFlyout({ item, pathname, activeSub }: { item: NavItem; pathname: string; activeSub: string | null }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton isActive={activeSub !== null}>
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-52 rounded-lg border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-lg"
      >
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="text-[11px] font-medium text-sidebar-foreground/50">{item.title}</span>
          {item.tone && item.label && <SubBadge tone={item.tone} label={item.label} />}
        </div>
        {item.items?.map((sub) => (
          <Link
            key={sub.title}
            to={sub.url}
            onClick={() => setOpen(false)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              isPathActive(pathname, sub.url) && sub.url === activeSub
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {sub.icon && <sub.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
            <span className="truncate">{sub.title}</span>
            {sub.tone && sub.label && <SubBadge tone={sub.tone} label={sub.label} />}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function CollapsibleNavItem({
  item,
  pathname,
  activeSub,
}: {
  item: NavItem
  pathname: string
  activeSub: string | null
}) {
  const { state, isMobile } = useSidebar()
  const within = activeSub !== null
  const [open, setOpen] = React.useState(false)
  const expanded = open || within

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <CollapsedFlyout item={item} pathname={pathname} activeSub={activeSub} />
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible asChild open={expanded} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={within}>
            <item.icon />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.tone && item.label && (
              <SubBadge tone={item.tone} label={item.label} className="group-data-[collapsible=icon]:hidden" />
            )}
            <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className={collapsibleAnim}>
          <SidebarMenuSub>
            {item.items?.map((sub) => (
              <SidebarMenuSubItem key={sub.title}>
                <SidebarMenuSubButton asChild isActive={sub.url === activeSub}>
                  <Link to={sub.url}>
                    {/* SidebarMenuSubButton 带 [&>svg]:size-4, 这里用 important 压到 3.5 与 h-7 行高更协调 */}
                    {sub.icon && <sub.icon className="!h-3.5 !w-3.5 shrink-0 opacity-70" />}
                    <span className="truncate">{sub.title}</span>
                    {sub.tone && sub.label && <SubBadge tone={sub.tone} label={sub.label} />}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarBrand() {
  const { t } = useT()

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild tooltip={t("app.shortTitle")}>
            <Link to="/">
              <span className="flex size-8 shrink-0 items-center justify-center">
                <BrandLogo size={28} />
              </span>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{t("app.shortTitle")}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{t("app.title")}</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === "admin"
  const { t } = useT()

  const learnItems: NavItem[] = [
    { id: "dashboard", title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { id: "dataCenter", title: t("nav.dataCenter"), url: "/data-center", icon: ChartPie },
    {
      id: "practice",
      title: t("nav.sectionPractice"),
      url: "/practice",
      icon: Pencil,
      items: [
        { title: t("nav.practice"), url: "/practice", icon: PenLine },
        { title: t("nav.wrongReview"), url: "/review", icon: RotateCcw },
        { title: t("nav.favorites"), url: "/favorites", icon: Star },
        { title: t("nav.exportQuestions"), url: "/export", icon: FileDown, tone: "demo", label: t("nav.demo") },
      ],
    },
    {
      id: "exam",
      title: t("nav.exam"),
      url: "/exam",
      icon: Clock,
      tone: "enhance",
      label: t("nav.enhance"),
      items: [
        { title: t("nav.examSetup"), url: "/exam", icon: Settings2 },
        { title: t("nav.examAppointment"), url: "/exam/appointment", icon: CalendarClock },
        { title: t("nav.examHistory"), url: "/exam/history", icon: History },
        { title: t("nav.examExport"), url: "/exam/export", icon: FileDown },
      ],
    },
    {
      id: "questionBank",
      title: t("nav.sectionQuestionBank"),
      url: "/question-bank",
      icon: Library,
      items: [
        { title: t("nav.questionBank"), url: "/question-bank", icon: Database, tone: "enhance", label: t("nav.enhance") },
        { title: t("nav.myBank"), url: "/my-bank", icon: HardDrive, tone: "demo", label: t("nav.demo") },
        { title: t("nav.localJudge"), url: "/judge-local", icon: Terminal, tone: "beta", label: t("nav.beta") },
      ],
    },
    {
      id: "templates",
      title: t("nav.sectionTemplates"),
      url: "/templates",
      icon: LayoutTemplate,
      items: [
        { title: t("nav.templateExam"), url: "/templates/exam", icon: FileText },
        { title: t("nav.templateWrong"), url: "/templates/wrong", icon: FileWarning },
        { title: t("nav.templateFavorite"), url: "/templates/favorite", icon: Bookmark },
        { title: t("nav.templateAnswerSheet"), url: "/templates/answer-sheet", icon: ClipboardList },
      ],
    },
    {
      id: "topics",
      title: t("nav.sectionTopics"),
      url: "/topics",
      icon: Compass,
      tone: "demo",
      label: t("nav.demo"),
      items: [
        { title: t("nav.topicsOverview"), url: "/topics", icon: LayoutGrid },
        { title: t("nav.topicsRanking"), url: "/topics/ranking", icon: Trophy },
      ],
    },
    { id: "learningRoutes", title: t("nav.learningRoutes"), url: "/learning-routes", icon: Route, tone: "beta", label: t("nav.beta") },
    { id: "notes", title: t("nav.publicNotes"), url: "/notes", icon: BookOpen },
    { id: "studyRooms", title: t("nav.studyRooms"), url: "/study-rooms", icon: UsersRound, tone: "rc", label: t("nav.rc") },
  ]

  const smartItems: NavItem[] = [
    { id: "assistant", title: t("nav.assistant"), url: "/assistant", icon: Sparkles, tone: "demo", label: t("nav.demo") },
    { id: "aiSettings", title: t("nav.aiSettings"), url: "/ai", icon: Bot, tone: "beta", label: t("nav.beta") },
  ]

  const communityItems: NavItem[] = [
    {
      id: "community",
      title: t("nav.sectionCommunity"),
      url: "/arena",
      icon: HeartHandshake,
      tone: "demo",
      label: t("nav.demo"),
      items: [
        { title: t("nav.arena"), url: "/arena", icon: Swords },
        { title: t("nav.achievements"), url: "/achievements", icon: Award },
        { title: t("nav.mentors"), url: "/mentors", icon: GraduationCap },
        { title: t("nav.feedback"), url: "/feedback", icon: Bug },
      ],
    },
  ]

  const adminItems: NavItem[] = [
    {
      id: "adminQuestions",
      title: t("nav.questions"),
      url: "/admin/questions",
      icon: FileQuestion,
      items: [
        { title: t("nav.questionList"), url: "/admin/questions", icon: List },
        { title: t("nav.newQuestion"), url: "/admin/questions/new", icon: Plus },
        { title: t("nav.duplicates"), url: "/admin/duplicates", icon: GitMerge },
      ],
    },
    { id: "adminLearningRoutes", title: t("nav.learningRoutes"), url: "/admin/learning-routes", icon: Route, tone: "beta", label: t("nav.beta") },
    { id: "adminCrawler", title: t("nav.crawler"), url: "/admin/crawler", icon: Bot, tone: "demo", label: t("nav.demo") },
    { id: "adminOrganizeExam", title: t("nav.organizeExam"), url: "/admin/organize-exam", icon: CalendarClock, tone: "demo", label: t("nav.demo") },
    { id: "adminUsers", title: t("nav.users"), url: "/admin/users", icon: Users, tone: "test", label: t("nav.test") },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupLearn")}</SidebarGroupLabel>
          <NavMenu items={learnItems} group="learn" />
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupSmart")}</SidebarGroupLabel>
          <NavMenu items={smartItems} group="smart" />
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupCommunity")}</SidebarGroupLabel>
          <NavMenu items={communityItems} group="community" />
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
            <NavMenu items={adminItems} group="admin" />
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarAccountMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
