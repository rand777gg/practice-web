import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AppSidebar } from './AppSidebar'
import { Header } from './Header'
import { MobileBottomNav } from './MobileBottomNav'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { ExamScheduleWatcher } from '@/components/exam/ExamScheduleWatcher'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useSettingsStore } from '@/stores/settings-store'
import { useExamStore } from '@/stores/exam-store'

export function AppLayout() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const examActive = useExamStore((s) => s.session?.status === 'in_progress')

  // ECharts 等组件只监听 window resize，不感知容器变宽变窄；侧边栏开合后补发一次，
  // 否则旧画布宽度会把内容撑出横向滚动条（等开合动画结束再发）
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 320)
    return () => window.clearTimeout(id)
  }, [sidebarCollapsed])

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
      className="min-h-screen min-w-0"
    >
      <OnlinePresenceTracker />
      <ExamScheduleWatcher />
      <AppSidebar />
      <SidebarInset>
        <Header />
        <div className={cn('min-w-0 flex-1 px-4 xl:px-6 pt-4', examActive ? 'pb-4' : 'pb-24 xl:pb-6')}>
          <Outlet />
        </div>
        {!examActive && <MobileBottomNav />}
      </SidebarInset>
    </SidebarProvider>
  )
}
