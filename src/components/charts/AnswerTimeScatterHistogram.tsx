import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  dates: string[]
  subjects: string[]
  data: Record<string, number>[] // data[i][subject] = count
  barData: { date: string; correct: number; wrong: number }[]
}

const SUBJECT_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#10b981', '#6366f1', '#ec4899', '#14b8a6',
  '#f97316', '#a855f7', '#84cc16', '#64748b',
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

    const dailyTotals = data.map((d) => subjects.reduce((sum, s) => sum + (d[s] ?? 0), 0))
    const activeDays = dailyTotals.filter((v) => v > 0)
    const avgDaily = activeDays.length > 0 ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length) : 0

    return {
      tooltip: {
        trigger: 'axis' as const,
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
      dataZoom: [{ type: 'inside' as const }],
      grid: { left: '3%', right: '5%', bottom: 44, top: 36, containLabel: true },
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
          itemStyle: {
            color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
          },
        })),
        {
          name: '正确率',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#06b6d4', width: 2 },
          itemStyle: { color: '#06b6d4' },
          emphasis: { focus: 'series' as const },
          data: dates.map((d) => {
            const b = barData.find((x) => x.date === d)
            if (!b) return null
            const total = b.correct + b.wrong
            return total > 0 ? Math.round((b.correct / total) * 100) : null
          }),
          z: 10,
        },
        {
          name: '日均',
          type: 'line' as const,
          symbol: 'none',
          lineStyle: { color: isDark ? '#fbbf24' : '#d97706', width: 1.5, type: 'dashed' as const },
          emphasis: { focus: 'series' as const },
          data: dates.map(() => avgDaily),
          z: 5,
        },
      ],
    }
  }, [dates, subjects, data, barData, isDark, textColor, mutedColor])

  return (
    <ScrollArea scrollbars="horizontal">
      <ReactECharts echarts={echarts} option={option} style={{ height: 420, minWidth: 600 }} />
    </ScrollArea>
  )
}
