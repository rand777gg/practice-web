import { Link, useLocation } from 'react-router-dom'
import { Bug, Settings } from 'lucide-react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useT } from '@/i18n/use-t'
import { isPathActive } from './nav-data'

/** block 里 NavSecondary 的形态: 底部工具入口, 用 mt-auto 顶到最下面 */
export function NavSecondary(props: React.ComponentProps<typeof SidebarGroup>) {
  const { t } = useT()
  const { pathname } = useLocation()

  const items = [
    { title: t('settings.title'), url: '/settings', icon: Settings },
    { title: t('nav.feedback'), url: '/feedback', icon: Bug },
  ]

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={isPathActive(pathname, item.url)}>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
