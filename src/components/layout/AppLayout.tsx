import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AppSidebar } from './AppSidebar'
import { Header } from './Header'
import { MobileBottomNav } from './MobileBottomNav'
import { DeferredMount } from './DeferredMount'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useRecordRecentVisit } from '@/hooks/use-recent-visits'
import { useAssistantStore } from '@/stores/assistant-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useExamStore } from '@/stores/exam-store'
import { usePromptStore } from '@/stores/prompt-store'
import { usePluginStore } from '@/stores/plugin-store'

/**
 * 可选功能一律按需加载。以前这些是静态 import，于是小Q 面板、考试预约、计划检测、
 * 快速搜索的实现连同它们的依赖（小Q 面板那条链会拖进 pdfjs 和 1.3MB 的 worker）
 * 全都进了首屏包 —— 而首屏真正需要的只有侧边栏、顶栏和当前路由页面。
 */
const AssistantPanel = lazy(() => import('@/components/assistant/AssistantPanel').then((m) => ({ default: m.AssistantPanel })))
const AssistantLauncher = lazy(() => import('@/components/assistant/AssistantLauncher').then((m) => ({ default: m.AssistantLauncher })))
const QuickSearch = lazy(() => import('./QuickSearch').then((m) => ({ default: m.QuickSearch })))
const ExamScheduleWatcher = lazy(() => import('@/components/exam/ExamScheduleWatcher').then((m) => ({ default: m.ExamScheduleWatcher })))
const PlanWatcher = lazy(() => import('./PlanWatcher').then((m) => ({ default: m.PlanWatcher })))
const OnlinePresenceTracker = lazy(() => import('./OnlinePresenceTracker').then((m) => ({ default: m.OnlinePresenceTracker })))
const EyeRestReminder = lazy(() => import('@/components/plugins/EyeRestReminder').then((m) => ({ default: m.EyeRestReminder })))

export function AppLayout() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const examActive = useExamStore((s) => s.session?.status === 'in_progress')
  const assistantOpen = useAssistantStore((s) => s.open)
  useRecordRecentVisit()

  // 面板打开过一次就保持挂载：再关再开不该丢掉面板内部的滚动位置和草稿。
  const [assistantMounted, setAssistantMounted] = useState(false)
  useEffect(() => {
    if (assistantOpen) setAssistantMounted(true)
  }, [assistantOpen])

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
      {/* 看门狗只做后台检测，推迟到空闲再挂 */}
      <DeferredMount>
        <Suspense fallback={null}>
          <OnlinePresenceTracker />
          <ExamScheduleWatcher />
          <PlanWatcher />
          <EyeRestReminder />
        </Suspense>
      </DeferredMount>
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
      {!examActive && (
        <Suspense fallback={null}>
          <AssistantLauncher />
        </Suspense>
      )}
      {assistantMounted && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <QuickSearch />
      </Suspense>
    </SidebarProvider>
  )
}
