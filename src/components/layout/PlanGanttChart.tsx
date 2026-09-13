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
/** 底部 dataZoom 滑块占的高度 */
const ZOOM_H = 26
/** 左侧 y 轴(学科)区宽度 */
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
    // 行 = 学科 × 里程碑(自定义计划里 = 学科 × 目标组): 同一学科的每一轮单独一行, 不叠在一起
    const rows: string[] = []
    const rowIndex = new Map<string, number>()

    if (mode === 'custom') {
      const order: string[] = []
      const seen = new Set<string>()
      for (const g of targets) {
        for (const s of g.subjects) {
          if (s.subject && !seen.has(s.subject)) { seen.add(s.subject); order.push(s.subject) }
        }
      }
      order.forEach((subject, gi) => {
        const group = targets.find((g) => g.subjects.some((s) => s.subject === subject))
        rowIndex.set(`${subject}|${gi}`, rows.length)
        rows.push(rows.length === 0 || rows[rows.length - 1] !== subject ? subject : '')
        void group
      })
      const bars: BarDatum[] = []
      const lines: number[] = []
      targets.forEach((g, gi) => {
        const end = g.deadline ? parseDay(g.deadline) : today + DAY
        if (g.deadline) lines.push(parseDay(g.deadline))
        for (const s of g.subjects) {
          const key = `${s.subject}|${order.indexOf(s.subject)}`
          const row = rowIndex.get(key)
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
        void gi
      })
      return {
        rows,
        bars,
        flags: [] as FlagDatum[],
        lines,
        start: today - 2 * DAY,
        end: Math.max(today + 7 * DAY, ...lines, 0),
      }
    }

    // 学科顺序: 长期计划里的学科优先, 其次是只在里程碑里出现的学科
    const subjectOrder: string[] = []
    const seenSubject = new Set<string>()
    const pushSubject = (s: string) => {
      if (s && !seenSubject.has(s)) { seenSubject.add(s); subjectOrder.push(s) }
    }
    longTerm.forEach((r) => pushSubject(r.subject))
    milestones.forEach((m) => m.subjects.forEach((s) => pushSubject(s.subject)))

    for (const subject of subjectOrder) {
      let first = true
      milestones.forEach((m, mi) => {
        if (!m.subjects.some((s) => s.subject === subject)) return
        rowIndex.set(`${subject}|${m.id}`, rows.length)
        // 同一学科的第一行写学科名, 之后的每一轮单独成行并用 (序号) 续行 — 不再堆在一行
        rows.push(first ? subject : `(${mi + 1})`)
        first = false
      })
    }

    const deadlineDays = milestones.map((m) => parseDay(m.deadline))
    const startDays = milestones.map((m) => (m.start ? parseDay(m.start) : NaN)).filter((n) => Number.isFinite(n))
    const earliest = Math.min(today, ...deadlineDays, ...startDays)
    const latest = Math.max(today + 7 * DAY, planDeadline ? parseDay(planDeadline) : 0, ...deadlineDays)
    const start = earliest - 10 * DAY
    const end = latest + 10 * DAY

    const bars: BarDatum[] = []
    const flags: FlagDatum[] = []
    const currentId = milestones.find((m) => m.progress < 1 && !m.passed)?.id
    milestones.forEach((m, i) => {
      const mEnd = parseDay(m.deadline)
      // 里程碑自带时间窗; 没填 start 时回退到"上一个里程碑的次日"
      const mStart = m.start
        ? parseDay(m.start)
        : i > 0 ? parseDay(milestones[i - 1].deadline) + DAY : start
      const prevEnd = m.start ? parseDay(m.start) - DAY : (i > 0 ? parseDay(milestones[i - 1].deadline) : null)
      const gap = prevEnd === null ? 100 : ((mEnd - prevEnd) / (end - start)) * 100
      const color = m.progress >= 1 ? pal.correct : m.passed ? pal.wrong : currentId === m.id ? pal.brand : pal.label
      flags.push({
        value: [mEnd],
        color,
        label: dayLabel(mEnd),
        showLabel: gap >= 6,
        milestoneId: m.id,
        tip: `${t('plan.milestone')} ${i + 1} · ${m.deadline} · ${m.doneRounds}/${m.totalRounds} ${t('plan.roundsUnit')}`,
      })
      for (const s of m.subjects) {
        const row = rowIndex.get(`${s.subject}|${m.id}`)
        if (row === undefined) continue
        bars.push({
          value: [row, mStart, mEnd, s.roundsDone, s.rounds],
          color,
          soft: withAlpha(color, 0.18),
          done: s.roundsDone,
          total: s.rounds,
          selected: selectedMilestoneId === m.id,
          milestoneId: m.id,
          tip: `${s.subject} · ${t('plan.milestone')} ${i + 1} (${dayLabel(mStart)} → ${dayLabel(mEnd)}) · ${s.roundsDone}/${s.rounds} ${t('plan.roundsUnit')}`,
        })
      }
    })
    return { rows, bars, flags, lines: deadlineDays, start, end }
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
          fillerColor: withAlpha(pal.brand, 0.14),
          handleStyle: { color: pal.brand, borderColor: pal.brand },
          moveHandleStyle: { color: withAlpha(pal.brand, 0.5) },
          dataBackground: { lineStyle: { color: pal.line }, areaStyle: { color: withAlpha(pal.brand, 0.06) } },
          selectedDataBackground: { lineStyle: { color: pal.brand }, areaStyle: { color: withAlpha(pal.brand, 0.16) } },
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
      style={{ height: height ?? Math.max(170, FLAG_ZONE + ZOOM_H + 20 + model.rows.length * 26), width: '100%' }}
      onEvents={{
        click: (p: { data?: { milestoneId?: string } }) => {
          const id = p?.data?.milestoneId
          if (id && onSelectMilestone) onSelectMilestone(id)
        },
      }}
    />
  )
}