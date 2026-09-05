import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileBottomNav } from './MobileBottomNav'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { ExamScheduleWatcher } from '@/components/exam/ExamScheduleWatcher'
import { useSettingsStore } from '@/stores/settings-store'
import { useExamStore } from '@/stores/exam-store'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const examActive = useExamStore((s) => s.session?.status === 'in_progress')
  const handleToggle = useCallback(() => {
    const s = useSettingsStore.getState()
    s.setSidebarCollapsed(!s.sidebarCollapsed)
  }, [])

  return (
    <div className="min-h-screen flex">
      <OnlinePresenceTracker />
      <ExamScheduleWatcher />
      <Sidebar className="hidden lg:flex" collapsed={sidebarCollapsed} onToggleCollapse={handleToggle} />
      <Sidebar
        className="flex lg:hidden"
        overlay
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={handleToggle}
      />
      <div className={cn(
        'flex-1 flex flex-col min-w-0 transition-[padding-left] duration-300',
        sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-64',
      )}>
        <Header
          className={sidebarCollapsed ? 'lg:left-14' : 'lg:left-64'}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className={cn('flex-1 px-4 xl:px-6 pt-18 xl:pt-20', examActive ? 'pb-4' : 'pb-24 xl:pb-6')}>
          <Outlet />
        </main>
        {!examActive && <MobileBottomNav />}
      </div>
    </div>
  )
}
