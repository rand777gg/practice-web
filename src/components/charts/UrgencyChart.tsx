import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'
import type { SubjectUrgency } from '@/lib/ai/ebbinghaus'

interface Props {
  urgency: SubjectUrgency[]
}

const URGENCY_COLORS = [
  { lt: 30, color: '#22c55e' },
  { lt: 60, color: '#f59e0b' },
  { lt: 100, color: '#ef4444' },
]

export function UrgencyChart({ urgency }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  if (!urgency.length) return null

  const sorted = [...urgency].reverse()

  function getColor(score: number) {
    for (const { lt, color } of URGENCY_COLORS) {
      if (score <= lt) return color
    }
    return '#ef4444'
  }

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1e293b' : '#fff',
      borderColor: isDark ? '#334155' : '#e2e8f0',
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
    grid: { top: 4, right: 30, bottom: 20, left: 8 },
    xAxis: {
      type: 'value' as const,
      max: 100,
      axisLabel: { fontSize: 10, color: textColor, formatter: '{value}' },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
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

  return <ReactECharts option={option} style={{ height: Math.max(120, urgency.length * 34) }} />
}
