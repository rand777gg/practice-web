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
  '#f0a5b5', '#a8d8ea', '#c3b1e1', '#ffe5b4', '#b5ead7',
  '#ffccd5', '#b8e0f7', '#d5c6e0', '#fff0c8', '#c7f0d8',
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
        top: 0,
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
      ],
      grid: {
        left: '3%',
        right: '4%',
        bottom: 44,
        top: 36,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: dateLabels,
        axisLabel: { color: textColor, fontSize: 10 },
        axisTick: { alignWithLabel: true },
      },
      yAxis: [
        {
          type: 'value' as const,
          axisLabel: { color: textColor, fontSize: 10 },
          splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
          name: '答题数',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
        },
        {
          type: 'value' as const,
          min: 0,
          max: 100,
          axisLabel: { color: mutedColor, fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false },
          name: '正确率',
          nameTextStyle: { color: mutedColor, fontSize: 10 },
        },
      ],
      series: [
        ...subjects.map((subject, i) => ({
          name: subject,
          type: 'bar' as const,
          stack: 'subjects',
          barWidth: '25%',
          emphasis: { focus: 'series' as const },
          data: data.map((d) => d[subject] ?? 0),
          itemStyle: { color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
        })),
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
        {
          name: '正确率',
          type: 'line' as const,
          yAxisIndex: 1,
          data: dates.map((d) => {
            const b = barData.find((x) => x.date === d)
            if (!b) return null
            const total = b.correct + b.wrong
            return total > 0 ? Math.round((b.correct / total) * 100) : null
          }),
          smooth: true,
          lineStyle: { color: '#06b6d4', type: 'solid' as const, width: 2 },
          itemStyle: { color: '#06b6d4' },
          symbol: 'circle',
          symbolSize: 4,
          z: 10,
        },
      ],
    }
  }, [dates, subjects, data, barData, isDark, textColor, mutedColor])

  return (
    <div className="overflow-x-auto">
      <ReactECharts option={option} style={{ height: 420, minWidth: 600 }} />
    </div>
  )
}
