import { create } from 'zustand'

export interface AiFeatureFlags {
  exam: boolean        // AI 智能出题
  summary: boolean     // AI 学习总结
  suggestions: boolean // AI 学习建议
  mineru: boolean      // MinerU 精准解析
  keypoints: boolean   // AI 生成知识点
}

const FLAGS_KEY = 'ai_feature_flags'
const OFFLINE_KEY = 'offline_mode'
const EYE_CARE_KEY = 'eye_care'
const DARK_CODE_THEME_KEY = 'dark_code_theme'
const LIGHT_CODE_THEME_KEY = 'light_code_theme'

export const EYE_CARE_PALETTES = [
  { value: '',       label: '默认',   preview: 'hsl(0 0% 100%)' },
  { value: 'silk',   label: '绢色',   preview: '#F4EDE4' },
  { value: 'celadon', label: '青瓷',  preview: '#EAF0E5' },
  { value: 'lotus',  label: '藕荷',   preview: '#F4EEF1' },
  { value: 'tea',    label: '茶白',   preview: '#F2EFEA' },
  { value: 'bamboo', label: '竹青',   preview: '#EFF3E7' },
] as const

function loadFlags(): AiFeatureFlags {
  try {
    const raw = localStorage.getItem(FLAGS_KEY)
    if (raw) return JSON.parse(raw) as AiFeatureFlags
  } catch { /* ignore */ }
  return { exam: true, summary: true, suggestions: true, mineru: true, keypoints: true }
}

function loadOfflineMode(): boolean {
  return localStorage.getItem(OFFLINE_KEY) === 'true'
}

function loadDarkCodeTheme(): string {
  return localStorage.getItem(DARK_CODE_THEME_KEY) || 'houston'
}

function loadLightCodeTheme(): string {
  return localStorage.getItem(LIGHT_CODE_THEME_KEY) || 'github-light'
}

interface SettingsState {
  flags: AiFeatureFlags
  offlineMode: boolean
  eyeCare: string
  sidebarCollapsed: boolean
  darkCodeTheme: string
  lightCodeTheme: string
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  setOfflineMode: (value: boolean) => void
  setEyeCare: (value: string) => void
  setSidebarCollapsed: (value: boolean) => void
  setCodeTheme: (theme: string) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  flags: loadFlags(),
  offlineMode: loadOfflineMode(),
  eyeCare: localStorage.getItem(EYE_CARE_KEY) || '',
  sidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
  darkCodeTheme: loadDarkCodeTheme(),
  lightCodeTheme: loadLightCodeTheme(),
  setFlag: (key, value) => {
    set((s) => {
      const next = { ...s.flags, [key]: value }
      localStorage.setItem(FLAGS_KEY, JSON.stringify(next))
      return { flags: next }
    })
  },
  setOfflineMode: (value) => {
    localStorage.setItem(OFFLINE_KEY, String(value))
    set({ offlineMode: value })
  },
  setEyeCare: (value) => {
    localStorage.setItem(EYE_CARE_KEY, value)
    set({ eyeCare: value })
  },
  setSidebarCollapsed: (value) => {
    localStorage.setItem('sidebar_collapsed', String(value))
    set({ sidebarCollapsed: value })
  },
  setCodeTheme: (theme) => {
    const isDarkTheme = !/(light|dawn|latte|lotus)/.test(theme)
    if (isDarkTheme) {
      localStorage.setItem(DARK_CODE_THEME_KEY, theme)
      set({ darkCodeTheme: theme })
    } else {
      localStorage.setItem(LIGHT_CODE_THEME_KEY, theme)
      set({ lightCodeTheme: theme })
    }
  },
  isEnabled: (key) => get().flags[key],
}))
