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

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
      className="min-h-screen"
    >
      <OnlinePresenceTracker />
      <ExamScheduleWatcher />
      <AppSidebar />
      <SidebarInset>
        <Header />
        <div className={cn('flex-1 px-4 xl:px-6 pt-4', examActive ? 'pb-4' : 'pb-24 xl:pb-6')}>
          <Outlet />
        </div>
        {!examActive && <MobileBottomNav />}
      </SidebarInset>
    </SidebarProvider>
  )
}
