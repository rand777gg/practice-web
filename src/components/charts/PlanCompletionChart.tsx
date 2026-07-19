"use client"

import { useState, useEffect } from "react"
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

export function PlanCompletionChart({ planSubjects, targetSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<{ date: string; plan: number; target: number }[]>([])

  useEffect(() => {
    if (!user) return
    const allSubjects = [...new Set([...planSubjects, ...targetSubjects])]
    if (allSubjects.length === 0) { setLoading(false); return }

    supabase.rpc('get_daily_completion', {
      p_user_id: user.id, p_days: 30, p_subjects: allSubjects,
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

  if (!user || (!planSubjects.length && !targetSubjects.length)) return null
  if (loading) return <div className="h-48 rounded-lg bg-muted animate-pulse" />

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">每日计划完成对比</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
              tickFormatter={(value) => { const d = new Date(value); return `${d.getMonth()+1}/${d.getDate()}` }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="plan" fill="var(--color-plan)" radius={[4, 4, 0, 0]} maxBarSize={16} />
            <Bar dataKey="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
