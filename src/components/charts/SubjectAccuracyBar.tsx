import { useState, useEffect } from "react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useChartPalette } from "@/lib/chart-theme"

interface RpcAccRow {
  subject: string
  today_total: number
  yesterday_total: number
  today_correct: number
  yesterday_correct: number
}

interface AccRow {
  subject: string
  today: number
  up: number
  down: number
}

export function SubjectAccuracyBar() {
  const user = useAuthStore((s) => s.user)
  const pal = useChartPalette()
  const [data, setData] = useState<AccRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.rpc('get_accuracy_change', { p_user_id: user.id }).then(({ data: rows }) => {
      const list = ((rows ?? []) as RpcAccRow[])
        .filter((r) => Number(r.today_total) + Number(r.yesterday_total) >= 3)
        .map((r) => {
          const tPct = Number(r.today_total) > 0 ? Math.round((Number(r.today_correct) / Number(r.today_total)) * 100) : 0
          const yPct = Number(r.yesterday_total) > 0 ? Math.round((Number(r.yesterday_correct) / Number(r.yesterday_total)) * 100) : 0
          const isUp = tPct >= yPct
          const delta = Math.abs(tPct - yPct)
          return { subject: r.subject, today: tPct, up: isUp ? delta : 0, down: isUp ? 0 : delta }
        })
        .sort((a, b) => b.today - a.today)
      setData(list)
      setLoading(false)
    }, () => setLoading(false))
  }, [user])

  const chartConfig = {
    today: { label: "今日正确率", color: pal.brand },
    up: { label: "上升", color: pal.correct },
    down: { label: "下降", color: pal.wrong },
  } satisfies ChartConfig

  if (loading) return <div className="h-[300px] rounded-lg bg-muted/30 animate-pulse" />
  if (!data.length) return <div className="h-[300px] rounded-lg bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2 px-2">
        <CardTitle className="text-sm text-muted-foreground">正确率变化</CardTitle>
      </CardHeader>
      <CardContent className="px-1">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 24 }}>
            <YAxis dataKey="subject" type="category" tickLine={false} tickMargin={8} axisLine={false} width={70}
              tickFormatter={(v: string) => v.length > 6 ? v.slice(0, 6) + '…' : v} />
            <XAxis type="number" domain={[0, 'dataMax + 5']} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tickMargin={4} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="today" stackId="a" fill={pal.brand} radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="up" stackId="a" fill={pal.correct} radius={[0, 0, 0, 0]} barSize={18} />
            <Bar dataKey="down" stackId="a" fill={pal.wrong} radius={[0, 0, 0, 0]} barSize={18} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
