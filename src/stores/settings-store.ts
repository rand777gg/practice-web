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
const FONT_FAMILY_KEY = 'font_family'
const FONT_SIZE_KEY = 'font_size'
const FONT_WEIGHT_KEY = 'font_weight'

export const FONT_OPTIONS = [
  { value: 'Noto Sans SC',       label: '思源黑体',   google: 'Noto+Sans+SC',       weights: '300;400;500;700' },
  { value: 'Noto Serif SC',      label: '思源宋体',   google: 'Noto+Serif+SC',      weights: '300;400;500;700' },
  { value: 'LXGW WenKai',        label: '霞鹜文楷',   google: 'LXGW+WenKai',        weights: '300;400;700' },
  { value: 'ZCOOL QingKe HuangYou', label: '站酷庆科黄油体', google: 'ZCOOL+QingKe+HuangYou', weights: '400' },
  { value: 'ZCOOL XiaoWei',      label: '站酷小薇',   google: 'ZCOOL+XiaoWei',      weights: '400' },
  { value: 'ZCOOL KuaiLe',       label: '站酷快乐体', google: 'ZCOOL+KuaiLe',       weights: '400' },
  { value: 'Ma Shan Zheng',      label: '马山正',     google: 'Ma+Shan+Zheng',      weights: '400' },
  { value: 'system',             label: '系统默认',   google: null,                 weights: '' },
] as const

export const FONT_SIZES = [14, 15, 16, 17, 18, 20] as const
export const FONT_WEIGHTS = [
  { value: 300, label: '细体' },
  { value: 400, label: '常规' },
  { value: 500, label: '中等' },
  { value: 600, label: '半粗' },
  { value: 700, label: '粗体' },
] as const

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
  fontFamily: string
  fontSize: number
  fontWeight: number
  setFlag: (key: keyof AiFeatureFlags, value: boolean) => void
  setOfflineMode: (value: boolean) => void
  setEyeCare: (value: string) => void
  setSidebarCollapsed: (value: boolean) => void
  setCodeTheme: (theme: string) => void
  setFontFamily: (value: string) => void
  setFontSize: (value: number) => void
  setFontWeight: (value: number) => void
  isEnabled: (key: keyof AiFeatureFlags) => boolean
}

function loadFontFamily(): string {
  return localStorage.getItem(FONT_FAMILY_KEY) || 'Noto Sans SC'
}
function loadFontSize(): number {
  const v = localStorage.getItem(FONT_SIZE_KEY)
  return v ? Number(v) : 16
}
function loadFontWeight(): number {
  const v = localStorage.getItem(FONT_WEIGHT_KEY)
  return v ? Number(v) : 400
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  flags: loadFlags(),
  offlineMode: loadOfflineMode(),
  eyeCare: localStorage.getItem(EYE_CARE_KEY) || '',
  sidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
  darkCodeTheme: loadDarkCodeTheme(),
  lightCodeTheme: loadLightCodeTheme(),
  fontFamily: loadFontFamily(),
  fontSize: loadFontSize(),
  fontWeight: loadFontWeight(),
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
  setFontFamily: (value) => {
    localStorage.setItem(FONT_FAMILY_KEY, value)
    set({ fontFamily: value })
  },
  setFontSize: (value) => {
    localStorage.setItem(FONT_SIZE_KEY, String(value))
    set({ fontSize: value })
  },
  setFontWeight: (value) => {
    localStorage.setItem(FONT_WEIGHT_KEY, String(value))
    set({ fontWeight: value })
  },
  isEnabled: (key) => get().flags[key],
}))
