import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: { subject: string; category: string; questionType: string }[]
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选', multi_select: '多选', true_false: '判断',
  fill_blank: '填空', short_answer: '简答',
}

// 中国色 — 内层：赤/暖色系
const INNER_COLORS = ['#c8514a', '#e47a53', '#d96754', '#ba504e', '#ed8457', '#cf6359', '#da7e67', '#c23b35']
// 中国色 — 中层：青/蓝色系
const MIDDLE_COLORS = [
  '#3b6fa0', '#4b7eb5', '#5a8fbf', '#2e5c8a', '#6599c7', '#3d72a8',
  '#5285b7', '#42709e', '#6ba3d1', '#376695', '#4f80b2', '#5892be',
]
// 中国色 — 外层：绿/碧色系
const OUTER_COLORS = ['#729f6a', '#8cb882', '#5f8b55', '#a0cc96', '#78a870', '#94bf8a']

export function SubjectDonutCharts({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const option = useMemo(() => {
    // Category (inner)
    const catMap = new Map<string, number>()
    // Subject (middle)
    const subjByCat = new Map<string, Map<string, number>>()
    // Question type (outer)
    const typeMap = new Map<string, number>()

    for (const d of data) {
      const cat = d.category
        ? /^\d{4}年真题$/.test(d.category) ? '真题' : d.category
        : '未分类'
      const subj = d.subject || '未分类'
      const type = TYPE_LABELS[d.questionType] || d.questionType || '其他'

      catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
      if (!subjByCat.has(cat)) subjByCat.set(cat, new Map())
      subjByCat.get(cat)!.set(subj, (subjByCat.get(cat)!.get(subj) ?? 0) + 1)
      typeMap.set(type, (typeMap.get(type) ?? 0) + 1)
    }

    const catEntries = [...catMap.entries()].sort((a, b) => b[1] - a[1])

    const middleData: { name: string; value: number; itemStyle: { color: string } }[] = []
    let colorIdx = 0
    for (const [cat] of catEntries) {
      const subjMap = subjByCat.get(cat)!
      const sorted = [...subjMap.entries()].sort((a, b) => b[1] - a[1])
      for (const [subj, count] of sorted) {
        middleData.push({
          name: subj,
          value: count,
          itemStyle: { color: MIDDLE_COLORS[colorIdx % MIDDLE_COLORS.length] },
        })
        colorIdx++
      }
    }

    const typeEntries = [...typeMap.entries()].sort((a, b) => b[1] - a[1])
    const outerData = typeEntries.map(([name, value], i) => ({
      name,
      value,
      itemStyle: { color: OUTER_COLORS[i % OUTER_COLORS.length] },
    }))

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11 },
        formatter: (p: { seriesName: string; name: string; value: number; percent: number }) =>
          `<b>${p.name}</b><br/>${p.seriesName}: ${p.value} 题 (${p.percent}%)`,
      },
      legend: {
        bottom: 0,
        textStyle: { color: textColor, fontSize: 10 },
        type: 'scroll' as const,
      },
      series: [
        {
          name: '分类',
          type: 'pie' as const,
          radius: ['18%', '34%'],
          center: ['50%', '48%'],
          itemStyle: { borderRadius: 3, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
          label: { show: true, position: 'inside' as const, fontSize: 9, color: isDark ? '#e2e8f0' : '#1e293b' },
          data: catEntries.map(([name, value], i) => ({
            name, value,
            itemStyle: { color: INNER_COLORS[i % INNER_COLORS.length] },
          })),
        },
        {
          name: '科目',
          type: 'pie' as const,
          radius: ['37%', '55%'],
          center: ['50%', '48%'],
          itemStyle: { borderRadius: 3, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 1.5 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
          data: middleData,
        },
        {
          name: '题型',
          type: 'pie' as const,
          radius: ['58%', '75%'],
          center: ['50%', '48%'],
          itemStyle: { borderRadius: 3, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 1.5 },
          label: {
            show: true,
            position: 'outside' as const,
            formatter: '{b} {c}',
            fontSize: 10,
            color: textColor,
            distanceToLabelLine: 4,
          },
          labelLine: { length: 16, length2: 12, lineStyle: { color: textColor } },
          data: outerData,
        },
      ],
    }
  }, [data, isDark, textColor])

  return <ReactECharts echarts={echarts} option={option} style={{ height: 480 }} />
}
