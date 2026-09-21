import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { useSettingsStore } from '@/stores/settings-store'
import type { SidebarGroup as SidebarNavGroup } from '@/lib/nav-order'
import { cn } from '@/lib/utils'
import { applyOrder, isPathActive, pickActiveSub, type NavItem, type Tone } from './nav-data'

const toneClass: Record<Tone, string> = {
  beta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  test: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  enhance: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  demo: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  rc: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  alpha: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

const collapsibleAnim =
  'overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up'

function SubBadge({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn('shrink-0 px-1 py-0 text-[9px] leading-none', toneClass[tone], className)}
    >
      {label}
    </Badge>
  )
}

/**
 * 有二级入口的分组行: 整行就是折叠开关, 箭头在行尾。
 * 不按当前路由强制展开 —— 收展完全交给用户 (点进去后也保持收起状态)。
 */
function CollapsibleNavItem({ item, activeSub }: { item: NavItem; activeSub: string | null }) {
  const within = activeSub !== null
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={within}>
            <item.icon />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.tone && item.label && <SubBadge tone={item.tone} label={item.label} />}
            <ChevronRight className="ml-1 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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

export function NavGroup({ items, group, label }: { items: NavItem[]; group: SidebarNavGroup; label: string }) {
  const { pathname } = useLocation()
  const sidebarOrder = useSettingsStore((s) => s.sidebarOrder)
  const ordered = applyOrder(items, sidebarOrder[group])

  if (!ordered.length) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {ordered.map((item) =>
            item.items?.length ? (
              <CollapsibleNavItem
                key={item.title}
                item={item}
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
                  <SidebarMenuBadge className={cn('text-[9px] font-semibold', toneClass[item.tone])}>
                    {item.label}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
