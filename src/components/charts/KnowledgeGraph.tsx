import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { ScrollArea } from '@radix-ui/themes'
import { useThemeStore } from '@/stores/theme-store'

interface KnowledgeNode {
  name: string
  questionCount: number
  correctRate: number | null
  subject: string
}

interface KnowledgeEdge {
  source: string
  target: string
  weight: number
}

interface Props {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}

const SUBJECT_PALETTE = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#10b981', '#6366f1', '#ec4899', '#14b8a6',
  '#f97316', '#a855f7', '#84cc16', '#64748b',
]

function subjectColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return SUBJECT_PALETTE[Math.abs(hash) % SUBJECT_PALETTE.length]
}

function accuracyColor(rate: number | null): string {
  if (rate === null) return '#6b7280'
  if (rate >= 0.8) return '#22c55e'
  if (rate >= 0.5) return '#f59e0b'
  return '#ef4444'
}

export function KnowledgeGraph({ nodes, edges }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const [colorMode, setColorMode] = useState<'subject' | 'accuracy'>('subject')

  const option = useMemo(() => {
    if (nodes.length === 0) return {}

    const maxWeight = Math.max(...edges.map((e) => e.weight), 1)
    const uniqueSubjects = [...new Set(nodes.map((n) => n.subject))]

    const categories = colorMode === 'subject'
      ? uniqueSubjects.map((s) => ({ name: s, itemStyle: { color: subjectColor(s) } }))
      : undefined

    const graphNodes = nodes.map((n) => {
      if (colorMode === 'accuracy') {
        return {
          name: n.name,
          value: n.questionCount,
          symbolSize: 8 + Math.sqrt(n.questionCount) * 4,
          itemStyle: { color: accuracyColor(n.correctRate) },
        }
      }
      return {
        name: n.name,
        value: n.questionCount,
        category: uniqueSubjects.indexOf(n.subject),
        symbolSize: 8 + Math.sqrt(n.questionCount) * 4,
      }
    })

    const graphLinks = edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.weight,
      lineStyle: {
        width: 1 + (e.weight / maxWeight) * 7,
        curveness: 0.2,
        color: isDark ? '#47556980' : '#cbd5e180',
      },
    }))

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { data?: { name?: string; value?: number } }) => {
          if (!p.data?.name) return ''
          const node = nodes.find((n) => n.name === p.data!.name)
          if (!node) return p.data.name
          const rate = node.correctRate !== null ? `${(node.correctRate * 100).toFixed(0)}%` : 'N/A'
          return `<b>${node.name}</b><br/>题目: <b>${node.questionCount}</b> 道<br/>正确率: <b>${rate}</b><br/>学科: ${node.subject}`
        },
      },
      legend: colorMode === 'subject' && uniqueSubjects.length > 0 ? {
        orient: 'horizontal' as const,
        left: 'center',
        top: 0,
        textStyle: { color: textColor, fontSize: 10 },
        data: categories!.map((c) => c.name),
      } : undefined,
      series: [
        {
          type: 'graph' as const,
          layout: 'force' as const,
          data: graphNodes,
          links: graphLinks,
          categories,
          roam: true,
          draggable: true,
          force: {
            repulsion: 400,
            edgeLength: [80, 200],
            gravity: 0.08,
            friction: 0.1,
            layoutAnimation: false,
          },
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            color: textColor,
            formatter: (p: { data?: { name?: string; symbolSize?: number } }) => {
              const size = p.data?.symbolSize ?? 0
              if (nodes.length > 60 && (typeof size === 'number' && size < 20)) return ''
              const name = p.data?.name ?? ''
              return name.length > 12 ? name.slice(0, 12) + '…' : name
            },
          },
          emphasis: {
            focus: 'adjacency' as const,
            itemStyle: { shadowBlur: 12, shadowColor: isDark ? 'rgba(148,163,184,0.4)' : 'rgba(0,0,0,0.2)' },
          },
          lineStyle: {
            opacity: 0.4,
          },
        },
      ],
    }
  }, [nodes, edges, isDark, textColor, colorMode])

  if (nodes.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">还没有知识点数据</p>
  }

  if (nodes.length === 1) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm font-medium" style={{ color: textColor }}>{nodes[0].name}</p>
        <p className="text-xs text-muted-foreground">
          {nodes[0].questionCount} 道题 · 仅有一个知识点，无关联关系
        </p>
      </div>
    )
  }

  return (
    <ScrollArea scrollbars="horizontal">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          {nodes.length} 个知识点 · {edges.length} 条关联
        </p>
        <button
          onClick={() => setColorMode(colorMode === 'subject' ? 'accuracy' : 'subject')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {colorMode === 'subject' ? '按正确率着色' : '按学科着色'}
        </button>
      </div>
      <ReactECharts echarts={echarts} option={option} style={{ height: 480, minWidth: 360 }} />
    </ScrollArea>
  )
}
