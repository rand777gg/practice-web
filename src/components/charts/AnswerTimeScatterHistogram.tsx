import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  dates: string[]
  subjects: string[]
  data: Record<string, number>[] // data[i][subject] = count
  barData: { date: string; correct: number; wrong: number }[]
}

const SUBJECT_COLORS = [
  '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899',
  '#f97316', '#6366f1', '#14b8a6', '#a855f7', '#84cc16',
]

export function AnswerTimeScatterHistogram({ dates, subjects, data, barData }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const mutedColor = isDark ? '#9ca3af' : '#6b7280'

  const option = useMemo(() => {
    const dateLabels = dates.map((d) => {
      const parts = d.split('-')
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`
    })

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
      },
      legend: {
        bottom: 0,
        orient: 'horizontal' as const,
        textStyle: { color: textColor, fontSize: 10 },
        type: 'scroll' as const,
      },
      toolbox: {
        right: 0,
        top: -4,
        feature: {
          dataZoom: { title: { zoom: '', back: '' } },
          restore: { title: '' },
        },
        iconStyle: { borderColor: mutedColor },
      },
      dataZoom: [
        { type: 'inside' as const },
        { type: 'slider' as const, bottom: 0, height: 16, borderColor: 'transparent' },
      ],
      grid: {
        left: '3%',
        right: '4%',
        bottom: 52,
        top: 16,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: dateLabels,
        axisLabel: { color: textColor, fontSize: 10 },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
        name: '答题数',
        nameTextStyle: { color: mutedColor, fontSize: 10 },
      },
      series: [
        // Subject stack
        ...subjects.map((subject, i) => ({
          name: subject,
          type: 'bar' as const,
          stack: 'subjects',
          barWidth: '25%',
          emphasis: { focus: 'series' as const },
          data: data.map((d) => d[subject] ?? 0),
          itemStyle: { color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
        })),
        // Correct / Wrong stack
        {
          name: '正确',
          type: 'bar' as const,
          stack: 'cw',
          barWidth: '25%',
          data: dates.map((d) => barData.find((b) => b.date === d)?.correct ?? 0),
          itemStyle: { color: '#22c55e' },
          emphasis: { focus: 'series' as const },
        },
        {
          name: '错误',
          type: 'bar' as const,
          stack: 'cw',
          barWidth: '25%',
          data: dates.map((d) => barData.find((b) => b.date === d)?.wrong ?? 0),
          itemStyle: { color: '#ef4444' },
          emphasis: { focus: 'series' as const },
        },
      ],
    }
  }, [dates, subjects, data, barData, isDark, textColor, mutedColor])

  return <ReactECharts option={option} style={{ height: 420 }} />
}
