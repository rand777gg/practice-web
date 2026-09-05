import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useChartPalette, CATEGORY_COLORS } from '@/lib/chart-theme'

interface Props {
  data: { dates: string[]; subjects: string[]; data: Record<string, number>[] }
}

/** 近 15 天各科每日答题量堆叠图 —— 复用 Dashboard 已聚合的 dailySubjectData */
export function SubjectDailyStack({ data }: Props) {
  const pal = useChartPalette()

  const option = useMemo(() => {
    if (!data.dates.length || !data.subjects.length) return null
    const total = data.data.reduce(
      (sum, row) => sum + Object.values(row).reduce((a, b) => a + (Number(b) || 0), 0),
      0,
    )
    if (total <= 0) return null

    const interval = Math.max(1, Math.ceil(data.dates.length / 10))
    const text = { color: pal.label, fontSize: 11 }
    const line = { show: false }
    return {
      backgroundColor: 'transparent',
      color: CATEGORY_COLORS,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: text,
        pageTextStyle: text,
      },
      grid: { left: 8, right: 12, top: 12, bottom: 40, containLabel: true },
      xAxis: {
        type: 'category',
        data: data.dates.map((d) => d.slice(5)),
        axisTick: line,
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { ...text, interval },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: pal.line } },
        axisLabel: text,
        name: '题量',
        nameTextStyle: { color: pal.label, fontSize: 10 },
      },
      series: data.subjects.map((subject, i) => ({
        name: subject,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 22,
        emphasis: { focus: 'series' },
        itemStyle: { color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] },
        data: data.data.map((row) => Number(row[subject]) || 0),
      })),
    }
  }, [data, pal])

  if (!option) {
    return (
      <div className="h-[300px] rounded-lg bg-muted/30 flex items-center justify-center text-sm text-muted-foreground/60">
        暂无数据 · 先去刷几道题吧
      </div>
    )
  }

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 320, width: '100%' }}
    />
  )
}
