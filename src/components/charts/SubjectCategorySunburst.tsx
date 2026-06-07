import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { subject: string; category: string }[]
}

export function SubjectCategorySunburst({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)

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

    const isDark = theme === 'dark'
    const textColor = isDark ? '#d1d5db' : '#374151'

    return {
      tooltip: {
        trigger: 'item' as const,
        triggerOn: 'mousemove' as const,
      },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' as const },
        nodeAlign: 'left' as const,
        layoutIterations: 0,
        data: nodes,
        links,
        label: {
          fontSize: 10,
          color: textColor,
        },
        lineStyle: { color: 'gradient', curveness: 0.5 },
      }],
    }
  }, [data, theme])

  return <ReactECharts option={option} style={{ height: 440 }} />
}
