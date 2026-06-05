import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  total: number
  correct: number
}

export function CorrectRateChart({ total, correct }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0

  const option = {
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      center: ['50%', '55%'],
      radius: '90%',
      min: 0,
      max: 100,
      axisLine: {
        show: true,
        lineStyle: { width: 16, color: [[rate / 100, '#22c55e'], [1, theme === 'dark' ? '#374151' : '#e5e7eb']] },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: true,
        fontSize: 28,
        fontWeight: 'bold',
        color: theme === 'dark' ? '#f3f4f6' : '#1f2937',
        offsetCenter: [0, '60%'],
        formatter: '{value}%',
      },
      data: [{ value: rate }],
    }],
  }

  return <ReactECharts option={option} style={{ height: 200 }} />
}
