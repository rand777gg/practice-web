import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { subject: string; category: string }[]
}

export function SubjectCategorySunburst({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)

  const option = useMemo(() => {
    const grouped = new Map<string, Map<string, number>>()
    for (const d of data) {
      const subj = d.subject || 'Other'
      const cat = d.category || 'Other'
      if (!grouped.has(subj)) grouped.set(subj, new Map())
      const cats = grouped.get(subj)!
      cats.set(cat, (cats.get(cat) ?? 0) + 1)
    }

    const nodes: { name: string }[] = []
    const links: { source: string; target: string; value: number }[] = []

    for (const [subj, cats] of grouped) {
      nodes.push({ name: subj })
      for (const [cat, count] of cats) {
        const catNodeName = `${subj}/${cat}`
        if (!nodes.find((n) => n.name === catNodeName)) {
          nodes.push({ name: catNodeName })
        }
        links.push({ source: subj, target: catNodeName, value: count })
      }
    }

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
          color: theme === 'dark' ? '#d1d5db' : '#374151',
        },
        lineStyle: { color: 'gradient', curveness: 0.5 },
      }],
    }
  }, [data, theme])

  return <ReactECharts option={option} style={{ height: 300 }} />
}
