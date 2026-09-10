import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import {
  BookOpen, ChevronRight, ChevronsUpDown, Clock, FileQuestion, LayoutDashboard,
  Library, LogOut, Pencil, Route, Settings, Sparkles, Users, UsersRound,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { BrandLogo } from "./BrandLogo"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

type Tone = "beta" | "test" | "enhance"

const toneClass: Record<Tone, string> = {
  beta: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  test: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  enhance: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
}

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
      className={cn("ml-auto shrink-0 px-1 py-0 text-[9px] leading-none", toneClass[tone])}
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

function CollapsibleNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const within = (item.items ?? []).some((sub) => isPathActive(pathname, sub.url))
  const [open, setOpen] = React.useState(false)
  const expanded = open || within

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
        <CollapsibleContent>
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

function NavUser() {
  const { isMobile } = useSidebar()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const { t } = useT()

  const email = user?.email ?? ""
  const name = profile?.nickname || email.split("@")[0] || "User"
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings />
                {t("settings.title")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut />
              {t("auth.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AppVersion() {
  const [release, setRelease] = React.useState<{ tag_name: string; html_url: string } | null>(null)

  React.useEffect(() => {
    fetch("https://api.github.com/repos/rand777gg/react-practice-web/releases/latest")
      .then((r) => r.json())
      .then((d) => { if (d?.tag_name) setRelease({ tag_name: d.tag_name, html_url: d.html_url }) })
      .catch(() => {})
  }, [])

  if (!release) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="sm" tooltip={release.tag_name} className="text-sidebar-foreground/60">
          <a href={release.html_url} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>{release.tag_name}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t("app.shortTitle")}>
              <Link to="/">
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <BrandLogo size={20} />
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
        <NavUser />
        <AppVersion />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
