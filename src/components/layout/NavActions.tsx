import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera, Check, ChevronRight, Keyboard, Languages, LogOut, Monitor, Moon, MoreHorizontal, Settings, Sparkles, Sun,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { QrScanner } from '@/components/auth/QrScanner'
import { ShortcutSettings } from '@/components/settings/ShortcutSettings'
import { HeaderPlanMenu } from './HeaderPlanMenu'
import { hasAiConfig } from '@/lib/ai'
import { selfAvatarOwner } from '@/lib/avatar'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useAssistantStore } from '@/stores/assistant-store'
import { useSettingsStore, EYE_CARE_PALETTES, HEADER_ACTIONS } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { useT } from '@/i18n/use-t'

/** 顶栏右侧: block 里 NavActions 的形态 —— 一个上下文入口 + 一个「更多」面板 */
export function NavActions() {
  const { t } = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const setEyeCare = useSettingsStore((s) => s.setEyeCare)
  const headerActions = useSettingsStore((s) => s.headerActions)
  const isEnabled = useSettingsStore((s) => s.isEnabled)
  const practiceShortcuts = useSettingsStore((s) => s.practiceShortcuts)
  const setPracticeShortcut = useSettingsStore((s) => s.setPracticeShortcut)
  const setAssistantOpen = useAssistantStore((s) => s.setOpen)

  const [open, setOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const aiAvailable = hasAiConfig() && isEnabled('summary')
  const visible = HEADER_ACTIONS.filter((a) => headerActions.includes(a.key)).filter(
    (a) => a.key !== 'aiSummary' || aiAvailable,
  )
  const labelOf = (a: (typeof HEADER_ACTIONS)[number]) => (lang === 'zh' ? a.labelZh : a.labelEn)
  // 设置单独一组: 它是跳转, 跟扫码/总结这些弹窗动作不是一类
  const quickActions = visible.filter((a) => a.key !== 'settings')
  const showSettings = visible.some((a) => a.key === 'settings')
  const activePalette = EYE_CARE_PALETTES.find((p) => p.value === eyeCare) ?? EYE_CARE_PALETTES[0]

  const email = user?.email ?? ''
  const name = profile?.nickname || email.split('@')[0] || 'User'
  const avatarOwner = selfAvatarOwner(user, profile)

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
        <PopoverContent className="w-64 overflow-hidden rounded-lg p-0" align="end">
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              {/* 账号信息从侧边栏底部搬到这里: 面板顶部先说明"这是谁的菜单", 下面才是能点的动作 */}
              <SidebarGroup className="border-b last:border-none">
                <SidebarGroupContent className="gap-0">
                  <div className="flex items-center gap-2 p-2">
                    <UserAvatar owner={avatarOwner} className="size-8 rounded-lg" />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{email}</span>
                    </div>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* 深浅色与语言保持原来的二级菜单: 一行入口 → 展开(浅色再下一级是护眼配色)。
                  面板本身是 Popover, 所以这里嵌 DropdownMenu; 用 modal={false} 免得两层
                  焦点锁互相抢, 也免得点菜单被外层当成"点到外面"而关掉整个面板 */}
              <SidebarGroup className="border-b last:border-none">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton>
                            {mode === 'dark' ? <Moon /> : mode === 'light' ? <Sun /> : <Monitor />}
                            <span>{t('settings.themeMode')}</span>
                            <ChevronRight className="ml-auto size-4 shrink-0" />
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="left" align="start" sideOffset={6} collisionPadding={8} className="w-44">
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Sun />
                              {t('settings.themeLight')}
                              {mode === 'light' && (
                                <span className="ml-auto text-[10px] text-muted-foreground">{activePalette.label}</span>
                              )}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent collisionPadding={8} className="w-44 max-h-72 overflow-y-auto">
                              {EYE_CARE_PALETTES.map((palette) => (
                                <DropdownMenuItem
                                  key={palette.value}
                                  onClick={() => { setMode('light'); setEyeCare(palette.value) }}
                                >
                                  <span
                                    className="size-3.5 shrink-0 rounded-full border"
                                    style={{ backgroundColor: palette.preview }}
                                  />
                                  {palette.label}
                                  {mode === 'light' && eyeCare === palette.value && <Check className="ml-auto size-4" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuItem onClick={() => setMode('dark')}>
                            <Moon />
                            {t('settings.themeDark')}
                            {mode === 'dark' && <Check className="ml-auto size-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMode('system')}>
                            <Monitor />
                            {t('settings.themeSystem')}
                            {mode === 'system' && <Check className="ml-auto size-4" />}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton>
                            <Languages />
                            <span>{t('settings.language')}</span>
                            <ChevronRight className="ml-auto size-4 shrink-0" />
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="left" align="start" sideOffset={6} collisionPadding={8} className="w-36">
                          {([['zh', '中文'], ['en', 'English']] as const).map(([value, label]) => (
                            <DropdownMenuItem key={value} onClick={() => setLang(value)}>
                              {label}
                              {lang === value && <Check className="ml-auto size-4" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup className="border-b last:border-none">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => { setOpen(false); setShortcutsOpen(true) }}>
                        <Keyboard />
                        <span>{t('settings.shortcuts')}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {quickActions.map((action) => (
                      <SidebarMenuItem key={action.key}>
                        {action.key === 'qr' ? (
                          <SidebarMenuButton onClick={() => { setOpen(false); setQrOpen(true) }}>
                            <Camera />
                            <span>{labelOf(action)}</span>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton onClick={() => { setOpen(false); setAiOpen(true) }}>
                            <Sparkles className="text-blue-400 dark:text-blue-300" />
                            <span>{labelOf(action)}</span>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {showSettings && (
                <SidebarGroup className="border-b last:border-none">
                  <SidebarGroupContent className="gap-0">
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild onClick={() => setOpen(false)}>
                          <Link to="/settings">
                            <Settings />
                            <span>{t('settings.title')}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              <SidebarGroup className="border-b last:border-none">
                <SidebarGroupContent className="gap-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => { setOpen(false); void signOut() }}>
                        <LogOut />
                        <span>{t('auth.logout')}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>

      <QrScanner open={qrOpen} onOpenChange={setQrOpen} />
      {aiAvailable && <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('settings.shortcuts')}</DialogTitle>
          </DialogHeader>
          <ShortcutSettings shortcuts={practiceShortcuts} onChange={setPracticeShortcut} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
