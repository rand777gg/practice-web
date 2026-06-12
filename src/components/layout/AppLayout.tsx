import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileBottomNav } from './MobileBottomNav'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { useSettingsStore } from '@/stores/settings-store'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const handleToggle = useCallback(() => {
    const s = useSettingsStore.getState()
    s.setSidebarCollapsed(!s.sidebarCollapsed)
  }, [])

  return (
    <div className="min-h-screen flex">
      <OnlinePresenceTracker />
      <Sidebar className="hidden lg:flex" collapsed={sidebarCollapsed} onToggleCollapse={handleToggle} />
      <Sidebar
        className="flex lg:hidden"
        overlay
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={handleToggle}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 xl:p-6 pb-20 xl:pb-6">
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}
