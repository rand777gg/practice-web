import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

import echarts from '@/lib/echarts'
import { CATEGORY_COLORS, useChartPalette } from '@/lib/chart-theme'
import { formatCount, type AiUsageModelRow } from '@/lib/ai-usage'

interface Props {
  models: AiUsageModelRow[]
  /** 环里最多几瓣, 剩下的并成「其他」 */
  topModels?: number
}

/** 模型使用占比 —— 环图 + 右侧带百分比的图例, 中心写总调用次数 */
export function AiUsageShare({ models, topModels = 5 }: Props) {
  const pal = useChartPalette()

  const option = useMemo(() => {
    if (!models.length) return null

    const head = models.slice(0, topModels)
    const rest = models.slice(topModels)
    const slices = head.map((m, i) => ({
      name: m.model,
      value: m.calls,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))
    if (rest.length) {
      slices.push({
        name: '其他',
        value: rest.reduce((sum, m) => sum + m.calls, 0),
        color: pal.label,
      })
    }
    const total = slices.reduce((sum, s) => sum + s.value, 0)
    const shareOf = new Map(models.map((m) => [m.model, m.share]))

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>${formatCount(p.value)} 次 (${p.percent}%)`,
      },
      title: {
        text: formatCount(total),
        subtext: '总调用次数',
        left: '32%',
        top: '41%',
        textAlign: 'center' as const,
        textStyle: { color: pal.ink, fontSize: 18, fontWeight: 600 as const },
        subtextStyle: { color: pal.label, fontSize: 10 },
      },
      legend: {
        orient: 'vertical' as const,
        right: 0,
        top: 'middle' as const,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: pal.label, fontSize: 11 },
        data: slices.map((s) => s.name),
        formatter: (name: string) => {
          const share = shareOf.get(name)
          if (share === undefined) return name
          return `${name}  ${(share * 100).toFixed(1)}%`
        },
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['52%', '74%'],
          center: ['32%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: pal.panel, borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6 },
          data: slices.map((s) => ({
            name: s.name,
            value: s.value,
            itemStyle: { color: s.color },
          })),
        },
      ],
    }
  }, [models, pal, topModels])

  if (!option) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg bg-muted/30 text-xs text-muted-foreground">
        还没有调用记录
      </div>
    )
  }

  return <ReactECharts echarts={echarts} option={option} notMerge style={{ height: 260, width: '100%' }} />
}
