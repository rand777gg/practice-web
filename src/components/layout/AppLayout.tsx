import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { NicknameDialog } from './NicknameDialog'
import { useSettingsStore } from '@/stores/settings-store'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleCollapse = useSettingsStore((s) => s.setSidebarCollapsed)
  const handleToggle = () => toggleCollapse(!sidebarCollapsed)

  return (
    <div className="min-h-screen flex">
      <OnlinePresenceTracker />
      <NicknameDialog />
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
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
