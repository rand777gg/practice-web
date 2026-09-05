import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useChartPalette, CATEGORY_COLORS } from '@/lib/chart-theme'

interface Props {
  data: { subject: string; category: string }[]
}

export function SubjectCategorySunburst({ data }: Props) {
  const pal = useChartPalette()

  const option = useMemo(() => {
    const pairCounts = new Map<string, number>()
    const leftSet = new Set<string>()
    const rightSet = new Set<string>()

    for (const d of data) {
      const subj = d.subject || 'Other'
      const cat = d.category || 'Other'
      const key = `${subj}|||${cat}`
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      leftSet.add(subj)
      rightSet.add(cat)
    }

    const leftNames = new Set(leftSet)
    const nodes: { name: string; depth?: number }[] = []
    for (const name of leftSet) {
      nodes.push({ name, depth: 0 })
    }
    for (const name of rightSet) {
      const displayName = leftNames.has(name) ? `${name} ` : name
      nodes.push({ name: displayName, depth: 1 })
    }

    const links: { source: string; target: string; value: number }[] = []
    for (const [pairKey, value] of pairCounts) {
      const [subj, cat] = pairKey.split('|||')
      const rightName = leftNames.has(cat) ? `${cat} ` : cat
      links.push({ source: subj, target: rightName, value })
    }

    return {
      tooltip: {
        trigger: 'item' as const,
        triggerOn: 'mousemove' as const,
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 11 },
      },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' as const },
        nodeAlign: 'left' as const,
        layoutIterations: 0,
        color: CATEGORY_COLORS,
        data: nodes,
        links,
        label: {
          fontSize: 10,
          color: pal.ink,
        },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
      }],
    }
  }, [data, pal])

  return (
    <ScrollArea scrollbars="horizontal">
      <ReactECharts echarts={echarts} option={option} style={{ height: 440, minWidth: 500 }} />
    </ScrollArea>
  )
}
