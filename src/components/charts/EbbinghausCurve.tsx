import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useChartPalette, withAlpha } from '@/lib/chart-theme'
import type { ForgettingCurvePoint } from '@/lib/ai/ebbinghaus'

interface Props {
  curve: ForgettingCurvePoint[]
}

export function EbbinghausCurve({ curve }: Props) {
  const pal = useChartPalette()
  const textColor = pal.ink

  if (!curve.length) return null

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: pal.panel,
      borderColor: pal.panelLine,
      textStyle: { color: textColor, fontSize: 11 },
    },
    title: {
      text: '记忆留存趋势',
      left: 'center',
      top: 0,
      textStyle: { color: pal.brand, fontSize: 12, fontWeight: 'normal' },
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
      axisLine: { lineStyle: { color: pal.line } },
    },
    yAxis: [
      {
        type: 'value' as const,
        name: '留存率 %',
        min: 0,
        max: 100,
        axisLabel: { fontSize: 10, color: textColor, formatter: '{value}%' },
        splitLine: { lineStyle: { color: pal.line } },
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
        lineStyle: { color: pal.brand, width: 2 },
        itemStyle: { color: pal.brand },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(pal.brand, 0.2) },
              { offset: 1, color: withAlpha(pal.brand, 0.02) },
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
          color: pal.warn,
        },
      },
    ],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 220 }} />
}
