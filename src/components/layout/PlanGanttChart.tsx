import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from 'echarts'
import echarts from '@/lib/echarts'
import { useChartPalette, withAlpha } from '@/lib/chart-theme'
import type { PlanMilestoneProgress, PlanSubjectProgress, PlanTargetGroup } from '@/hooks/use-plan-completion'
import { useT } from '@/i18n/use-t'

const DAY = 86400000
const BAR_H = 10
/** 图表上方留给"旗帜"的高度 */
const FLAG_ZONE = 30
/** 左侧 y 轴(学科)区宽度, 导出给旗杆轨道对齐用 */
export const GANTT_LEFT = 64
export const GANTT_RIGHT = 46

export const CUSTOM_PINK = '#ec4899'

function parseDay(s: string): number {
  return new Date(`${s}T00:00:00`).getTime()
}

function todayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function mmdd(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type BarDatum = {
  value: [number, number, number, number, number]
  color: string
  soft: string
  done: number
  total: number
  selected?: boolean
  milestoneId?: string
  tip: string
}

type FlagDatum = {
  value: [number]
  color: string
  label: string
  showLabel: boolean
  milestoneId: string
  tip: string
}

interface Props {
  mode: 'long-term' | 'custom'
  milestones?: PlanMilestoneProgress[]
  planDeadline?: string | null
  longTerm?: PlanSubjectProgress[]
  targets?: PlanTargetGroup[]
  selectedMilestoneId?: string | null
  onSelectMilestone?: (id: string) => void
  height?: number
}

export function PlanGanttChart({
  mode,
  milestones = [],
  planDeadline = null,
  longTerm = [],
  targets = [],
  selectedMilestoneId = null,
  onSelectMilestone,
  height,
}: Props) {
  const pal = useChartPalette()
  const { t } = useT()

  const model = useMemo(() => {
    const today = todayStart()

    if (mode === 'custom') {
      const rows: string[] = []
      const seen = new Set<string>()
      for (const g of targets) {
        for (const s of g.subjects) {
          if (s.subject && !seen.has(s.subject)) { seen.add(s.subject); rows.push(s.subject) }
        }
      }
      const rowIndex = new Map(rows.map((s, i) => [s, i]))
      const bars: BarDatum[] = []
      const lines: number[] = []
      for (const g of targets) {
        const end = g.deadline ? parseDay(g.deadline) : today + DAY
        if (g.deadline) lines.push(parseDay(g.deadline))
        for (const s of g.subjects) {
          const row = rowIndex.get(s.subject)
          if (row === undefined) continue
          bars.push({
            value: [row, today, end, s.done, s.count],
            color: CUSTOM_PINK,
            soft: withAlpha(CUSTOM_PINK, 0.18),
            done: s.done,
            total: s.count,
            tip: `${s.subject} · ${t('plan.today')} ${s.done}/${s.count}${t('plan.questions')}${g.deadline ? ` · ${t('plan.deadline')} ${g.deadline}` : ''}`,
          })
        }
      }
      return {
        rows,
        bars,
        flags: [] as FlagDatum[],
        lines,
        start: today - 2 * DAY,
        end: Math.max(today + 7 * DAY, ...lines, 0),
      }
    }

    // 长期计划: 一个里程碑 = 一段时间窗; 学科为行, 画"窗口内已刷轮数/目标轮数"
    const rows: string[] = []
    const seen = new Set<string>()
    const push = (s: string) => { if (s && !seen.has(s)) { seen.add(s); rows.push(s) } }
    longTerm.forEach((r) => push(r.subject))
    milestones.forEach((m) => m.subjects.forEach((s) => push(s.subject)))
    // 只保留真正有里程碑窗口的学科, 避免出现一排没内容的空行
    const hasBars = new Set<string>()
    milestones.forEach((m) => m.subjects.forEach((s) => hasBars.add(s.subject)))
    const barRows = rows.filter((s) => hasBars.has(s))
    const rowIndex = new Map(barRows.map((s, i) => [s, i]))

    const deadlineDays = milestones.map((m) => parseDay(m.deadline))
    const earliest = Math.min(today, ...deadlineDays)
    const latest = Math.max(today + 7 * DAY, planDeadline ? parseDay(planDeadline) : 0, ...deadlineDays)
    // 两侧留一点余量: 否则第一个里程碑(窗口从"计划起点"开始)会贴在最左边、宽度为 0
    const start = earliest - 10 * DAY
    const end = latest + 10 * DAY

    const bars: BarDatum[] = []
    const flags: FlagDatum[] = []
    const currentId = milestones.find((m) => m.progress < 1 && !m.passed)?.id
    milestones.forEach((m, i) => {
      const mEnd = parseDay(m.deadline)
      const prevEnd = i > 0 ? parseDay(milestones[i - 1].deadline) : null
      const mStart = prevEnd === null ? start : prevEnd + DAY
      const gap = prevEnd === null ? 100 : ((mEnd - prevEnd) / (end - start)) * 100
      const color = m.progress >= 1 ? pal.correct : m.passed ? pal.wrong : currentId === m.id ? pal.brand : pal.label
      flags.push({
        value: [mEnd],
        color,
        label: mmdd(mEnd),
        showLabel: gap >= 4,
        milestoneId: m.id,
        tip: `${t('plan.milestone')} ${i + 1} · ${m.deadline} · ${m.doneRounds}/${m.totalRounds} ${t('plan.roundsUnit')}`,
      })
      for (const s of m.subjects) {
        const row = rowIndex.get(s.subject)
        if (row === undefined) continue
        bars.push({
          value: [row, mStart, mEnd, s.roundsDone, s.rounds],
          color,
          soft: withAlpha(color, 0.18),
          done: s.roundsDone,
          total: s.rounds,
          selected: selectedMilestoneId === m.id,
          milestoneId: m.id,
          tip: `${s.subject} · ${t('plan.milestone')} ${i + 1} (${mmdd(mStart)} → ${mmdd(mEnd)}) · ${s.roundsDone}/${s.rounds} ${t('plan.roundsUnit')}`,
        })
      }
    })
    return { rows: barRows, bars, flags, lines: deadlineDays, start, end }
  }, [mode, milestones, planDeadline, longTerm, targets, selectedMilestoneId, pal, t])

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
      const ratio = data.total > 0 ? Math.min(data.done / data.total, 1) : 0
      const children: unknown[] = [
        { type: 'rect', shape: { x, y, width: w, height: BAR_H, r: 3 }, style: { fill: data.soft } },
      ]
      if (ratio > 0) {
        children.push({ type: 'rect', shape: { x, y, width: Math.max(w * ratio, 3), height: BAR_H, r: 3 }, style: { fill: data.color } })
      }
      if (data.selected) {
        children.push({
          type: 'rect',
          shape: { x: x - 1.5, y: y - 1.5, width: w + 3, height: BAR_H + 3, r: 5 },
          style: { fill: 'transparent', stroke: data.color, lineWidth: 1.5 },
        })
      }
      children.push({
        type: 'text',
        style: {
          text: `${data.done}/${data.total}`,
          x: x + w + 5,
          y: y + BAR_H / 2,
          textAlign: 'left',
          textVerticalAlign: 'middle',
          fill: pal.label,
          fontSize: 10,
        },
      })
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
      if (data.showLabel) {
        children.push({
          type: 'text',
          style: { text: data.label, x: x + 12, y: top + 4.5, textAlign: 'left', textVerticalAlign: 'middle', fill: pal.label, fontSize: 9 },
        })
      }
      return { type: 'group', children } as never
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: GANTT_LEFT, right: GANTT_RIGHT, top: FLAG_ZONE, bottom: 4, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 11 },
        formatter: (p: { data?: { tip?: string } }) => p?.data?.tip ?? '',
      },
      xAxis: {
        type: 'time',
        min: start,
        max: end,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { color: pal.label, fontSize: 10, hideOverlap: true, formatter: (v: number) => mmdd(v) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: rows,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: pal.label, fontSize: 11, width: GANTT_LEFT - 10, overflow: 'truncate' },
      },
      series: [
        {
          type: 'line',
          data: [],
          silent: true,
          markLine: {
            silent: true,
            symbol: 'none',
            data: lines.map((d) => ({
              xAxis: d,
              lineStyle: { color: withAlpha(pal.brand, 0.35), type: 'dashed', width: 1 },
            })),
          },
        },
        { type: 'custom', renderItem: barRenderer, encode: { x: [1, 2], y: 0 }, data: bars, z: 3 },
        { type: 'custom', renderItem: flagRenderer, encode: { x: 0 }, data: flags, z: 5 },
      ],
    }
  }, [model, pal])

  if (model.rows.length === 0) return null

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height: height ?? Math.max(150, FLAG_ZONE + 26 + model.rows.length * 26), width: '100%' }}
      onEvents={{
        click: (p: { data?: { milestoneId?: string } }) => {
          const id = p?.data?.milestoneId
          if (id && onSelectMilestone) onSelectMilestone(id)
        },
      }}
    />
  )
}