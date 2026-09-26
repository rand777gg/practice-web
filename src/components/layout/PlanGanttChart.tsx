import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from 'echarts'
import echarts from '@/lib/echarts'
import { useChartPalette, withAlpha } from '@/lib/chart-theme'
import { pickVisibleItems } from '@/hooks/use-plan-completion'
import type { PlanItem } from '@/hooks/use-plan-completion'
import { useT } from '@/i18n/use-t'

const DAY = 86400000
const BAR_H = 10
/** 图表上方留给"旗帜"的高度 */
const FLAG_ZONE = 30
/** 底部 dataZoom 滑块占的高度 */
const ZOOM_H = 26
/** 左侧 y 轴(学科)区宽度 */
export const GANTT_LEFT = 64
export const GANTT_RIGHT = 46
// 配色常量搬去了 ./plan-chart-tokens —— 这个模块要被懒加载，而调用方静态 import 那两个值，
// 留在本文件里会让 echarts 继续留在入口 chunk（见那个文件的注释）。这里不再转出它们，
// 转出等于留着同一个坑。

function parseDay(s: string): number {
  return new Date(`${s}T00:00:00`).getTime()
}

function todayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

type BarDatum = {
  value: [number, number, number, number, number]
  color: string
  soft: string
  done: number
  total: number
  label: string
  selected?: boolean
  itemId?: string
  tip: string
}

type FlagDatum = {
  value: [number]
  color: string
  label: string
  itemId?: string
  tip: string
}

interface Props {
  /** 长期计划的一轮 / 自定义计划的一批, 画法完全一样, 只有颜色和行标签单位不同 */
  items: PlanItem[]
  color: string
  /** 行标签用的单位, 如 "轮" / "批" */
  unit: string
  planDeadline?: string | null
  selectedId?: string | null
  onSelect?: (id: string) => void
  height?: number
}

export function PlanGanttChart({
  items,
  color: baseColor,
  unit,
  planDeadline = null,
  selectedId = null,
  onSelect,
  height,
}: Props) {
  const pal = useChartPalette()
  const { t } = useT()

  const model = useMemo(() => {
    const today = todayStart()
    // 一圈一行。条形左端 = 这一轮的起始日(没设过就退回创建这条的那天 / 上一条实际完成日),
    // 右端 = 目标完成日, 旗子插在实际刷够的那天。
    const bySubject = new Map<string, PlanItem[]>()
    for (const it of items) {
      const list = bySubject.get(it.subject)
      if (list) list.push(it)
      else bySubject.set(it.subject, [it])
    }

    const visible = pickVisibleItems(items)
    const rows: string[] = []
    const rowIndex = new Map<string, number>()
    const barStart = new Map<string, number>()
    const barEnd = new Map<string, number>()
    let lastSubject = ''
    for (const it of visible) {
      rowIndex.set(it.id, rows.length)
      rows.push(it.subject === lastSubject
        ? `${t('plan.roundPrefix')}${it.index}${unit}`
        : it.subject)
      lastSubject = it.subject
      const list = bySubject.get(it.subject) ?? []
      const prev = list.find((x) => x.index === it.index - 1)
      const startTs = it.start
        ? parseDay(it.start)
        : prev ? parseDay(prev.doneAt ?? prev.target) : parseDay(it.createdAt)
      const endTs = parseDay(it.target)
      barStart.set(it.id, Math.min(startTs, endTs))
      barEnd.set(it.id, endTs)
    }

    const allStart = [...barStart.values(), today]
    const allEnd = [...barEnd.values(), today, planDeadline ? parseDay(planDeadline) : 0]
    const flags: FlagDatum[] = []
    const bars: BarDatum[] = []
    for (const it of visible) {
      const row = rowIndex.get(it.id)
      if (row === undefined) continue
      const color = it.state === 'done' ? pal.correct
        : it.state === 'overdue' ? pal.wrong
          : it.state === 'current' ? baseColor : pal.label
      const start = barStart.get(it.id)!
      const end = barEnd.get(it.id)!
      const flagTs = parseDay(it.doneAt ?? it.target)
      flags.push({
        value: [flagTs],
        color,
        label: dayLabel(flagTs),
        itemId: it.id,
        tip: `${it.subject} · ${t('plan.roundPrefix')}${it.index}${unit} · ${it.doneAt ? `${t('plan.completedAt')} ${it.doneAt}` : `${t('plan.deadline')} ${it.target}`}`,
      })
      bars.push({
        value: [row, start, end, it.done, it.quantity],
        color,
        soft: withAlpha(color, 0.18),
        done: it.done,
        total: it.quantity,
        label: it.state === 'done' ? '✓' : it.quantity > 0 ? `${it.done}/${it.quantity}` : '',
        selected: selectedId === it.id,
        itemId: it.id,
        tip: `${it.subject} · ${t('plan.roundPrefix')}${it.index}${unit} (${dayLabel(start)} → ${dayLabel(end)}) · ${it.done}/${it.quantity}${t('plan.questions')}${it.doneAt ? ` · ${t('plan.completedAt')} ${it.doneAt}` : ''}`,
      })
    }
    // 时间轴覆盖所有条形 + 今天 + 计划截止日, 两侧各留一周余量
    return {
      rows,
      bars,
      flags,
      lines: [today, ...(planDeadline ? [parseDay(planDeadline)] : [])],
      start: Math.min(...allStart) - 7 * DAY,
      end: Math.max(...allEnd) + 7 * DAY,
    }
  }, [items, baseColor, unit, planDeadline, selectedId, pal, t])

  const option = useMemo(() => {
    const { rows, bars, flags, lines, start, end } = model

    const barRenderer = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
      const data = bars[params.dataIndex]
      if (!data) return undefined
      const row = Number(api.value(0))
      const from = api.coord([Number(api.value(1)), row])
      const to = api.coord([Number(api.value(2)), row])
      const x = from[0]
      const y = from[1] - BAR_H / 2
      const w = Math.max(to[0] - x, 3)
      // 填充的是"实际完成 / 这一轮题量", 不是时间过了多少 —— 条形的长短才是排期窗口
      const pct = data.total > 0 ? Math.min(Math.max(data.done / data.total, 0), 1) : 0
      const doneW = w * pct
      const children: unknown[] = [
        { type: 'rect', shape: { x, y, width: w, height: BAR_H, r: 3 }, style: { fill: data.soft } },
      ]
      if (doneW > 0) {
        children.push({ type: 'rect', shape: { x, y, width: doneW, height: BAR_H, r: 3 }, style: { fill: data.color } })
      }
      if (data.selected) {
        children.push({
          type: 'rect',
          shape: { x: x - 1.5, y: y - 1.5, width: w + 3, height: BAR_H + 3, r: 5 },
          style: { fill: 'transparent', stroke: data.color, lineWidth: 1.5 },
        })
      }
      if (data.label) {
        children.push({
          type: 'text',
          style: {
            text: data.label,
            x: x + w + 5,
            y: y + BAR_H / 2,
            textAlign: 'left',
            textVerticalAlign: 'middle',
            fill: pal.label,
            fontSize: 10,
          },
        })
      }
      return { type: 'group', children } as never
    }

    const flagRenderer = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
      const data = flags[params.dataIndex]
      if (!data) return undefined
      const x = api.coord([Number(api.value(0)), 0])[0]
      const top = 5
      const bottom = FLAG_ZONE - 8
      const children: unknown[] = [
        { type: 'line', shape: { x1: x, y1: top, x2: x, y2: bottom }, style: { stroke: data.color, lineWidth: 1.5 } },
        { type: 'polygon', shape: { points: [[x, top], [x + 9, top + 4.5], [x, top + 9]] }, style: { fill: data.color } },
      ]
      children.push({
        type: 'text',
        style: { text: data.label, x: x + 12, y: top + 4.5, textAlign: 'left', textVerticalAlign: 'middle', fill: pal.label, fontSize: 9 },
      })
      return { type: 'group', children } as never
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: GANTT_LEFT, right: GANTT_RIGHT, top: FLAG_ZONE, bottom: ZOOM_H + 4, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 11 },
        formatter: (p: { data?: { tip?: string } }) => p?.data?.tip ?? '',
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, minValueSpan: 14 * DAY, zoomOnMouseWheel: true, moveOnMouseMove: true },
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 2,
          height: 16,
          showDetail: false,
          brushSelect: false,
          minValueSpan: 14 * DAY,
          borderColor: pal.panelLine,
          backgroundColor: 'transparent',
          fillerColor: withAlpha(baseColor, 0.14),
          handleStyle: { color: baseColor, borderColor: baseColor },
          moveHandleStyle: { color: withAlpha(baseColor, 0.5) },
          dataBackground: { lineStyle: { color: pal.line }, areaStyle: { color: withAlpha(baseColor, 0.06) } },
          selectedDataBackground: { lineStyle: { color: baseColor }, areaStyle: { color: withAlpha(baseColor, 0.16) } },
          textStyle: { color: pal.label, fontSize: 10 },
        },
      ],
      xAxis: {
        type: 'time',
        min: start,
        max: end,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { color: pal.label, fontSize: 10, hideOverlap: true, splitNumber: 5, formatter: (v: number) => dayLabel(v) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: rows,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: pal.label, fontSize: 11, width: GANTT_LEFT - 10, overflow: 'truncate', interval: 0 },
      },
      series: [
        {
          type: 'line',
          data: [],
          silent: true,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: lines.map((d) => ({
              xAxis: d,
              lineStyle: { color: withAlpha(baseColor, 0.35), type: 'dashed', width: 1 },
            })),
          },
        },
        { type: 'custom', renderItem: barRenderer, encode: { x: [1, 2], y: 0 }, data: bars, z: 3 },
        { type: 'custom', renderItem: flagRenderer, encode: { x: 0 }, data: flags, z: 5 },
      ],
    }
  }, [model, pal, baseColor])

  if (model.rows.length === 0) return null

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height: height ?? Math.max(170, FLAG_ZONE + ZOOM_H + 20 + model.rows.length * 26), width: '100%' }}
      onEvents={{
        click: (p: { data?: { itemId?: string } }) => {
          const id = p?.data?.itemId
          if (id && onSelect) onSelect(id)
        },
      }}
    />
  )
}
