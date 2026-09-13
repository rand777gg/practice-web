/**
 * 插件目录 —— 平台的可选能力都登记在这里。
 *
 * 加一个插件只需要:在 PLUGIN_DEFS 里加一条 + 写运行时代码(如果是挂全站的,在 AppLayout 里挂上)。
 * 开关与配置存在 public.user_plugins(每个用户一份),页面会自动按这份目录渲染卡片。
 */

export type PluginCategory = 'focus' | 'study' | 'data'

export interface PluginOption {
  key: string
  labelZh: string
  labelEn: string
  type: 'number' | 'boolean'
  default: number | boolean
  min?: number
  max?: number
  unitZh?: string
  unitEn?: string
}

export interface PluginDef {
  id: string
  nameZh: string
  nameEn: string
  descZh: string
  descEn: string
  category: PluginCategory
  version: string
  /** 启用后出现在哪里 —— 装之前让人知道它会做什么 */
  mountZh: string
  mountEn: string
  options: PluginOption[]
}

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, { zh: string; en: string }> = {
  focus: { zh: '专注与休息', en: 'Focus & rest' },
  study: { zh: '学习辅助', en: 'Study aids' },
  data: { zh: '数据与导出', en: 'Data & export' },
}

export const PLUGIN_DEFS: PluginDef[] = [
  {
    id: 'eye-rest',
    nameZh: '20-20-20 护眼提醒',
    nameEn: '20-20-20 eye rest',
    descZh:
      '连续刷题到你设定的时长后，弹一次全屏休息提示：看向 6 米外约 20 秒。切到别的标签页时不计时，考试中默认不打扰。',
    descEn:
      'After a set stretch of practice, a full-screen prompt asks you to look at something ~6 m away for about 20 seconds. Other tabs do not count, and exams stay quiet by default.',
    category: 'focus',
    version: '1.0.0',
    mountZh: '全站生效：刷题、题库、数据中心都会走到',
    mountEn: 'App-wide: practice, question bank and Data Center',
    options: [
      { key: 'interval_min', labelZh: '提醒间隔', labelEn: 'Interval', type: 'number', default: 20, min: 1, max: 180, unitZh: '分钟', unitEn: 'min' },
      { key: 'break_sec', labelZh: '休息时长', labelEn: 'Break length', type: 'number', default: 20, min: 5, max: 300, unitZh: '秒', unitEn: 's' },
      { key: 'skip_in_exam', labelZh: '考试中不提醒', labelEn: 'Stay quiet during an exam', type: 'boolean', default: true },
    ],
  },
]

export function getPluginDef(id: string): PluginDef | undefined {
  return PLUGIN_DEFS.find((def) => def.id === id)
}

/** 目录里的默认配置 —— 库里没存过的项用它兜底 */
export function pluginDefaults(id: string): Record<string, number | boolean> {
  const def = getPluginDef(id)
  if (!def) return {}
  return Object.fromEntries(def.options.map((opt) => [opt.key, opt.default]))
}
