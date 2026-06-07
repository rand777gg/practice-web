import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'
import { useT } from '@/i18n/use-t'

interface Props {
  data: { subject: string; category: string }[]
}

const SUBJECT_COLORS = ['#7EC8E3', '#A0C4FF', '#B8B8FF', '#9ED6E5', '#C4DFE6', '#8BB8EA', '#A8D8EA', '#B5D0EE', '#C1E0F0', '#D0E4F0']
const CATEGORY_COLORS = ['#F0C4A8', '#F5D5A0', '#EEB4B4', '#F2C894', '#F4CCCC', '#E8C4A0', '#F5CFBA', '#F5E0B0', '#F0BEB0', '#F2D0C0']

function buildChartData(entries: [string, number][], colors: string[], isDark: boolean) {
  const textColor = isDark ? '#d1d5db' : '#374151'
  return {
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      center: ['50%', '50%'],
      itemStyle: { borderRadius: 6, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
      label: {
        show: true,
        position: 'outside' as const,
        formatter: '{b}',
        fontSize: 12,
        color: textColor,
      },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' },
      },
      data: entries.map(([name, value]) => ({ name, value })),
    }],
    color: colors,
  }
}

export function SubjectDonutCharts({ data }: Props) {
  const { t } = useT()
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'

  const { subjectOption, categoryOption } = useMemo(() => {
    const subjMap = new Map<string, number>()
    const catMap = new Map<string, number>()
    for (const d of data) {
      const s = d.subject || 'Other'
      const c = d.category
        ? /^\d{4}年真题$/.test(d.category) ? '真题' : d.category
        : 'Other'
      subjMap.set(s, (subjMap.get(s) ?? 0) + 1)
      catMap.set(c, (catMap.get(c) ?? 0) + 1)
    }
    return {
      subjectOption: buildChartData([...subjMap.entries()].sort((a, b) => b[1] - a[1]), SUBJECT_COLORS, isDark),
      categoryOption: buildChartData([...catMap.entries()].sort((a, b) => b[1] - a[1]), CATEGORY_COLORS, isDark),
    }
  }, [data, isDark])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-muted-foreground text-center mb-1">{t('questions.subject')}</p>
        <ReactECharts option={subjectOption} style={{ height: 360 }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground text-center mb-1">{t('questions.category')}</p>
        <ReactECharts option={categoryOption} style={{ height: 360 }} />
      </div>
    </div>
  )
}
