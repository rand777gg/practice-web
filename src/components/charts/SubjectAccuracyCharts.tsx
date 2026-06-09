import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选', multi_select: '多选', true_false: '判断',
  fill_blank: '填空', short_answer: '简答',
}

interface Props {
  subjectAccuracy: { subject: string; correct: number; total: number }[]
  heatmapData: { subject: string; questionType: string; correctRate: number; total: number }[]
}

export function SubjectAccuracyCharts({ subjectAccuracy, heatmapData }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const barOption = useMemo(() => {
    const sorted = [...subjectAccuracy]
      .filter((s) => s.total > 0)
      .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))

    const data = sorted.map((s) => ({
      name: s.subject,
      value: Math.round((s.correct / s.total) * 100),
    }))

    return {
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { name: string; value: number }[]) => {
          const d = p[0]
          const s = sorted.find((x) => x.subject === d.name)
          return `<b>${d.name}</b><br/>正确率: ${d.value}%<br/>正确/总数: ${s?.correct ?? 0}/${s?.total ?? 0}`
        },
      },
      grid: { left: '3%', right: '8%', bottom: '3%', top: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        max: 100,
        axisLabel: { color: textColor, fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: data.map((d) => d.name),
        axisLabel: { color: textColor, fontSize: 11 },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar' as const,
        data: data.map((d) => {
          const rate = d.value / 100
          const r = Math.round(239 - rate * 200)
          const g = Math.round(68 + rate * 130)
          const b = Math.round(68)
          return {
            value: d.value,
            itemStyle: {
              color: `rgb(${r},${g},${b})`,
              borderRadius: [0, 4, 4, 0],
            },
          }
        }),
        barMaxWidth: 28,
        label: {
          show: true,
          position: 'right' as const,
          formatter: '{c}%',
          color: textColor,
          fontSize: 10,
        },
      }],
    }
  }, [subjectAccuracy, isDark, textColor])

  const heatmapOption = useMemo(() => {
    const subjects = [...new Set(heatmapData.map((d) => d.subject))]
    const types = [...new Set(heatmapData.map((d) => TYPE_LABELS[d.questionType] || d.questionType))]

    const data = heatmapData
      .filter((d) => d.total > 0)
      .map((d) => [
        types.indexOf(TYPE_LABELS[d.questionType] || d.questionType),
        subjects.indexOf(d.subject),
        Math.round(d.correctRate * 100),
      ])

    return {
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { value: number[] }) => {
          const [typeIdx, subjIdx, rate] = p.value
          const qt = types[typeIdx] ?? ''
          const subj = subjects[subjIdx] ?? ''
          const d = heatmapData.find((x) => x.subject === subj && (TYPE_LABELS[x.questionType] || x.questionType) === qt)
          return `<b>${subj} × ${qt}</b><br/>正确率: ${rate}%<br/>答题: ${d?.total ?? 0} 题`
        },
      },
      grid: { left: '12%', right: '4%', bottom: '12%', top: 4, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: types,
        axisLabel: { color: textColor, fontSize: 9 },
        position: 'top' as const,
      },
      yAxis: {
        type: 'category' as const,
        data: subjects,
        axisLabel: { color: textColor, fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max: 100,
        inRange: { color: isDark ? ['#7f1d1d', '#dc2626', '#f59e0b', '#22c55e'] : ['#fef2f2', '#fecaca', '#fde68a', '#bbf7d0'] },
        textStyle: { color: textColor, fontSize: 9 },
        orient: 'horizontal' as const,
        left: 'center',
        bottom: -8,
      },
      series: [{
        type: 'heatmap' as const,
        data,
        label: {
          show: true,
          color: isDark ? '#e2e8f0' : '#1e293b',
          fontSize: 9,
          formatter: (p: { value: number[] }) => `${p.value[2]}%`,
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' },
        },
      }],
    }
  }, [heatmapData, isDark, textColor])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ScrollArea scrollbars="horizontal">
        <p className="text-xs text-muted-foreground text-center mb-1">科目正确率</p>
        <ReactECharts option={barOption} style={{ height: 320, minWidth: 280 }} />
      </ScrollArea>
      <ScrollArea scrollbars="horizontal">
        <p className="text-xs text-muted-foreground text-center mb-1">科目 × 题型 正确率热力图</p>
        <ReactECharts option={heatmapOption} style={{ height: 320, minWidth: 360 }} />
      </ScrollArea>
    </div>
  )
}
