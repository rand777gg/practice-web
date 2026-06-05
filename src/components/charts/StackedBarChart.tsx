import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { date: string; correct: number; wrong: number }[]
}

function thisMonday(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function StackedBarChart({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)

  const daily = useMemo(() => {
    const mon = thisMonday()
    const byDate = new Map(data.map((d) => [d.date, d]))
    const result: { label: string; correct: number; wrong: number }[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(mon)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      const vals = byDate.get(key)
      result.push({ label, correct: vals?.correct ?? 0, wrong: vals?.wrong ?? 0 })
    }
    return result
  }, [data])

  const option = useMemo(() => ({
    tooltip: { trigger: 'axis' as const },
    toolbox: {
      right: 0,
      top: -4,
      feature: {
        dataZoom: { title: { zoom: '', back: '' } },
        restore: { title: '' },
      },
      iconStyle: { borderColor: theme === 'dark' ? '#9ca3af' : '#6b7280' },
    },
    dataZoom: [
      { type: 'inside' as const },
      { type: 'slider' as const, bottom: 0, height: 16, borderColor: 'transparent' },
    ],
    legend: {
      bottom: 24,
      textStyle: { color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: 11 },
    },
    grid: { left: 8, right: 8, top: 10, bottom: 50 },
    xAxis: {
      type: 'category' as const,
      data: daily.map((d) => d.label),
      axisLine: { lineStyle: { color: theme === 'dark' ? '#374151' : '#d1d5db' } },
      axisLabel: {
        color: theme === 'dark' ? '#9ca3af' : '#6b7280',
        fontSize: 10,
        margin: 25,
      },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: theme === 'dark' ? '#1f2937' : '#f3f4f6' } },
      axisLabel: {
        color: theme === 'dark' ? '#9ca3af' : '#6b7280',
        fontSize: 10,
        margin: 12,
      },
    },
    series: [
      {
        name: 'Correct',
        type: 'bar',
        stack: 'total',
        data: daily.map((d) => d.correct),
        itemStyle: { color: '#22c55e' },
        barWidth: 16,
      },
      {
        name: 'Wrong',
        type: 'bar',
        stack: 'total',
        data: daily.map((d) => d.wrong),
        itemStyle: { color: '#ef4444' },
        barWidth: 16,
      },
    ],
  }), [daily, theme])

  return <ReactECharts option={option} style={{ height: 300 }} />
}
