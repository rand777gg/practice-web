import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Eye, Languages, Moon, MoreHorizontal, Settings, Sparkles, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { QrScanner } from '@/components/auth/QrScanner'
import { HeaderPlanMenu } from './HeaderPlanMenu'
import { hasAiConfig } from '@/lib/ai'
import { useLangStore } from '@/stores/lang-store'
import { useAssistantStore } from '@/stores/assistant-store'
import { useSettingsStore, EYE_CARE_PALETTES, HEADER_ACTIONS } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

/** 顶栏右侧: block 里 NavActions 的形态 —— 一个上下文入口 + 一个「更多」面板 */
export function NavActions() {
  const { t } = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const setEyeCare = useSettingsStore((s) => s.setEyeCare)
  const headerActions = useSettingsStore((s) => s.headerActions)
  const isEnabled = useSettingsStore((s) => s.isEnabled)
  const setAssistantOpen = useAssistantStore((s) => s.setOpen)

  const [open, setOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const aiAvailable = hasAiConfig() && isEnabled('summary')
  const visible = HEADER_ACTIONS.filter((a) => headerActions.includes(a.key)).filter(
    (a) => a.key !== 'aiSummary' || aiAvailable,
  )
  const labelOf = (a: (typeof HEADER_ACTIONS)[number]) => (lang === 'zh' ? a.labelZh : a.labelEn)
  const showEyeCare = visible.some((a) => a.key === 'eyeCare')

  return (
    <div className="ml-auto flex items-center gap-1.5 text-sm">
      {/* 参考 Ask AI: 图标 + 文字，常驻顶栏 */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 px-2 font-medium"
        onClick={() => { setOpen(false); setAssistantOpen(true) }}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">{t('nav.assistant')}</span>
      </Button>
      <HeaderPlanMenu />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 data-[state=open]:bg-accent" title={t('common.more')}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 overflow-hidden rounded-lg p-0" align="end">
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              <SidebarGroup className="border-b last:border-none">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    {visible.map((action) => {
                      if (action.key === 'theme') {
                        return (
                          <SidebarMenuItem key={action.key}>
                            <SidebarMenuButton onClick={toggleTheme}>
                              {theme === 'light' ? <Moon /> : <Sun />}
                              <span>{labelOf(action)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      }
                      if (action.key === 'lang') {
                        return (
                          <SidebarMenuItem key={action.key}>
                            <SidebarMenuButton onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
                              <Languages />
                              <span>{labelOf(action)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      }
                      if (action.key === 'qr') {
                        return (
                          <SidebarMenuItem key={action.key}>
                            <SidebarMenuButton onClick={() => { setOpen(false); setQrOpen(true) }}>
                              <Camera />
                              <span>{labelOf(action)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      }
                      if (action.key === 'settings') {
                        return (
                          <SidebarMenuItem key={action.key}>
                            <SidebarMenuButton asChild onClick={() => setOpen(false)}>
                              <Link to="/settings">
                                <Settings />
                                <span>{labelOf(action)}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      }
                      if (action.key === 'eyeCare') {
                        return (
                          <SidebarMenuItem key={action.key}>
                            <SidebarMenuButton className={cn(eyeCare && 'bg-accent text-accent-foreground')}>
                              <Eye />
                              <span>{labelOf(action)}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      }
                      return (
                        <SidebarMenuItem key={action.key}>
                          <SidebarMenuButton onClick={() => { setOpen(false); setAiOpen(true) }}>
                            <Sparkles className="text-blue-400 dark:text-blue-300" />
                            <span>{labelOf(action)}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {showEyeCare && (
                <SidebarGroup className="border-b last:border-none">
                  <SidebarGroupLabel>{t('settings.eyeCare')}</SidebarGroupLabel>
                  <SidebarGroupContent className="gap-0">
                    <SidebarMenu>
                      {EYE_CARE_PALETTES.map((palette) => (
                        <SidebarMenuItem key={palette.value}>
                          <SidebarMenuButton onClick={() => setEyeCare(palette.value)}>
                            <span
                              className="size-3.5 shrink-0 rounded-full border"
                              style={{ backgroundColor: palette.preview }}
                            />
                            <span>{palette.label}</span>
                            {eyeCare === palette.value && <Check className="ml-auto size-4" />}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>

      <QrScanner open={qrOpen} onOpenChange={setQrOpen} />
      {aiAvailable && <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />}
    </div>
  )
}
