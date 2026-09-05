import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useChartPalette, mixHex } from '@/lib/chart-theme'

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选', multi_select: '多选', true_false: '判断',
  fill_blank: '填空', short_answer: '简答', judge_correct: '判断改错',
  analysis: '分析',
}

interface Props {
  subjectAccuracy: { subject: string; correct: number; total: number }[]
  heatmapData: { subject: string; questionType: string; correctRate: number; total: number }[]
}

/** 正确率 0→100 映射:红 → 琥珀 → 绿 的三段插值 */
function accuracyRamp(a: string, b: string, c: string, t: number): string {
  const k = Math.min(Math.max(t, 0), 1)
  if (k < 0.5) return mixHex(a, b, k * 2)
  return mixHex(b, c, (k - 0.5) * 2)
}

export function SubjectAccuracyCharts({ subjectAccuracy, heatmapData }: Props) {
  const pal = useChartPalette()
  const textColor = pal.ink

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
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
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
        splitLine: { lineStyle: { color: pal.line, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: data.map((d) => d.name),
        axisLabel: { color: textColor, fontSize: 11 },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar' as const,
        data: data.map((d) => ({
          value: d.value,
          itemStyle: {
            color: accuracyRamp(pal.wrong, pal.warn, pal.correct, d.value / 100),
            borderRadius: [0, 4, 4, 0],
          },
        })),
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
  }, [subjectAccuracy, pal, textColor])

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

    const heatColors = [0, 0.25, 0.5, 0.75, 1].map((t) => accuracyRamp(pal.wrong, pal.warn, pal.correct, t))

    return {
      tooltip: {
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
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
        inRange: { color: heatColors },
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
          color: '#ffffff',
          fontSize: 9,
          textBorderColor: 'rgba(15,23,42,0.35)',
          textBorderWidth: 1,
          formatter: (p: { value: number[] }) => `${p.value[2]}%`,
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' },
        },
      }],
    }
  }, [heatmapData, pal, textColor])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ScrollArea scrollbars="horizontal">
        <p className="text-xs text-muted-foreground text-center mb-1">科目正确率</p>
        <ReactECharts echarts={echarts} option={barOption} style={{ height: 320, minWidth: 280 }} />
      </ScrollArea>
      <ScrollArea scrollbars="horizontal">
        <p className="text-xs text-muted-foreground text-center mb-1">科目 × 题型 正确率热力图</p>
        <ReactECharts echarts={echarts} option={heatmapOption} style={{ height: 320, minWidth: 360 }} />
      </ScrollArea>
    </div>
  )
}
