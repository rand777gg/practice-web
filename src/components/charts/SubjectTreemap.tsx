import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useThemeStore } from '@/stores/theme-store'

// zhongguose.com
const SUBJECT_COLORS = [
  '#1781B5', // 碧青
  '#CB3A56', // 茜色
  '#FFA631', // 杏黄
  '#20A162', // 翠绿
  '#1661AB', // 靛青
  '#789262', // 竹青
  '#574266', // 黛紫
  '#EA842A', // 橘黄
  '#9F4440', // 殷红
  '#61B34E', // 葱绿
  '#2C3D77', // 藏青
  '#FF4777', // 品红
  '#758A99', // 墨灰
  '#CCA4E3', // 丁香
  '#BCE672', // 松花
]

interface Props {
  data: { subject: string; category: string }[]
}

export function SubjectTreemap({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'

  const option = useMemo(() => {
    const subjectMap = new Map<string, Map<string, number>>()
    for (const d of data) {
      const subj = d.subject || '未分类'
      const cat = d.category || '未分类'
      if (!subjectMap.has(subj)) subjectMap.set(subj, new Map())
      const catMap = subjectMap.get(subj)!
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
    }

    const subjects = [...subjectMap.keys()]
    const children = subjects.map((subj, si) => {
      const catMap = subjectMap.get(subj)!
      const baseColor = SUBJECT_COLORS[si % SUBJECT_COLORS.length]
      return {
        name: subj,
        itemStyle: { color: baseColor },
        children: [...catMap.entries()].map(([cat, count]) => ({
          name: cat,
          value: count,
        })),
      }
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#d1d5db' : '#374151', fontSize: 12 },
        formatter: (info: { name: string; value: number; treePathInfo?: { name: string }[] }) => {
          const path = info.treePathInfo?.map((n) => n.name).join(' > ') ?? info.name
          return `${path}<br/>题目数: ${info.value}`
        },
      },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: 'zoomToNode' as const,
        top: 0,
        bottom: 30,
        breadcrumb: {
          show: true,
          height: 22,
          bottom: 2,
          itemStyle: {
            color: isDark ? '#334155' : '#f1f5f9',
            borderColor: isDark ? '#475569' : '#cbd5e1',
            textStyle: { color: isDark ? '#cbd5e1' : '#475569', fontSize: 11 },
          },
        },
        label: { show: true, fontSize: 11, color: isDark ? '#e2e8f0' : '#1e293b', formatter: '{b}' },
        upperLabel: { show: true, height: 18, color: isDark ? '#94a3b8' : '#64748b', fontSize: 10 },
        itemStyle: { borderColor: isDark ? '#0f172a' : '#fff', borderWidth: 2, gapWidth: 2 },
        levels: [{
          itemStyle: { borderWidth: 3, gapWidth: 3 },
        }],
        data: children,
      }],
    }
  }, [data, isDark])

  return (
    <div className="w-full">
      <ReactECharts
        echarts={echarts}
        option={option}
        style={{ height: 480, width: '100%', backgroundColor: 'transparent' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}
