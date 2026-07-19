import { useState, useEffect, useMemo } from "react"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { QUESTION_TYPE_OPTIONS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

interface Props { planSubjects: string[] }

const ALL_TYPES = QUESTION_TYPE_OPTIONS.map(o => o.value)
const TYPE_LABELS: Record<string, string> = Object.fromEntries(QUESTION_TYPE_OPTIONS.map(o => [o.value, o.label]))

const COLORS = ["#3b82f6","#ec4899","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4"]

export function SubjectTypeRadar({ planSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])
  const [subjects, setSubjects] = useState<string[]>([])

  useEffect(() => {
    if (!user || !planSubjects.length) { setLoading(false); return }
    supabase.rpc('get_type_accuracy', { p_user_id: user.id, p_subjects: planSubjects }).then(({ data: rows }) => {
      const list = (rows ?? []) as any[]

      // Build subject → type → pct map
      const subjMap = new Map<string, Map<string, number>>()
      for (const r of list) {
        const s = r.subject
        const t = r.question_type
        const pct = Number(r.total) > 0 ? Math.round((Number(r.correct) / Number(r.total)) * 100) : 100
        if (!subjMap.has(s)) subjMap.set(s, new Map())
        subjMap.get(s)!.set(t, pct)
      }

      const subjs = [...subjMap.keys()]
      setSubjects(subjs)

      // Build radar data: one entry per ALL types, with each subject's accuracy
      const radarData = ALL_TYPES.map(t => {
        const entry: any = { type: TYPE_LABELS[t] || t }
        for (const s of subjs) {
          entry[s] = subjMap.get(s)?.get(t) ?? 100 // default 100% if no data
        }
        return entry
      })
      setChartData(radarData)
      setLoading(false)
    }, () => setLoading(false))
  }, [user, planSubjects.join(',')])

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {}
    subjects.forEach((s, i) => { cfg[s] = { label: s, color: COLORS[i % COLORS.length] } })
    return cfg
  }, [subjects])

  if (!planSubjects.length) return null
  if (loading) return <div className="h-[300px] rounded-lg bg-muted/30 animate-pulse" />

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2 px-2">
        <CardTitle className="text-sm text-muted-foreground">题型正确率</CardTitle>
      </CardHeader>
      <CardContent className="px-1">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <RadarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <PolarGrid />
            <PolarAngleAxis dataKey="type" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            {subjects.map((s, i) => (
              <Radar key={s} dataKey={s} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
            ))}
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
