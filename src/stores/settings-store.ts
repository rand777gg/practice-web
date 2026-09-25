import { create } from 'zustand'
import type { SidebarGroup, SidebarOrder } from '@/lib/nav-order'
import {
  SETTINGS,
  readAllSettings,
  writeSetting,
  DEFAULT_SIDEBAR_ORDER,
  BOTTOM_NAV_HIDE_DELAY_MAX,
  BOTTOM_NAV_HIDE_DELAY_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  type AiFeatureFlags,
  type BottomNavTabKey,
  type ExamViewMode,
  type HeaderActionKey,
  type NoteRecognitionMode,
  type PinnedNavKey,
  type PracticeUiVariant,
  type ShortcutAction,
  type ShortcutConfig,
} from '@/lib/settings-schema'

/**
 * 客户端展示偏好。
 *
 * 键名、默认值、解析和版本迁移都在 lib/settings-schema.ts —— 这里只负责把定义接到 zustand 状态上。
 * 这个 store 装的是设备级偏好（主题、字号、导航布局），不是账号数据，所以登出时不清空：
 * 它跟着设备走，换个人登录不该把界面重置一遍。
 */
export * from '@/lib/settings-schema'

interface SettingsState {
  flags: AiFeatureFlags
  offlineMode: boolean
  assistantLauncherHidden: boolean
  eyeCare: string
  sidebarCollapsed: boolean
  darkCodeTheme: string
  lightCodeTheme: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  noteRecognitionMode: NoteRecognitionMode
  bottomNavTabs: BottomNavTabKey[]
  bottomNavHideDelay: number
  headerActions: HeaderActionKey[]
  pinnedNav: PinnedNavKey[]
  practiceShortcuts: ShortcutConfig
  defaultPage: string
  examViewMode: ExamViewMode
  practiceUiVariant: PracticeUiVariant
  sidebarOrder: SidebarOrder
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  setOfflineMode: (value: boolean) => void
  setAssistantLauncherHidden: (value: boolean) => void
  setEyeCare: (value: string) => void
  setSidebarCollapsed: (value: boolean) => void
  setCodeTheme: (theme: string) => void
  setFontFamily: (value: string) => void
  setFontSize: (value: number) => void
  setFontWeight: (value: number) => void
  setNoteRecognitionMode: (value: NoteRecognitionMode) => void
  setBottomNavTabs: (tabs: BottomNavTabKey[]) => void
  setBottomNavHideDelay: (value: number) => void
  setHeaderActions: (actions: HeaderActionKey[]) => void
  setPinnedNav: (keys: PinnedNavKey[]) => void
  setPracticeShortcut: (action: ShortcutAction, keys: string) => void
  setDefaultPage: (page: string) => void
  setSidebarOrder: (group: SidebarGroup, ids: string[]) => void
  resetSidebarOrder: () => void
  setExamViewMode: (value: ExamViewMode) => void
  setPracticeUiVariant: (value: PracticeUiVariant) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

export const EXAM_VIEW_MODES: ExamViewMode[] = ['card', 'sheet', 'spread']

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...readAllSettings(),
  // 新版练习界面暂未启用：只保留开关的形态，值恒为旧版，也不落盘
  practiceUiVariant: 'old',

  setFlag: (key, value) => {
    const next = { ...get().flags, [key]: value }
    writeSetting(SETTINGS.flags, next)
    set({ flags: next })
  },
  setOfflineMode: (value) => {
    writeSetting(SETTINGS.offlineMode, value)
    set({ offlineMode: value })
  },
  setAssistantLauncherHidden: (value) => {
    writeSetting(SETTINGS.assistantLauncherHidden, value)
    set({ assistantLauncherHidden: value })
  },
  setEyeCare: (value) => {
    writeSetting(SETTINGS.eyeCare, value)
    set({ eyeCare: value })
  },
  setSidebarCollapsed: (value) => {
    writeSetting(SETTINGS.sidebarCollapsed, value)
    set({ sidebarCollapsed: value })
  },
  setCodeTheme: (theme) => {
    // 代码主题分深浅两套，按主题名判断该覆盖哪一套
    const isDarkTheme = !/(light|dawn|latte|lotus)/.test(theme)
    if (isDarkTheme) {
      writeSetting(SETTINGS.darkCodeTheme, theme)
      set({ darkCodeTheme: theme })
    } else {
      writeSetting(SETTINGS.lightCodeTheme, theme)
      set({ lightCodeTheme: theme })
    }
  },
  setFontFamily: (value) => {
    writeSetting(SETTINGS.fontFamily, value)
    set({ fontFamily: value })
  },
  setFontSize: (value) => {
    const clamped = Math.min(Math.max(Math.round(value), FONT_SIZE_MIN), FONT_SIZE_MAX)
    writeSetting(SETTINGS.fontSize, clamped)
    set({ fontSize: clamped })
  },
  setFontWeight: (value) => {
    const clamped = Math.min(Math.max(Math.round(value), FONT_WEIGHT_MIN), FONT_WEIGHT_MAX)
    writeSetting(SETTINGS.fontWeight, clamped)
    set({ fontWeight: clamped })
  },
  setNoteRecognitionMode: (value) => {
    writeSetting(SETTINGS.noteRecognitionMode, value)
    set({ noteRecognitionMode: value })
  },
  setBottomNavTabs: (tabs) => {
    writeSetting(SETTINGS.bottomNavTabs, tabs)
    set({ bottomNavTabs: tabs })
  },
  setBottomNavHideDelay: (value) => {
    const clamped = Math.min(Math.max(Math.round(value), BOTTOM_NAV_HIDE_DELAY_MIN), BOTTOM_NAV_HIDE_DELAY_MAX)
    writeSetting(SETTINGS.bottomNavHideDelay, clamped)
    set({ bottomNavHideDelay: clamped })
  },
  setHeaderActions: (actions) => {
    writeSetting(SETTINGS.headerActions, actions)
    set({ headerActions: actions })
  },
  setPinnedNav: (keys) => {
    writeSetting(SETTINGS.pinnedNav, keys)
    set({ pinnedNav: keys })
  },
  setPracticeShortcut: (action, keys) => {
    const next = { ...get().practiceShortcuts, [action]: keys }
    writeSetting(SETTINGS.practiceShortcuts, next)
    set({ practiceShortcuts: next })
  },
  setDefaultPage: (page) => {
    writeSetting(SETTINGS.defaultPage, page)
    set({ defaultPage: page })
  },
  setSidebarOrder: (group, ids) => {
    const next: SidebarOrder = { ...get().sidebarOrder, [group]: ids }
    writeSetting(SETTINGS.sidebarOrder, next)
    set({ sidebarOrder: next })
  },
  resetSidebarOrder: () => {
    const next = { ...DEFAULT_SIDEBAR_ORDER }
    writeSetting(SETTINGS.sidebarOrder, next)
    set({ sidebarOrder: next })
  },
  setExamViewMode: (value) => {
    writeSetting(SETTINGS.examViewMode, value)
    set({ examViewMode: value })
  },
  setPracticeUiVariant: (value) => {
    // 新版练习界面暂未启用：忽略 'new'，保证只能使用旧版
    if (value === 'new') return
    set({ practiceUiVariant: value })
  },
  isEnabled: (key) => get().flags[key],
}))
