import { useState, useEffect } from "react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { QUESTION_TYPE_OPTIONS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { CATEGORY_COLORS } from "@/lib/chart-theme"

interface Props { planSubjects: string[] }

const ALL_TYPES = QUESTION_TYPE_OPTIONS.map(o => o.value)
const TYPE_LABELS: Record<string, string> = Object.fromEntries(QUESTION_TYPE_OPTIONS.map(o => [o.value, o.label]))

interface TypeAccuracyRow { subject: string; question_type: string; correct: number; total: number }

export function SubjectTypeRadar({ planSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<Record<string, number | string>[]>([])
  const [chartConfig, setChartConfig] = useState<ChartConfig>({})

  useEffect(() => {
    if (!user || !planSubjects.length) return
    supabase.rpc('get_type_accuracy', { p_user_id: user.id, p_subjects: planSubjects }).then(({ data: rows }) => {
      const list = (rows ?? []) as TypeAccuracyRow[]

      const subjMap = new Map<string, Map<string, number>>()
      for (const r of list) {
        const s = r.subject; const t = r.question_type
        const pct = Number(r.total) > 0 ? Math.round((Number(r.correct) / Number(r.total)) * 100) : 100
        if (!subjMap.has(s)) subjMap.set(s, new Map())
        subjMap.get(s)!.set(t, pct)
      }

      const subjs = [...new Set([...subjMap.keys(), ...planSubjects])]
      const cfg: ChartConfig = {}
      subjs.forEach((s, i) => { cfg[s] = { label: s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] } })
      setChartConfig(cfg)

      const radarData = ALL_TYPES.map(t => {
        const entry: Record<string, number | string> = { type: TYPE_LABELS[t] || t }
        for (const s of subjs) entry[s] = subjMap.get(s)?.get(t) ?? 100
        return entry
      })
      setChartData(radarData)
      setLoading(false)
    }, () => setLoading(false))
  }, [user, planSubjects.join(',')])

  if (!planSubjects.length) return null
  if (loading) return <div className="aspect-square max-h-[300px] rounded-lg bg-muted/30 animate-pulse mx-auto" />

  const colors = CATEGORY_COLORS

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="items-center pb-2 px-2">
        <CardTitle className="text-sm text-muted-foreground">题型正确率</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
          <RadarChart data={chartData} margin={{ top: -20, bottom: -10 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <PolarAngleAxis dataKey="type" tick={{ fontSize: 11 }} />
            <PolarGrid />
            {Object.keys(chartConfig).map((s, i) => (
              <Radar key={s} dataKey={s} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} strokeWidth={2} />
            ))}
            <ChartLegend className="mt-6" content={<ChartLegendContent />} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
