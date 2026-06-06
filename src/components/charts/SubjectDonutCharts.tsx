import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/theme-store'
import { useT } from '@/i18n/use-t'

interface Props {
  data: { subject: string; category: string }[]
}

const COLORS = ['#91cc75', '#5470c6', '#fac858', '#ee6666', '#73c0de', '#fc8452', '#9a60b4', '#ea7ccc', '#3ba272']

function buildChartData(entries: [string, number][], isDark: boolean) {
  const textColor = isDark ? '#d1d5db' : '#374151'
  return {
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie',
      radius: ['45%', '75%'],
      center: ['50%', '55%'],
      itemStyle: { borderRadius: 6, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
      label: {
        show: true,
        position: 'outside' as const,
        formatter: '{b}\n{d}%',
        fontSize: 11,
        color: textColor,
      },
      data: entries.map(([name, value]) => ({ name, value })),
    }],
    color: COLORS,
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
      const c = d.category || 'Other'
      subjMap.set(s, (subjMap.get(s) ?? 0) + 1)
      catMap.set(c, (catMap.get(c) ?? 0) + 1)
    }
    return {
      subjectOption: buildChartData([...subjMap.entries()].sort((a, b) => b[1] - a[1]), isDark),
      categoryOption: buildChartData([...catMap.entries()].sort((a, b) => b[1] - a[1]), isDark),
    }
  }, [data, isDark])

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-muted-foreground text-center mb-1">{t('questions.subject')}</p>
        <ReactECharts option={subjectOption} style={{ height: 280 }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground text-center mb-1">{t('questions.category')}</p>
        <ReactECharts option={categoryOption} style={{ height: 280 }} />
      </div>
    </div>
  )
}
