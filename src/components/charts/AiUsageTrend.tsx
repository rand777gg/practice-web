import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

import echarts from '@/lib/echarts'
import { CATEGORY_COLORS, useChartPalette } from '@/lib/chart-theme'
import type { AiUsageDay } from '@/lib/ai-usage'

interface Props {
  daily: AiUsageDay[]
}

/** 一条线上最多画几个模型, 剩下的并进「其他」 */
const TOP_MODELS = 4

/**
 * 每日调用趋势 —— 模型使用看板左侧那张线图。
 *
 * 为什么按模型拆线而不是只画一条总数: 总数说不了"是谁在涨" —— 一次 AI 导题就能把当天
 * 调用拉高一截, 而它和日常对话的额度含义完全不同。
 */
export function AiUsageTrend({ daily }: Props) {
  const pal = useChartPalette()

  const option = useMemo(() => {
    if (!daily.length) return null

    const totalsByModel = new Map<string, number>()
    for (const d of daily) {
      for (const [model, calls] of Object.entries(d.byModel)) {
        totalsByModel.set(model, (totalsByModel.get(model) ?? 0) + calls)
      }
    }
    const ranked = [...totalsByModel.entries()].sort((a, b) => b[1] - a[1])
    const head = ranked.slice(0, TOP_MODELS).map(([model]) => model)

    const lines = head.map((model, i) => ({
      name: model,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      dashed: false,
      data: daily.map((d) => d.byModel[model] ?? 0),
    }))
    if (ranked.length > head.length) {
      lines.push({
        name: '其他',
        color: pal.label,
        dashed: true,
        data: daily.map((d) => Object.entries(d.byModel)
          .reduce((sum, [model, calls]) => (head.includes(model) ? sum : sum + calls), 0)),
      })
    }

    const label = { color: pal.label, fontSize: 10 }
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
        valueFormatter: (v: number | string) => `${v} 次`,
      },
      legend: {
        top: 0,
        left: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: label,
        data: lines.map((l) => l.name),
      },
      grid: { left: 8, right: 12, top: 34, bottom: 20, containLabel: true },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        data: daily.map((d) => d.day.slice(5)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { ...label, interval: Math.max(0, Math.ceil(daily.length / 9) - 1) },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        splitLine: { lineStyle: { color: pal.line } },
        axisLabel: label,
      },
      series: lines.map((l) => ({
        name: l.name,
        type: 'line' as const,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2, type: l.dashed ? 'dashed' as const : 'solid' as const },
        itemStyle: { color: l.color },
        data: l.data,
      })),
    }
  }, [daily, pal])

  if (!option) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg bg-muted/30 text-xs text-muted-foreground">
        还没有调用记录 —— 用过一次助手、导题或批改, 这里就会有数
      </div>
    )
  }

  return <ReactECharts echarts={echarts} option={option} notMerge style={{ height: 260, width: '100%' }} />
}
