import { useState } from "react"
import { Link } from "react-router-dom"
import {
  Camera, Check, ChevronsUpDown, Keyboard, Languages, LogOut,
  Monitor, Moon, Settings, Sparkles, Sun,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { AiSummaryDialog } from "@/components/ai/AiSummaryDialog"
import { QrScanner } from "@/components/auth/QrScanner"
import { ShortcutSettings } from "@/components/settings/ShortcutSettings"
import { hasAiConfig } from "@/lib/ai"
import { useAuthStore } from "@/stores/auth-store"
import { useLangStore } from "@/stores/lang-store"
import { useSettingsStore, EYE_CARE_PALETTES } from "@/stores/settings-store"
import { useThemeStore } from "@/stores/theme-store"
import { useT } from "@/i18n/use-t"

export function SidebarAccountMenu() {
  const { isMobile, setOpenMobile } = useSidebar()
  const { t, lang } = useT()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const setLang = useLangStore((s) => s.setLang)
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const setEyeCare = useSettingsStore((s) => s.setEyeCare)
  const practiceShortcuts = useSettingsStore((s) => s.practiceShortcuts)
  const setPracticeShortcut = useSettingsStore((s) => s.setPracticeShortcut)
  const isEnabled = useSettingsStore((s) => s.isEnabled)

  const [qrOpen, setQrOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const aiVisible = hasAiConfig() && isEnabled("summary")
  const activePalette = EYE_CARE_PALETTES.find((p) => p.value === eyeCare) ?? EYE_CARE_PALETTES[0]
  const email = user?.email ?? ""
  const name = profile?.nickname || email.split("@")[0] || "User"
  const initials = name.slice(0, 2).toUpperCase()

  const openDialog = (setter: (open: boolean) => void) => () => {
    setOpenMobile(false)
    setter(true)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />}
                  {t("settings.themeMode")}
                </DropdownMenuSubTrigger>
                {/* 子菜单没有 side 属性（Radix 刻意不暴露），方向由碰撞检测决定：保留避让 + 预留边距，移动端才会自动翻到左侧 */}
                <DropdownMenuSubContent collisionPadding={isMobile ? 16 : 8}>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Sun />
                      {t("settings.themeLight")}
                      {mode === "light" && (
                        <span className="text-[10px] text-muted-foreground">{activePalette.label}</span>
                      )}
                    </DropdownMenuSubTrigger>
                    {/* 三级菜单（浅色配色列表）：原来写了 avoidCollisions={false} 会禁用自动避让，
                        移动端主菜单在底部展开时这一层会被屏幕右边裁掉。放开避让并留 16px 边距，它会自动向左展开。 */}
                    <DropdownMenuSubContent
                      collisionPadding={isMobile ? 16 : 8}
                      className="w-44 max-h-72 overflow-y-auto"
                    >
                      {EYE_CARE_PALETTES.map((palette) => (
                        <DropdownMenuItem
                          key={palette.value}
                          onClick={() => {
                            setMode("light")
                            setEyeCare(palette.value)
                          }}
                        >
                          <span
                            className="size-3.5 shrink-0 rounded-full border"
                            style={{ backgroundColor: palette.preview }}
                          />
                          {palette.label}
                          {mode === "light" && eyeCare === palette.value && (
                            <Check className="ml-auto size-4" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={() => setMode("dark")}>
                    <Moon />
                    {t("settings.themeDark")}
                    {mode === "dark" && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode("system")}>
                    <Monitor />
                    {t("settings.themeSystem")}
                    {mode === "system" && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages />
                  {t("settings.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent collisionPadding={isMobile ? 16 : 8}>
                  {([["zh", "中文"], ["en", "English"]] as const).map(([value, label]) => (
                    <DropdownMenuItem key={value} onClick={() => setLang(value)}>
                      {label}
                      {lang === value && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={openDialog(setShortcutsOpen)}>
                <Keyboard />
                {t("settings.shortcuts")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openDialog(setQrOpen)}>
                <Camera />
                {t("settings.qrLogin")}
              </DropdownMenuItem>
              {aiVisible && (
                <DropdownMenuItem onClick={openDialog(setAiOpen)}>
                  <Sparkles />
                  {t("settings.aiSummary")}
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings />
                  {t("settings.title")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("settings.shortcuts")}</DialogTitle>
          </DialogHeader>
          <ShortcutSettings shortcuts={practiceShortcuts} onChange={setPracticeShortcut} />
        </DialogContent>
      </Dialog>
      <QrScanner open={qrOpen} onOpenChange={setQrOpen} />
      {aiVisible && <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />}
    </>
  )
}
