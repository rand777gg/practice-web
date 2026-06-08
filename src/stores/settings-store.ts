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

interface SettingsState {
  flags: AiFeatureFlags
  offlineMode: boolean
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  setOfflineMode: (value: boolean) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  flags: loadFlags(),
  offlineMode: loadOfflineMode(),
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
  isEnabled: (key) => get().flags[key],
}))
