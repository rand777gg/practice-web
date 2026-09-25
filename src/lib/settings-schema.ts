import {
  DEFAULT_SIDEBAR_ORDER,
  normalizeSidebarOrder,
  type SidebarOrder,
} from '@/lib/nav-order'

export { DEFAULT_SIDEBAR_ORDER }

/**
 * 设置项的单一来源：键名、默认值、读写格式和版本迁移都定义在这里。
 *
 * 之前每个设置各有一份 loadXxx() + 一个 setter 里直接 localStorage.setItem，散布在 400 行里：
 * 键名靠字符串字面量重复出现，默认值写两遍（读和写各一遍），加了新设置很容易只改一半。
 * 这里把「一个设置的完整定义」收成一条记录，store 只负责把它们接到状态上。
 *
 * 另一个动机是版本迁移：这些键的值会随版本变形状（例如 practice_shortcuts 的 v1 → v2），
 * 而散落的 load 函数没有地方挂迁移 —— 只能在新 load 里写 if，越积越多。
 */

export type AiFeatureFlags = {
  exam: boolean        // AI 智能出题
  summary: boolean     // AI 学习总结
  suggestions: boolean // AI 学习建议
  analysis: boolean    // AI 图表分析
  mineru: boolean      // MinerU 精准解析
  keypoints: boolean   // AI 生成知识点
}

export type NoteRecognitionMode = 'mineru' | 'ai'
/** 练习界面的呈现模式: old=旧版布局 / new=参考图风格新布局 */
export type PracticeUiVariant = 'old' | 'new'
/** 考试界面的呈现模式: card=卡片模式 / sheet=卷面·单页摊开 / spread=卷面·双页摊开 */
export type ExamViewMode = 'card' | 'sheet' | 'spread'

export type ShortcutAction = 'prev' | 'next' | 'submit' | 'markUnsure' | 'markWrong' | 'favorite' | 'tooEasy' | 'flagIssue'
export type ShortcutConfig = Record<ShortcutAction, string>

export const BOTTOM_NAV_TABS = [
  { key: 'dashboard' as const, labelZh: '仪表盘', labelEn: 'Dashboard' },
  { key: 'practice' as const, labelZh: '练习', labelEn: 'Practice' },
  { key: 'exam' as const, labelZh: '考试', labelEn: 'Exam' },
  { key: 'favorites' as const, labelZh: '收藏', labelEn: 'Favorites' },
  { key: 'review' as const, labelZh: '错题回顾', labelEn: 'Wrong Review' },
]
export type BottomNavTabKey = (typeof BOTTOM_NAV_TABS)[number]['key']
const BOTTOM_NAV_TAB_KEYS = BOTTOM_NAV_TABS.map((t) => t.key)
export const DEFAULT_BOTTOM_NAV_TABS: BottomNavTabKey[] = ['dashboard', 'practice', 'exam', 'favorites', 'review']

/** 侧边栏固定区里可自定义的入口; 仪表盘是常驻项, 不在这里 */
export const PINNED_NAV_ITEMS = [
  { key: 'search' as const, labelZh: '快速搜索', labelEn: 'Quick search' },
] as const
export type PinnedNavKey = (typeof PINNED_NAV_ITEMS)[number]['key']

/**
 * 顶栏可配置的快捷按钮; 顺序即显示顺序。
 * 深浅色 / 语言 / 护眼配色不在这里 —— 它们在「更多」的账号区已经是常驻入口(二级菜单),
 * 再留一份开关就成了同一个面板里两处改同一个东西。
 */
export const HEADER_ACTIONS = [
  { key: 'qr' as const, labelZh: '扫码登录', labelEn: 'QR sign-in' },
  { key: 'aiSummary' as const, labelZh: 'AI 学习总结', labelEn: 'AI summary' },
  { key: 'settings' as const, labelZh: '设置', labelEn: 'Settings' },
] as const
export type HeaderActionKey = (typeof HEADER_ACTIONS)[number]['key']

export const DEFAULT_FLAGS: AiFeatureFlags = { exam: true, summary: false, suggestions: false, analysis: false, mineru: true, keypoints: true }

export const DEFAULT_SHORTCUTS: ShortcutConfig = { prev: 'ArrowLeft', next: 'ArrowRight', submit: 'Enter', markUnsure: 'e', markWrong: 'x', favorite: 'q', tooEasy: 'w', flagIssue: 'r' }

export const FONT_SIZES = [14, 15, 16, 17, 18, 20] as const
export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 28
export const FONT_WEIGHT_MIN = 100
export const FONT_WEIGHT_MAX = 900
export const FONT_WEIGHTS = [
  { value: 300, label: '细体' },
  { value: 400, label: '常规' },
  { value: 500, label: '中等' },
  { value: 600, label: '半粗' },
  { value: 700, label: '粗体' },
] as const

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

export const EYE_CARE_PALETTES = [
  { value: '',       label: '默认',   preview: 'hsl(0 0% 100%)' },
  { value: 'paper',  label: '纸张',   preview: '#FBF5D7' },
  { value: 'silk',   label: '绢色',   preview: '#F4EDE4' },
  { value: 'celadon', label: '青瓷',  preview: '#EAF0E5' },
  { value: 'lotus',  label: '藕荷',   preview: '#F4EEF1' },
  { value: 'tea',    label: '茶白',   preview: '#F2EFEA' },
  { value: 'bamboo', label: '竹青',   preview: '#EFF3E7' },
] as const

export const BOTTOM_NAV_HIDE_DELAY_MIN = 1
export const BOTTOM_NAV_HIDE_DELAY_MAX = 5
export const BOTTOM_NAV_HIDE_DELAY_DEFAULT = 3

export const USER_PAGE_OPTIONS = [
  { value: '/', label: '仪表盘' },
  { value: '/practice', label: '练习' },
  { value: '/exam', label: '考试' },
  { value: '/favorites', label: '收藏' },
  { value: '/review', label: '错题回顾' },
  { value: '/notes', label: '公开笔记' },
  { value: '/question-bank', label: '题库' },
]

export const ADMIN_PAGE_OPTIONS = [
  { value: '/admin/questions', label: '题目管理' },
  { value: '/admin/ai-import', label: 'AI 智能解析' },
  { value: '/admin/users', label: '用户管理' },
  { value: '/admin/ai', label: 'AI 管理' },
]

/** 一个设置项的完整定义 */
export interface SettingDef<T> {
  /** localStorage 键名。同时也是云同步的键名 —— 改名等于让所有用户丢一次设置 */
  key: string
  fallback: T
  read: (raw: string | null) => T
  write: (value: T) => string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** JSON 存储的设置项：解析失败或形状不对时回落到默认值，并且只保留白名单内的键 */
function jsonSetting<T>(key: string, fallback: T, normalize: (value: unknown) => T): SettingDef<T> {
  return {
    key,
    fallback,
    read: (raw) => normalize(parseJson(raw)),
    write: (value) => JSON.stringify(value),
  }
}

/** 纯字符串设置项（布尔、数字、枚举都写成字符串，与历史数据兼容） */
function stringSetting(key: string, fallback: string): SettingDef<string>
function stringSetting<T extends string>(key: string, fallback: T, isAllowed: (v: string) => boolean): SettingDef<T>
function stringSetting<T extends string>(key: string, fallback: T, isAllowed?: (v: string) => boolean): SettingDef<T> {
  return {
    key,
    fallback,
    read: (raw) => (raw !== null && (!isAllowed || isAllowed(raw)) ? (raw as T) : fallback),
    write: (value) => value,
  }
}

function numberSetting(key: string, fallback: number, min: number, max: number): SettingDef<number> {
  return {
    key,
    fallback,
    read: (raw) => {
      const n = Number(raw)
      // localStorage 里可能留着 'NaN'、空串或被手改过的越界值
      if (!Number.isFinite(n)) return fallback
      return Math.min(Math.max(Math.round(n), min), max)
    },
    write: (value) => String(value),
  }
}

function boolSetting(key: string, fallback: boolean): SettingDef<boolean> {
  return {
    key,
    fallback,
    read: (raw) => (raw === null ? fallback : raw === 'true'),
    write: (value) => String(value),
  }
}

function keyListSetting<K extends string>(key: string, fallback: K[], allowed: readonly K[]): SettingDef<K[]> {
  return jsonSetting<K[]>(key, fallback, (value) => {
    if (!Array.isArray(value)) return [...fallback]
    const valid = new Set<string>(allowed)
    const out = value.filter((v): v is K => typeof v === 'string' && valid.has(v))
    return out.length > 0 ? out : [...fallback]
  })
}

export const SETTINGS = {
  flags: jsonSetting<AiFeatureFlags>('ai_feature_flags', DEFAULT_FLAGS, (value) => {
    if (!isRecord(value)) return { ...DEFAULT_FLAGS }
    const out = { ...DEFAULT_FLAGS }
    for (const k of Object.keys(DEFAULT_FLAGS) as (keyof AiFeatureFlags)[]) {
      if (typeof value[k] === 'boolean') out[k] = value[k]
    }
    return out
  }),
  offlineMode: boolSetting('offline_mode', false),
  assistantLauncherHidden: boolSetting('assistant_launcher_hidden', false),
  eyeCare: stringSetting('eye_care', ''),
  sidebarCollapsed: boolSetting('sidebar_collapsed', false),
  darkCodeTheme: stringSetting('dark_code_theme', 'houston'),
  lightCodeTheme: stringSetting('light_code_theme', 'github-light'),
  fontFamily: stringSetting('font_family', 'Noto Sans SC'),
  fontSize: numberSetting('font_size', 16, FONT_SIZE_MIN, FONT_SIZE_MAX),
  fontWeight: numberSetting('font_weight', 400, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX),
  noteRecognitionMode: stringSetting<NoteRecognitionMode>('note_recognition_mode', 'mineru', (v) => v === 'mineru' || v === 'ai'),
  bottomNavTabs: keyListSetting<BottomNavTabKey>('bottom_nav_tabs', DEFAULT_BOTTOM_NAV_TABS, BOTTOM_NAV_TAB_KEYS),
  bottomNavHideDelay: numberSetting('bottom_nav_hide_delay', BOTTOM_NAV_HIDE_DELAY_DEFAULT, BOTTOM_NAV_HIDE_DELAY_MIN, BOTTOM_NAV_HIDE_DELAY_MAX),
  headerActions: keyListSetting<HeaderActionKey>('header_actions', ['qr', 'settings'], HEADER_ACTIONS.map((a) => a.key)),
  pinnedNav: keyListSetting<PinnedNavKey>('pinned_nav', ['search'], PINNED_NAV_ITEMS.map((a) => a.key)),
  practiceShortcuts: jsonSetting<ShortcutConfig>('practice_shortcuts', DEFAULT_SHORTCUTS, (value) => {
    if (!isRecord(value)) return { ...DEFAULT_SHORTCUTS }
    const out = { ...DEFAULT_SHORTCUTS }
    for (const k of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
      if (typeof value[k] === 'string') out[k] = value[k]
    }
    return out
  }),
  defaultPage: stringSetting('default_page', '/'),
  examViewMode: stringSetting<ExamViewMode>('exam_view_mode', 'card', (v) => v === 'card' || v === 'sheet' || v === 'spread'),
  sidebarOrder: jsonSetting<SidebarOrder>('sidebar_order', DEFAULT_SIDEBAR_ORDER, (value) => normalizeSidebarOrder(value)),
} as const

export type SettingsStateValues = {
  [K in keyof typeof SETTINGS]: (typeof SETTINGS)[K] extends SettingDef<infer T> ? T : never
}

/**
 * 设置 schema 版本。提升它时必须在 MIGRATIONS 里补一段对应版本的迁移，
 * 否则老用户浏览器里的旧形状会以「读出来形状不对」的形式静默丢设置。
 */
export const SETTINGS_VERSION = 2
const SETTINGS_VERSION_KEY = 'settings_schema_version'

/** 版本号 → 该版本的迁移。入参是可读写的原始 localStorage 快照 */
const MIGRATIONS: Record<number, (raw: Record<string, string>) => void> = {
  // v1 → v2: 快捷键里的 'r' 原属「纠错」，现归「标记问题」；老配置要挪过去
  2: (raw) => {
    const key = SETTINGS.practiceShortcuts.key
    const parsed = parseJson(raw[key] ?? null)
    if (!isRecord(parsed)) return
    if (parsed.markWrong === 'r' && parsed.flagIssue === undefined) {
      raw[key] = JSON.stringify({ ...parsed, markWrong: 'x' })
    }
  },
}

function safeStorage(): Storage | null {
  try {
    // 隐私模式下访问 localStorage 会抛错；设置读不出来应该退回默认值而不是白屏
    return window.localStorage
  } catch {
    return null
  }
}

/** 跑一次版本迁移。幂等：版本号已经是最新的就直接返回。 */
export function runSettingsMigrations(): void {
  const store = safeStorage()
  if (!store) return
  const current = Number(store.getItem(SETTINGS_VERSION_KEY) ?? '1')
  if (!Number.isFinite(current) || current >= SETTINGS_VERSION) return

  const raw: Record<string, string> = {}
  for (const def of Object.values(SETTINGS)) {
    const v = store.getItem(def.key)
    if (v !== null) raw[def.key] = v
  }
  for (let v = Math.max(current, 1) + 1; v <= SETTINGS_VERSION; v++) {
    MIGRATIONS[v]?.(raw)
  }
  for (const [key, value] of Object.entries(raw)) store.setItem(key, value)
  store.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION))
}

export function readSetting<T>(def: SettingDef<T>): T {
  const store = safeStorage()
  if (!store) return def.fallback
  try {
    return def.read(store.getItem(def.key))
  } catch {
    return def.fallback
  }
}

export function writeSetting<T>(def: SettingDef<T>, value: T): void {
  const store = safeStorage()
  if (!store) return
  try {
    store.setItem(def.key, def.write(value))
  } catch {
    // 配额满或被禁用：内存里的状态仍然生效，不应该把操作整个打断
  }
}

/** 一次性读出全部设置，作为 store 的初始状态 */
export function readAllSettings(): SettingsStateValues {
  runSettingsMigrations()
  const out = {} as Record<string, unknown>
  for (const [name, def] of Object.entries(SETTINGS)) {
    out[name] = readSetting(def as SettingDef<unknown>)
  }
  return out as SettingsStateValues
}
