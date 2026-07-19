import { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

interface Props {
  planSubjects: string[]
  targetSubjects: string[]
}

export function PlanCompletionChart({ planSubjects, targetSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)

  const [chartOption, setChartOption] = useState<object | null>(null)

  useEffect(() => {
    if (!user) return
    const allSubjects = [...new Set([...planSubjects, ...targetSubjects])]
    if (allSubjects.length === 0) { setLoading(false); return }

    supabase.rpc('get_daily_completion', {
      p_user_id: user.id,
      p_days: 30,
      p_subjects: allSubjects,
    }).then(({ data }) => {
      const rows = (data ?? []) as { day: string; subject: string; count: number }[]

      // Aggregate by day and plan type
      const planSet = new Set(planSubjects)
      const targetSet = new Set(targetSubjects)
      const dailyMap = new Map<string, { plan: number; target: number }>()

      for (const r of rows) {
        const day = r.day.slice(5) // MM-DD
        let entry = dailyMap.get(day)
        if (!entry) { entry = { plan: 0, target: 0 }; dailyMap.set(day, entry) }
        if (planSet.has(r.subject)) entry.plan += Number(r.count)
        if (targetSet.has(r.subject)) entry.target += Number(r.count)
      }

      const days = [...dailyMap.keys()].sort()
      const planData = days.map(d => dailyMap.get(d)!.plan)
      const targetData = days.map(d => dailyMap.get(d)!.target)

      setChartOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['长期计划', '自定义目标'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 8, right: 8, top: 8, bottom: 28 },
        xAxis: { type: 'category', data: days, axisLabel: { fontSize: 9, rotate: 45 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10 } },
        series: [
          { name: '长期计划', type: 'bar', data: planData, itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
          { name: '自定义目标', type: 'bar', data: targetData, itemStyle: { color: '#ec4899', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
        ],
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user, planSubjects.join(','), targetSubjects.join(',')])

  if (!user || (!planSubjects.length && !targetSubjects.length)) return null
  if (loading || !chartOption) return <div className="h-48 rounded-lg bg-muted animate-pulse" />

  return <ReactECharts echarts={echarts} option={chartOption} style={{ height: 220 }} />
}
