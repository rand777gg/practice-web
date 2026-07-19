"use client"

import { useState, useEffect, useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"

const SUBJECT_COLORS = ["#3b82f6","#ec4899","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#6366f1","#14b8a6"]

interface Props {
  planSubjects: string[]
  targetSubjects: string[]
}

export function PlanCompletionChart({ planSubjects, targetSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<Record<string, any>[]>([])
  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [activeChart, setActiveChart] = useState<"plan" | "target" | "all">("plan")

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {
      plan: { label: "长期计划", color: "#3b82f6" },
      target: { label: "自定义目标", color: "#ec4899" },
      all: { label: "全部", color: "#10b981" },
    }
    allSubjects.forEach((s, i) => { cfg[s] = { label: s, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] } })
    return cfg
  }, [allSubjects])

  useEffect(() => {
    if (!user) return
    const subjects = [...new Set([...planSubjects, ...targetSubjects])]
    if (subjects.length === 0) { setLoading(false); return }

    supabase.rpc('get_daily_completion', {
      p_user_id: user.id, p_days: 30, p_subjects: subjects,
    }).then(({ data }) => {
      const rows = (data ?? []) as { day: string; subject: string; count: number }[]
      const planSet = new Set(planSubjects)
      const targetSet = new Set(targetSubjects)
      const dailyMap = new Map<string, Record<string, number>>()
      const allSubjs = new Set<string>()
      for (const r of rows) {
        const day = r.day.slice(0, 10)
        allSubjs.add(r.subject)
        let entry = dailyMap.get(day)
        if (!entry) { entry = {}; dailyMap.set(day, entry) }
        const subjKey = planSet.has(r.subject) ? ('plan_' + r.subject) : targetSet.has(r.subject) ? ('target_' + r.subject) : r.subject
        entry[subjKey] = (entry[subjKey] || 0) + Number(r.count)
        entry.plan = (entry.plan || 0) + (planSet.has(r.subject) ? Number(r.count) : 0)
        entry.target = (entry.target || 0) + (targetSet.has(r.subject) ? Number(r.count) : 0)
      }
      setAllSubjects([...allSubjs].sort())
      setChartData([...dailyMap.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })))
      setLoading(false)
    }, () => setLoading(false))
  }, [user, planSubjects.join(','), targetSubjects.join(',')])

  const totals = useMemo(() => ({
    plan: chartData.reduce((s, d) => s + (d.plan || 0), 0),
    target: chartData.reduce((s, d) => s + (d.target || 0), 0),
    all: chartData.reduce((s, d) => s + (d.plan || 0) + (d.target || 0), 0),
  }), [chartData])

  const keys = ["plan", "target", "all"] as const

  if (!user || (!planSubjects.length && !targetSubjects.length)) return null
  if (loading) return <div className="h-48 rounded-lg bg-muted animate-pulse" />

  const isStacked = activeChart === "all"

  return (
    <Card className="border-0 shadow-none py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3">
          <CardTitle className="text-sm">每日计划完成对比</CardTitle>
        </div>
        <div className="flex">
          {keys.map((key) => (
            <button
              key={key}
              data-active={activeChart === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l"
              onClick={() => setActiveChart(key)}
            >
              <span className="text-xs text-muted-foreground">{chartConfig[key].label}</span>
              <span className="text-lg leading-none font-bold">{totals[key].toLocaleString()}</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          {isStacked ? (
            <BarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
                tickFormatter={(value) => { const d = new Date(value); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {allSubjects.map((s, i) => (
                <Bar key={s} dataKey={`plan_${s}`} stackId="a" fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} maxBarSize={24} />
              ))}
              {allSubjects.map((s, i) => (
                <Bar key={`t_${s}`} dataKey={`target_${s}`} stackId="a" fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} maxBarSize={24} />
              ))}
            </BarChart>
          ) : (
            <BarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
                tickFormatter={(value) => { const d = new Date(value); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }} />
              <ChartTooltip content={<ChartTooltipContent className="w-[150px]" nameKey={activeChart} />} />
              <Bar dataKey={activeChart} fill={chartConfig[activeChart].color} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
