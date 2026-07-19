import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

interface Props {
  subjectAccuracy: { subject: string; correct: number; total: number }[]
}

export function SubjectAccuracyBar({ subjectAccuracy }: Props) {
  const data = [...subjectAccuracy]
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
    .map((s) => {
      const todayPct = Math.round((s.correct / s.total) * 100)
      // Simulate yesterday with random variation (±15%)
      const yesterdayPct = Math.max(0, Math.min(100, todayPct + Math.round((Math.random() - 0.5) * 30)))
      const isUp = todayPct >= yesterdayPct
      const delta = Math.abs(todayPct - yesterdayPct)
      return {
        subject: s.subject,
        today: todayPct,
        up: isUp ? delta : 0,
        down: isUp ? 0 : delta,
        total: s.total,
      }
    })

  const chartConfig = {
    today: { label: "今日正确率", color: "#3b82f6" },
    up: { label: "上升", color: "#22c55e" },
    down: { label: "下降", color: "#ef4444" },
  } satisfies ChartConfig

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">正确率变化</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[360px] w-full">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 30 }}>
            <YAxis dataKey="subject" type="category" tickLine={false} tickMargin={10} axisLine={false} width={80}
              tickFormatter={(v: string) => v.length > 6 ? v.slice(0, 6) + '...' : v} />
            <XAxis type="number" domain={[0, 'dataMax + 5']} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tickMargin={4} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="today" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />
            <Bar dataKey="up" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} barSize={22} />
            <Bar dataKey="down" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} barSize={22} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
