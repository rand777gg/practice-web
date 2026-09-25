import { Check, ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { BrandLogo } from './BrandLogo'
import { EXAM_GOALS, examGoalLabel } from '@/lib/exam-goals'
import { logError } from '@/services/errors'
import { updateProfile } from '@/services/profiles'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'

/** 侧边栏顶部的备考目标切换器 (对应 block 的 TeamSwitcher 槽位) */
export function ExamGoalSwitcher() {
  const { t } = useT()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)

  const goal = profile?.goal_type ?? ''
  const label = examGoalLabel(goal) || t('app.shortTitle')

  const applyGoal = async (next: string) => {
    if (!user || !profile) return
    setProfile({ ...profile, goal_type: next })
    try {
      await updateProfile(user.id, { goal_type: next })
    } catch (e) {
      // 旧代码不看返回值: 写失败就靠下面这次刷新把乐观更新收回去
      logError('ExamGoalSwitcher.applyGoal', e)
    }
    await refreshProfile()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="gap-2.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <BrandLogo size={30} />
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">{label}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{t('app.title')}</span>
              </div>
              <ChevronDown className="ml-auto size-4 opacity-50 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 rounded-lg" align="start" side="bottom" sideOffset={4}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('app.title')}</DropdownMenuLabel>
            {EXAM_GOALS.map((g) => (
              <DropdownMenuItem key={g.value} className="gap-2 p-2" onClick={() => void applyGoal(g.value)}>
                <span className="flex size-6 items-center justify-center rounded-sm border text-[10px]">
                  {g.label.slice(0, 1)}
                </span>
                {g.label}
                {goal === g.value && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
