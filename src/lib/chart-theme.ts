import { useMemo } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useSettingsStore } from '@/stores/settings-store'

export interface ChartPalette {
  isDark: boolean
  /** 主色 / 进行中 / 蓝色系 */
  brand: string
  /** 正确 / 上升 / 绿 */
  correct: string
  /** 错误 / 下降 / 红 */
  wrong: string
  /** 警示 / 目标线 / 琥珀 */
  warn: string
  /** 主文字 */
  ink: string
  /** 轴标签 / 次要文字 */
  label: string
  /** 网格线 / 分隔线 */
  line: string
  /** tooltip 等浮层面板底色 */
  panel: string
  panelLine: string
}

const FALLBACK: ChartPalette = {
  isDark: false,
  brand: '#2563eb',
  correct: '#16a34a',
  wrong: '#dc2626',
  warn: '#d97706',
  ink: '#0f172a',
  label: '#64748b',
  line: 'rgba(15,23,42,.1)',
  panel: '#ffffff',
  panelLine: '#e2e8f0',
}

function readVar(name: string): string {
  if (typeof document === 'undefined') return ''
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || ''
}

/** 读取当前主题(浅色/深色/护眼色板)下的图表语义色。渲染时调用,可传给 echarts option。 */
export function getChartPalette(): ChartPalette {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const pick = (name: keyof ChartPalette): string => {
    const cssName =
      name === 'isDark'
        ? ''
        : `--chart-${name === 'panelLine' ? 'panel-line' : name}`
    const v = cssName ? readVar(cssName) : ''
    return v || (FALLBACK[name] as string)
  }
  return {
    isDark,
    brand: pick('brand'),
    correct: pick('correct'),
    wrong: pick('wrong'),
    warn: pick('warn'),
    ink: pick('ink'),
    label: pick('label'),
    line: pick('line'),
    panel: pick('panel'),
    panelLine: pick('panelLine'),
  }
}

/** React hook:主题或护眼色板变化时自动返回最新的图表调色板 */
export function useChartPalette(): ChartPalette {
  const theme = useThemeStore((s) => s.theme)
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  return useMemo(() => getChartPalette(), [theme, eyeCare])
}

/** 多系列分类色(环形/堆叠/旭日共用);深浅模式下均保持可辨识 */
export const CATEGORY_COLORS = [
  '#4f8ef7',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#fb923c',
  '#a3e635',
]

export function toRgb(hex: string): [number, number, number] {
  const s = (hex || '').trim().replace('#', '')
  if (!s) return [0, 0, 0]
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** t=0 → a,t=1 → b 的线性插值色;返回 rgb() 字符串 */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a)
  const [br, bg, bb] = toRgb(b)
  const k = Math.min(Math.max(t, 0), 1)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k)
  return `rgb(${mix(ar, br)},${mix(ag, bg)},${mix(ab, bb)})`
}

/** 把 hex 转为带透明度字符串(仅 hex 输入) */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
