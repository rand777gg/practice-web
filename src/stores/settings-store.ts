import { create } from 'zustand'

export interface AiFeatureFlags {
  exam: boolean        // AI 智能出题
  summary: boolean     // AI 学习总结
  suggestions: boolean // AI 学习建议
  mineru: boolean      // MinerU 精准解析
  keypoints: boolean   // AI 生成知识点
}

const STORAGE_KEY = 'ai_feature_flags'

function loadFlags(): AiFeatureFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AiFeatureFlags
  } catch { /* ignore */ }
  return { exam: true, summary: true, suggestions: true, mineru: true, keypoints: true }
}

function saveFlags(flags: AiFeatureFlags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
}

interface SettingsState {
  flags: AiFeatureFlags
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  flags: loadFlags(),
  setFlag: (key, value) => {
    set((s) => {
      const next = { ...s.flags, [key]: value }
      saveFlags(next)
      return { flags: next }
    })
  },
  isEnabled: (key) => get().flags[key],
}))
