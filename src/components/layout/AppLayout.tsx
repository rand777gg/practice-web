import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AppSidebar } from './AppSidebar'
import { Header } from './Header'
import { MobileBottomNav } from './MobileBottomNav'
import { OnlinePresenceTracker } from './OnlinePresenceTracker'
import { ExamScheduleWatcher } from '@/components/exam/ExamScheduleWatcher'
import { PlanWatcher } from './PlanWatcher'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { QuickSearch } from './QuickSearch'
import { useRecordRecentVisit } from '@/hooks/use-recent-visits'
import { useAssistantStore } from '@/stores/assistant-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useExamStore } from '@/stores/exam-store'
import { usePromptStore } from '@/stores/prompt-store'
import { usePluginStore } from '@/stores/plugin-store'
import { EyeRestReminder } from '@/components/plugins/EyeRestReminder'

export function AppLayout() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const examActive = useExamStore((s) => s.session?.status === 'in_progress')
  const assistantOpen = useAssistantStore((s) => s.open)
  useRecordRecentVisit()

  // ECharts 等组件只监听 window resize，不感知容器变宽变窄；侧边栏开合后补发一次，
  // 否则旧画布宽度会把内容撑出横向滚动条（等开合动画结束再发）
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 320)
    return () => window.clearTimeout(id)
  }, [sidebarCollapsed])

  // 用户提示词与插件配置进应用后各取一次,之后就靠 getPrompt() / getPlugin() 同步读 —— 调用点都是同步拼参数的
  useEffect(() => {
    void usePromptStore.getState().load()
    void usePluginStore.getState().load()
  }, [])

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
      className="min-h-screen min-w-0"
    >
      <OnlinePresenceTracker />
      <ExamScheduleWatcher />
      <PlanWatcher />
      <EyeRestReminder />
      <AppSidebar />
      {/* 小Q 面板停靠时让内容区自己让出宽度, 而不是压住正文 —— 一边看文献一边问才成立 */}
      <SidebarInset className={cn('transition-[padding] duration-200', assistantOpen && 'lg:pr-[400px]')}>
        <Header />
        <div className={cn('min-w-0 flex-1 px-4 xl:px-6 pt-4', examActive ? 'pb-4' : 'pb-24 xl:pb-6')}>
          <Outlet />
        </div>
        {!examActive && <MobileBottomNav />}
      </SidebarInset>
      {/* 考试期间不挂入口: 那会儿最不需要旁边有人递话 */}
      {!examActive && <AssistantLauncher />}
      <AssistantPanel />
      <QuickSearch />
    </SidebarProvider>
  )
}
