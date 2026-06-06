import { useMemo, useState, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { subject: string; category: string }[]
}

type SankeyMode = 'subject-category' | 'category-subject'

export function SubjectCategorySunburst({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const [mode, setMode] = useState<SankeyMode>('subject-category')
  const toggleRef = useRef<() => void>(() => {})

  toggleRef.current = () => {
    setMode((prev) => (prev === 'subject-category' ? 'category-subject' : 'subject-category'))
  }

  const option = useMemo(() => {
    // Count subject→category pairs
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

    const isSubjectLeft = mode === 'subject-category'
    const leftNodes = isSubjectLeft ? [...leftSet] : [...rightSet]
    const rightNodes = isSubjectLeft ? [...rightSet] : [...leftSet]

    // Build node list, avoiding name collisions between left and right
    const nodes: { name: string; depth?: number }[] = []
    const leftNames = new Set(leftNodes)
    for (const name of leftNodes) {
      nodes.push({ name, depth: 0 })
    }
    for (const name of rightNodes) {
      // If a right node name collides with a left node, suffix it
      const displayName = leftNames.has(name) ? `${name} ` : name
      nodes.push({ name: displayName, depth: 1 })
    }

    const links: { source: string; target: string; value: number }[] = []
    for (const [pairKey, value] of pairCounts) {
      const [subj, cat] = pairKey.split('|||')
      const rightName = leftNames.has(cat) ? `${cat} ` : cat
      if (isSubjectLeft) {
        links.push({ source: subj, target: rightName, value })
      } else {
        const rightSubj = leftNames.has(subj) ? `${subj} ` : subj
        links.push({ source: cat, target: rightSubj, value })
      }
    }

    const isDark = theme === 'dark'
    const textColor = isDark ? '#d1d5db' : '#374151'

    return {
      tooltip: {
        trigger: 'item' as const,
        triggerOn: 'mousemove' as const,
      },
      toolbox: {
        show: true,
        right: 0,
        top: 0,
        feature: {
          myToggle: {
            show: true,
            title: isSubjectLeft ? '切换到按分类' : '切换到按学科',
            icon: 'path://M4 8 L10 2 L16 8 M16 16 L10 22 L4 16',
            iconStyle: { borderColor: textColor },
            onclick: () => {
              toggleRef.current()
            },
          },
        },
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
  }, [data, theme, mode])

  return <ReactECharts option={option} style={{ height: 300 }} />
}
