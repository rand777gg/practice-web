import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useChartPalette, CATEGORY_COLORS } from '@/lib/chart-theme'

interface Props {
  dates: string[]
  subjects: string[]
  data: Record<string, number>[] // data[i][subject] = count
  barData: { date: string; correct: number; wrong: number }[]
}

export function AnswerTimeScatterHistogram({ dates, subjects, data, barData }: Props) {
  const pal = useChartPalette()
  const textColor = pal.ink
  const mutedColor = pal.label

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
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
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
          splitLine: { lineStyle: { color: pal.line, type: 'dashed' as const } },
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
            color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
          },
        })),
        {
          name: '正确率',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: pal.brand, width: 2 },
          itemStyle: { color: pal.brand },
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
          lineStyle: { color: pal.warn, width: 1.5, type: 'dashed' as const },
          emphasis: { focus: 'series' as const },
          data: dates.map(() => avgDaily),
          z: 5,
        },
      ],
    }
  }, [dates, subjects, data, barData, pal, textColor, mutedColor])

  return (
    <ScrollArea scrollbars="horizontal">
      <ReactECharts echarts={echarts} option={option} style={{ height: 420, minWidth: 600 }} />
    </ScrollArea>
  )
}
