import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import {
  BookOpen, ChevronRight, Clock, FileQuestion, LayoutDashboard,
  Library, Pencil, Route, Sparkles, Users, UsersRound,
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
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

type Tone = "beta" | "test" | "enhance"

const toneClass: Record<Tone, string> = {
  beta: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  test: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  enhance: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
}

const collapsibleAnim =
  "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"

interface NavSubItem {
  title: string
  url: string
  tone?: Tone
  label?: string
}

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  tone?: Tone
  label?: string
  items?: NavSubItem[]
}

function isPathActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`)
}

function SubBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("mr-1 shrink-0 px-1 py-0 text-[9px] leading-none", toneClass[tone])}
    >
      {label}
    </Badge>
  )
}

function NavMenu({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()

  return (
    <SidebarMenu>
      {items.map((item) =>
        item.items?.length ? (
          <CollapsibleNavItem key={item.title} item={item} pathname={pathname} />
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
function CollapsedFlyout({ item, pathname }: { item: NavItem; pathname: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton isActive={item.items?.some((sub) => isPathActive(pathname, sub.url))}>
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
        <p className="px-2 py-1.5 text-[11px] font-medium text-sidebar-foreground/50">{item.title}</p>
        {item.items?.map((sub) => (
          <Link
            key={sub.title}
            to={sub.url}
            onClick={() => setOpen(false)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              isPathActive(pathname, sub.url)
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span className="truncate">{sub.title}</span>
            {sub.tone && sub.label && <SubBadge tone={sub.tone} label={sub.label} />}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function CollapsibleNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const { state, isMobile } = useSidebar()
  const within = (item.items ?? []).some((sub) => isPathActive(pathname, sub.url))
  const [open, setOpen] = React.useState(false)
  const expanded = open || within

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <CollapsedFlyout item={item} pathname={pathname} />
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible asChild open={expanded} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={within}>
            <item.icon />
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className={collapsibleAnim}>
          <SidebarMenuSub>
            {item.items?.map((sub) => (
              <SidebarMenuSubItem key={sub.title}>
                <SidebarMenuSubButton asChild isActive={isPathActive(pathname, sub.url)}>
                  <Link to={sub.url}>
                    <span>{sub.title}</span>
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
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    {
      title: t("nav.sectionPractice"),
      url: "/practice",
      icon: Pencil,
      items: [
        { title: t("nav.practice"), url: "/practice" },
        { title: t("nav.wrongReview"), url: "/review" },
        { title: t("nav.favorites"), url: "/favorites" },
      ],
    },
    {
      title: t("nav.sectionExam"),
      url: "/exam",
      icon: Clock,
      items: [
        { title: t("nav.exam"), url: "/exam", tone: "enhance", label: t("nav.enhance") },
        { title: t("nav.templateCanvas"), url: "/exam/templates" },
      ],
    },
    {
      title: t("nav.sectionQuestionBank"),
      url: "/question-bank",
      icon: Library,
      items: [
        { title: t("nav.questionBank"), url: "/question-bank", tone: "enhance", label: t("nav.enhance") },
        { title: t("nav.localJudge"), url: "/judge-local", tone: "beta", label: t("nav.beta") },
      ],
    },
    { title: t("nav.learningRoutes"), url: "/learning-routes", icon: Route, tone: "beta", label: t("nav.beta") },
    { title: t("nav.publicNotes"), url: "/notes", icon: BookOpen },
    { title: t("nav.studyRooms"), url: "/study-rooms", icon: UsersRound },
  ]

  const adminItems: NavItem[] = [
    {
      title: t("nav.questions"),
      url: "/admin/questions",
      icon: FileQuestion,
      items: [
        { title: t("nav.questionList"), url: "/admin/questions" },
        { title: t("nav.newQuestion"), url: "/admin/questions/new" },
        { title: t("nav.duplicates"), url: "/admin/duplicates" },
      ],
    },
    { title: t("nav.learningRoutes"), url: "/admin/learning-routes", icon: Route, tone: "beta", label: t("nav.beta") },
    { title: t("nav.users"), url: "/admin/users", icon: Users, tone: "test", label: t("nav.test") },
    { title: t("nav.ai"), url: "/admin/ai", icon: Sparkles, tone: "beta", label: t("nav.beta") },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groupLearn")}</SidebarGroupLabel>
          <NavMenu items={learnItems} />
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
            <NavMenu items={adminItems} />
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarAccountMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
