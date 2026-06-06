import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { date: string; count: number }[]
  dailyGoal: number
}

const COLORS_LIGHT = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']

export function DailyGoalHeatmap({ data, dailyGoal }: Props) {
  const theme = useThemeStore((s) => s.theme)

  const option = useMemo(() => {
    const year = new Date().getFullYear()
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

    const maxVal = Math.max(...seriesData.map((d) => d[1]), 1)
    const isDark = theme === 'dark'
    const colors = isDark ? COLORS_DARK : COLORS_LIGHT
    const bgColor = isDark ? 'transparent' : '#ffffff'
    const textColor = isDark ? '#9ca3af' : '#57606a'
    const monthColor = isDark ? '#9ca3af' : '#57606a'

    const buckets = [
      { min: 0, max: 0, color: colors[0], label: '0' },
      { min: 1, max: Math.max(1, Math.ceil(maxVal * 0.25)), color: colors[1] },
      { min: Math.ceil(maxVal * 0.25) + 1, max: Math.ceil(maxVal * 0.5), color: colors[2] },
      { min: Math.ceil(maxVal * 0.5) + 1, max: Math.ceil(maxVal * 0.75), color: colors[3] },
      { min: Math.ceil(maxVal * 0.75) + 1, max: maxVal, color: colors[4] },
    ].filter((b) => b.min <= b.max)

    return {
      backgroundColor: bgColor,
      tooltip: {
        position: 'top',
        borderColor: isDark ? '#30363d' : '#d0d7de',
        backgroundColor: isDark ? '#161b22' : '#ffffff',
        textStyle: { color: textColor, fontSize: 12 },
        formatter: (p: { value: [string, number] }) => {
          const d = p.value
          return `<b>${d[1]}</b> questions on ${d[0]}`
        },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        type: 'piecewise',
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 4,
        showLabel: true,
        text: ['', ''],
        textStyle: { color: textColor, fontSize: 10 },
        pieces: buckets,
      },
      calendar: {
        top: 20,
        left: 35,
        right: 15,
        bottom: 40,
        cellSize: [10, 10],
        range: [start, end],
        itemStyle: {
          color: colors[0],
          borderColor: bgColor,
          borderWidth: 4,
          borderRadius: 8,
        },
        yearLabel: { show: false },
        dayLabel: {
          firstDay: 1,
          color: textColor,
          fontSize: 10,
          margin: 8,
          nameMap: ['', 'Mon', '', 'Wed', '', 'Fri', ''],
        },
        monthLabel: {
          show: true,
          color: monthColor,
          fontSize: 11,
          margin: 6,
          align: 'left',
        },
        splitLine: { show: false },
      },
      series: [{
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: seriesData,
        emphasis: {
          itemStyle: {
            shadowBlur: 0,
            borderColor: isDark ? '#58a6ff' : '#0969da',
            borderWidth: 1.5,
          },
        },
      }],
    }
  }, [data, theme, dailyGoal])

  return (
    <div className="-mx-4 lg:mx-0 overflow-x-auto">
      <ReactECharts option={option} style={{ height: 175, minWidth: 750 }} /> 
    </div>
  )
}
