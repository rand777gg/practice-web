"use client"

import { useState, useEffect, useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

interface Props {
  planSubjects: string[]
  targetSubjects: string[]
}

const chartConfig = {
  plan: { label: "长期计划", color: "#3b82f6" },
  target: { label: "自定义目标", color: "#ec4899" },
} satisfies ChartConfig

type ActiveKey = keyof typeof chartConfig

export function PlanCompletionChart({ planSubjects, targetSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<{ date: string; plan: number; target: number }[]>([])
  const [activeChart, setActiveChart] = useState<ActiveKey>("plan")

  useEffect(() => {
    if (!user) return
    const allSubjects = [...new Set([...planSubjects, ...targetSubjects])]
    if (allSubjects.length === 0) { setLoading(false); return }

    supabase.rpc('get_daily_completion', {
      p_user_id: user.id, p_days: 60, p_subjects: allSubjects,
    }).then(({ data }) => {
      const rows = (data ?? []) as { day: string; subject: string; count: number }[]
      const planSet = new Set(planSubjects)
      const targetSet = new Set(targetSubjects)
      const dailyMap = new Map<string, { plan: number; target: number }>()
      for (const r of rows) {
        const day = r.day.slice(0, 10)
        let entry = dailyMap.get(day)
        if (!entry) { entry = { plan: 0, target: 0 }; dailyMap.set(day, entry) }
        if (planSet.has(r.subject)) entry.plan += Number(r.count)
        if (targetSet.has(r.subject)) entry.target += Number(r.count)
      }
      setChartData([...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user, planSubjects.join(','), targetSubjects.join(',')])

  const totals = useMemo(() => ({
    plan: chartData.reduce((s, d) => s + d.plan, 0),
    target: chartData.reduce((s, d) => s + d.target, 0),
  }), [chartData])

  if (!user || (!planSubjects.length && !targetSubjects.length)) return null
  if (loading) return <div className="h-48 rounded-lg bg-muted animate-pulse" />

  return (
    <Card className="border-0 shadow-none py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-0!">
          <CardTitle className="text-sm">每日计划完成对比</CardTitle>
        </div>
        <div className="flex">
          {(Object.keys(chartConfig) as ActiveKey[]).map((key) => (
            <button
              key={key}
              data-active={activeChart === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l"
              onClick={() => setActiveChart(key)}
            >
              <span className="text-xs text-muted-foreground">{chartConfig[key].label}</span>
              <span className="text-lg leading-none font-bold">
                {totals[key].toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
              tickFormatter={(value) => { const d = new Date(value); return `${d.getMonth()+1}/${d.getDate()}` }} />
            <ChartTooltip content={<ChartTooltipContent className="w-[150px]" labelFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} />} />
            <Bar dataKey={activeChart} fill={`var(--color-${activeChart})`} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
