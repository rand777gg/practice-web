import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Search } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Kbd } from '@/components/ui/kbd'
import { ExamGoalSwitcher } from './ExamGoalSwitcher'
import { NavGroup } from './NavGroup'
import { isPathActive, useNavGroups } from './nav-data'
import { useQuickSearchStore } from '@/stores/quick-search-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'

/** 固定区: 快速搜索(可取消固定) + 仪表盘(常驻)。小Q 已挪到顶栏。 */
function NavFixed() {
  const { t } = useT()
  const { pathname } = useLocation()
  const setSearchOpen = useQuickSearchStore((s) => s.setOpen)
  const pinnedNav = useSettingsStore((s) => s.pinnedNav)

  return (
    <SidebarMenu>
      {pinnedNav.includes('search') && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setSearchOpen(true)}
            tooltip={t('quickSearch.title')}
            className="h-10 border border-sidebar-border bg-sidebar-accent/40 px-2 text-muted-foreground hover:bg-sidebar-accent"
          >
            <Search />
            <span className="truncate">{t('quickSearch.placeholder')}</span>
            <Kbd className="ml-auto">⌘ K</Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={t('nav.dashboard')} isActive={isPathActive(pathname, '/')}>
          <Link to="/">
            <Home />
            <span>{t('nav.dashboard')}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useT()
  const groups = useNavGroups()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <ExamGoalSwitcher />
        <NavFixed />
      </SidebarHeader>
      <SidebarContent>
        <NavGroup items={groups.learn} group="learn" label={t('nav.groupLearn')} />
        <NavGroup items={groups.smart} group="smart" label={t('nav.groupSmart')} />
        <NavGroup items={groups.community} group="community" label={t('nav.groupCommunity')} />
        <NavGroup items={groups.admin} group="admin" label={t('nav.admin')} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
