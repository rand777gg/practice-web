import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  dates: string[]
  subjects: string[]
  data: Record<string, number>[] // data[i][subject] = count
  barData: { date: string; correct: number; wrong: number }[]
}

const SUBJECT_COLORS = [
  '#c8514a', '#e8a660', '#6b8e6b', '#a38d6d', '#d4915c',
  '#8b5e3c', '#c27a5c', '#5a7a6e', '#d4a76e', '#b55a4e',
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
        backgroundColor: isDark ? '#1e293b' : '#faf8f5',
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
          barCategoryGap: '0%',
          barGap: '0%',
          emphasis: { focus: 'series' as const },
          data: data.map((d) => d[subject] ?? 0),
          itemStyle: { color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
        })),
        {
          name: '正确率',
          type: 'bar' as const,
          yAxisIndex: 1,
          barCategoryGap: '0%',
          barGap: '0%',
          data: dates.map((d) => {
            const b = barData.find((x) => x.date === d)
            if (!b) return null
            const total = b.correct + b.wrong
            return total > 0 ? Math.round((b.correct / total) * 100) : null
          }),
          itemStyle: { color: '#06b6d4' },
          emphasis: { focus: 'series' as const },
        },
      ],
    }
  }, [dates, subjects, data, barData, isDark, textColor, mutedColor])

  return (
    <ScrollArea scrollbars="horizontal">
      <ReactECharts option={option} style={{ height: 420, minWidth: 600 }} />
    </ScrollArea>
  )
}
