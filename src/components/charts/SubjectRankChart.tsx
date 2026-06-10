import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { subject: string }[]
}

const COLORS = [
  '#3b82f6', '#6366f1', '#06b6d4', '#8b5cf6', '#0ea5e9',
  '#7c3aed', '#0891b2', '#4f46e5', '#60a5fa', '#818cf8',
]

export function SubjectRankChart({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const option = useMemo(() => {
    const countMap = new Map<string, number>()
    for (const d of data) {
      const subj = d.subject || '未分类'
      countMap.set(subj, (countMap.get(subj) ?? 0) + 1)
    }
    const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1])
    const subjects = sorted.map(([name]) => name)
    const counts = sorted.map(([, count]) => count)
    const total = counts.reduce((s, v) => s + v, 0)

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { name: string; value: number }[]) => {
          const d = p[0]
          return `<b>${d.name}</b><br/>题目数: ${d.value}<br/>占比: ${Math.round((d.value / total) * 100)}%`
        },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: subjects,
        axisLabel: { color: textColor, fontSize: 11 },
        axisTick: { show: false },
        inverse: true,
      },
      series: [{
        type: 'bar' as const,
        data: counts.map((v, i) => ({
          value: v,
          itemStyle: {
            color: COLORS[i % COLORS.length],
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 20,
        barCategoryGap: '15%',
        label: {
          show: true,
          position: 'right' as const,
          color: textColor,
          fontSize: 10,
        },
      }],
    }
  }, [data, isDark, textColor])

  return (
    <ScrollArea scrollbars="horizontal">
      <p className="text-xs text-muted-foreground text-center mb-1">学科题目排行</p>
      <ReactECharts echarts={echarts} option={option} style={{ height: 480, minWidth: 320 }} />
    </ScrollArea>
  )
}
