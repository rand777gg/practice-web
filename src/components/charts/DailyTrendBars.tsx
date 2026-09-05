import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useChartPalette } from '@/lib/chart-theme'

interface Props {
  data: { date: string; correct: number; wrong: number }[]
}

/** 近 15 天每日对/错题量堆叠柱 —— 总览首页趋势卡 */
export function DailyTrendBars({ data }: Props) {
  const pal = useChartPalette()

  const option = useMemo(() => {
    if (!data.length) return null
    const todayIdx = data.length - 1
    const interval = Math.max(1, Math.ceil(data.length / 9))
    const label = { color: pal.label, fontSize: 10 }

    return {
      backgroundColor: 'transparent',
      color: [pal.correct, pal.wrong],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
        valueFormatter: (v: number | string) => `${v} 题`,
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: label,
        data: ['正确', '错误'],
      },
      grid: { left: 8, right: 12, top: 30, bottom: 20, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: data.map((d, i) => (i === todayIdx ? '今天' : d.date.slice(5))),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { ...label, interval },
      },
      yAxis: {
        type: 'value' as const,
        splitLine: { lineStyle: { color: pal.line } },
        axisLabel: label,
      },
      series: [
        {
          name: '正确',
          type: 'bar',
          stack: 'a',
          barMaxWidth: 30,
          itemStyle: { color: pal.correct, borderRadius: 0 },
          data: data.map((d) => d.correct),
          emphasis: { focus: 'series' as const },
        },
        {
          name: '错误',
          type: 'bar',
          stack: 'a',
          barMaxWidth: 30,
          itemStyle: { color: pal.wrong, borderRadius: 0 },
          data: data.map((d) => d.wrong),
          emphasis: { focus: 'series' as const },
        },
      ],
    }
  }, [data, pal])

  if (!option) {
    return (
      <div className="h-[300px] rounded-lg bg-muted/30 flex items-center justify-center text-sm text-muted-foreground/60">
        暂无数据 · 先去刷几道题吧
      </div>
    )
  }

  return <ReactECharts echarts={echarts} option={option} notMerge style={{ height: 300, width: '100%' }} />
}
