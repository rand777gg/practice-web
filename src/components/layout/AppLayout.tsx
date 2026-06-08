import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { NicknameDialog } from './NicknameDialog'

function loadSidebarCollapsed(): boolean {
  return localStorage.getItem('sidebar_collapsed') === 'true'
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev))
      return !prev
    })
  }, [])

  return (
    <div className="min-h-screen flex">
      <OnlinePresenceTracker />
      <NicknameDialog />
      <Sidebar className="hidden lg:flex" collapsed={sidebarCollapsed} onToggleCollapse={toggleCollapse} />
      <Sidebar
        className="flex lg:hidden"
        overlay
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} onToggleCollapse={toggleCollapse} />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
