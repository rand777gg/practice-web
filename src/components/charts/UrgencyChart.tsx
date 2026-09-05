import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useChartPalette } from '@/lib/chart-theme'
import type { SubjectUrgency } from '@/lib/ai/ebbinghaus'

interface Props {
  urgency: SubjectUrgency[]
}

// 紧急度三档色(低→高):青 → 靛 → 紫,超阈值回落红色警示
const URGENCY_COLORS = [
  { lt: 30, color: '#22d3ee' },
  { lt: 60, color: '#6366f1' },
  { lt: 100, color: '#8b5cf6' },
]

export function UrgencyChart({ urgency }: Props) {
  const pal = useChartPalette()
  const textColor = pal.ink

  if (!urgency.length) return null

  const sorted = [...urgency].reverse()

  function getColor(score: number) {
    for (const { lt, color } of URGENCY_COLORS) {
      if (score <= lt) return color
    }
    return '#f87171'
  }

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: pal.panel,
      borderColor: pal.panelLine,
      textStyle: { color: textColor, fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) => {
        const name = params[0]?.name
        const d = urgency.find(u => u.subject === name)
        if (!d) return ''
        return `<b>${d.subject}</b><br/>
          紧急度: ${d.urgency}<br/>
          错误率: ${Math.round(d.errorRate * 100)}%<br/>
          距上次复习: ${d.daysSinceReview}天<br/>
          待复习: ${d.reviewQueue}/${d.totalQuestions}`
      },
    },
    title: {
      text: '学科紧急度',
      left: 'center',
      top: 0,
      textStyle: { color: pal.brand, fontSize: 12, fontWeight: 'normal' },
    },
    grid: { top: 24, right: 30, bottom: 20, left: 8 },
    xAxis: {
      type: 'value' as const,
      max: 100,
      axisLabel: { fontSize: 10, color: textColor, formatter: '{value}' },
      splitLine: { lineStyle: { color: pal.line } },
    },
    yAxis: {
      type: 'category' as const,
      data: sorted.map(s => s.subject),
      axisLabel: { fontSize: 10, color: textColor, width: 60, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: sorted.map(s => ({
        value: s.urgency,
        itemStyle: {
          color: getColor(s.urgency),
          borderRadius: [0, 6, 6, 0],
        },
      })),
      barWidth: 12,
      label: {
        show: true,
        position: 'right' as const,
        fontSize: 10,
        color: textColor,
        formatter: '{c}',
      },
    }],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: Math.max(120, urgency.length * 34) }} />
}
