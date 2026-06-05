import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { date: string; count: number }[]
  dailyGoal: number
}

export function DailyGoalHeatmap({ data, dailyGoal }: Props) {
  const theme = useThemeStore((s) => s.theme)

  const option = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const start = `${year}-01-01`
    const end = `${year}-12-31`

    const byDate = new Map(data.map((d) => [d.date, d.count]))
    const seriesData: [string, number][] = []
    const cursor = new Date(start)
    const endDate = new Date(end)
    while (cursor <= endDate) {
      const key = cursor.toISOString().slice(0, 10)
      seriesData.push([key, byDate.get(key) ?? 0])
      cursor.setDate(cursor.getDate() + 1)
    }

    const maxVal = Math.max(dailyGoal, ...seriesData.map((d) => d[1]), 1)
    const emptyColor = theme === 'dark' ? '#1f2937' : '#ebedf0'

    return {
      tooltip: {
        position: 'top',
        formatter: (p: any) => `${p.value[0]}<br/>${p.value[1]} questions`,
      },
      visualMap: {
        min: 0,
        max: maxVal,
        type: 'piecewise',
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        itemWidth: 14,
        itemHeight: 14,
        itemGap: 4,
        textStyle: { color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: 10 },
        pieces: [
          { min: 0, max: 0, color: emptyColor },
          { min: 1, max: Math.max(1, Math.ceil(maxVal * 0.25)), color: '#9be9a8' },
          { min: Math.ceil(maxVal * 0.25) + 1, max: Math.ceil(maxVal * 0.5), color: '#40c463' },
          { min: Math.ceil(maxVal * 0.5) + 1, max: Math.ceil(maxVal * 0.75), color: '#30a14e' },
          { min: Math.ceil(maxVal * 0.75) + 1, color: '#216e39' },
        ],
      },
      calendar: {
        top: 20,
        left: 30,
        right: 10,
        bottom: 60,
        cellSize: ['auto', 16],
        range: [start, end],
        itemStyle: {
          borderColor: theme === 'dark' ? '#111827' : '#fff',
          borderWidth: 3,
          borderRadius: 2,
        },
        yearLabel: {
          show: true,
          fontSize: 14,
          color: theme === 'dark' ? '#d1d5db' : '#374151',
        },
        dayLabel: {
          firstDay: 1,
          color: theme === 'dark' ? '#6b7280' : '#9ca3af',
          fontSize: 10,
          nameMap: ['', 'Mon', '', 'Wed', '', 'Fri', ''],
        },
        monthLabel: {
          color: theme === 'dark' ? '#d1d5db' : '#374151',
          fontSize: 11,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: theme === 'dark' ? '#1f2937' : '#e5e7eb',
            width: 2,
          },
        },
      },
      series: [{
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: seriesData,
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.3)',
          },
        },
      }],
    }
  }, [data, theme, dailyGoal])

  return <ReactECharts option={option} style={{ height: 220 }} />
}
