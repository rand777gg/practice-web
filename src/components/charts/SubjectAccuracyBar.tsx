import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

interface Props {
  subjectAccuracy: { subject: string; correct: number; total: number }[]
}

export function SubjectAccuracyBar({ subjectAccuracy }: Props) {
  const data = [...subjectAccuracy]
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
    .map((s) => {
      const pct = Math.round((s.correct / s.total) * 100)
      return { subject: s.subject, accuracy: pct, total: s.total }
    })

  const chartConfig = { accuracy: { label: "正确率 %" } } satisfies ChartConfig

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">正确率分析</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 30 }}>
            <YAxis dataKey="subject" type="category" tickLine={false} tickMargin={10} axisLine={false} width={80}
              tickFormatter={(value: string) => value.length > 6 ? value.slice(0, 6) + '...' : value} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tickMargin={4} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(v: any) => `${v}%`} />} />
            <Bar dataKey="accuracy" radius={4} barSize={20}>
              {data.map((d) => (
                <Cell key={d.subject} fill={d.accuracy >= 70 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 65%)"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
