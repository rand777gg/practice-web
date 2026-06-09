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
const CODE_THEME_KEY = 'code_theme'

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

function loadCodeTheme(): string {
  return localStorage.getItem(CODE_THEME_KEY) || 'github-dark'
}

interface SettingsState {
  flags: AiFeatureFlags
  offlineMode: boolean
  sidebarCollapsed: boolean
  codeTheme: string
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  setOfflineMode: (value: boolean) => void
  setSidebarCollapsed: (value: boolean) => void
  setCodeTheme: (theme: string) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  flags: loadFlags(),
  offlineMode: loadOfflineMode(),
  sidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
  codeTheme: loadCodeTheme(),
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
  setSidebarCollapsed: (value) => {
    localStorage.setItem('sidebar_collapsed', String(value))
    set({ sidebarCollapsed: value })
  },
  setCodeTheme: (theme) => {
    localStorage.setItem(CODE_THEME_KEY, theme)
    set({ codeTheme: theme })
  },
  isEnabled: (key) => get().flags[key],
}))
