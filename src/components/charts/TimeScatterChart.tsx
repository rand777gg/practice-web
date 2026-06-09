import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: number[] // 24 hours, count of answers today
}

export function TimeScatterChart({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const option = useMemo(() => {
    const maxVal = Math.max(...data, 1)
    const maxSize = 48
    const minSize = 8

    const points: number[][] = []
    for (let h = 0; h < 24; h++) {
      if (data[h] > 0) {
        points.push([h, data[h], data[h]])
      }
    }

    const today = new Date()
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}`

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { value: number[] }) => {
          const [hour, count] = p.value
          return `<b>${dateStr} ${String(hour).padStart(2, '0')}:00</b><br/>答题: <b>${count}</b> 次`
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'value' as const,
        min: 0,
        max: 25,
        splitNumber: 5,
        axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => `${String(v).padStart(2, '0')}:00` },
        splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
        name: '小时',
        nameTextStyle: { color: textColor, fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: Math.ceil(maxVal * 1.25),
        splitNumber: 5,
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
        name: '答题数',
        nameTextStyle: { color: textColor, fontSize: 10 },
      },
      series: [
        {
          type: 'scatter' as const,
          data: points,
          symbolSize: (val: number[]) => {
            const count = val[2] ?? 0
            return minSize + (count / maxVal) * (maxSize - minSize)
          },
          itemStyle: { color: '#22c55e', opacity: 0.75 },
          emphasis: {
            scale: 1.4,
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(34,197,94,0.5)' },
          },
        },
      ],
    }
  }, [data, isDark, textColor])

  return (
    <ScrollArea scrollbars="horizontal">
      <ReactECharts option={option} style={{ height: 400, minWidth: 320 }} />
    </ScrollArea>
  )
}
