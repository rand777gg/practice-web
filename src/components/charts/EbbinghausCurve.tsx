import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useThemeStore } from '@/stores/theme-store'
import type { ForgettingCurvePoint } from '@/lib/ai/ebbinghaus'

interface Props {
  curve: ForgettingCurvePoint[]
}

export function EbbinghausCurve({ curve }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  if (!curve.length) return null

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1e293b' : '#fff',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      textStyle: { color: textColor, fontSize: 11 },
    },
    title: {
      text: '记忆留存趋势',
      left: 'center',
      top: 0,
      textStyle: { color: '#22d3ee', fontSize: 12, fontWeight: 'normal' },
    },
    legend: {
      data: ['记忆留存率', '临界复习题数'],
      bottom: 0,
      textStyle: { color: textColor, fontSize: 10 },
    },
    grid: { top: 28, right: 50, bottom: 32, left: 44 },
    xAxis: {
      type: 'category' as const,
      data: curve.map(p => `第${p.day}天`),
      axisLabel: { fontSize: 10, color: textColor },
      axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } },
    },
    yAxis: [
      {
        type: 'value' as const,
        name: '留存率 %',
        min: 0,
        max: 100,
        axisLabel: { fontSize: 10, color: textColor, formatter: '{value}%' },
        splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
      },
      {
        type: 'value' as const,
        name: '题数',
        axisLabel: { fontSize: 10, color: textColor },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '记忆留存率',
        type: 'line',
        smooth: true,
        data: curve.map(p => p.retention),
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.2)' },
              { offset: 1, color: 'rgba(59,130,246,0.02)' },
            ],
          },
        },
      },
      {
        name: '临界复习题数',
        type: 'bar',
        yAxisIndex: 1,
        data: curve.map(p => p.atRisk),
        barWidth: 14,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#06b6d4' },
              { offset: 1, color: '#3b82f6' },
            ],
          },
        },
      },
    ],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 220 }} />
}
