import { useState, useEffect, useMemo } from "react"
import ReactECharts from "echarts-for-react"
import echarts from "@/lib/echarts"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useChartPalette, CATEGORY_COLORS, withAlpha } from "@/lib/chart-theme"

interface Props {
  planSubjects: string[]
  targetSubjects: string[]
}

type Mode = "all" | "plan" | "target"

interface DailyRow { date: string; plan: number; target: number }

function pad(n: number) { return String(n).padStart(2, "0") }
function localKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function localStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** 首答日距今天的天数(含今天),用于 RPC 的 p_days 范围 */
function daysSince(d: Date) {
  const today = localStart(new Date())
  const start = localStart(d)
  return Math.max(Math.round((today.getTime() - start.getTime()) / 86400000) + 1, 1)
}

/** echarts 交错入场回调:兼容 传入 number(dataIndex) 或 {dataIndex} 对象,防御空参数 */
function stagger(p: unknown, ms = 12): number {
  let idx = 0
  if (typeof p === "number") idx = p
  else if (p && typeof p === "object" && "dataIndex" in p && typeof (p as { dataIndex?: unknown }).dataIndex === "number") {
    idx = (p as { dataIndex: number }).dataIndex
  }
  return idx * ms
}

export function PlanCompletionChart({ planSubjects, targetSubjects }: Props) {
  const user = useAuthStore((s) => s.user)
  const pal = useChartPalette()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DailyRow[]>([])
  const [active, setActive] = useState<Mode>("all")

  const labels = { all: "全部", plan: "长期计划", target: "自定义目标" }
  const colors = { plan: CATEGORY_COLORS[0], target: CATEGORY_COLORS[4], all: CATEGORY_COLORS[1] }

  useEffect(() => {
    if (!user) return
    const subjects = [...new Set([...planSubjects, ...targetSubjects])]
    if (subjects.length === 0) return
    let live = true

    ;(async () => {
      // 找到用户做第一题的那一天,作为时间轴的"第一天"
      const { data: firstRows } = await supabase
        .from('user_answers')
        .select('answered_at')
        .eq('user_id', user.id)
        .order('answered_at', { ascending: true })
        .limit(1)
      if (!live) return
      const firstAt = (firstRows as { answered_at: string }[] | null)?.[0]?.answered_at
      const firstDay = firstAt ? localStart(new Date(firstAt)) : localStart(new Date())

      const total = daysSince(firstDay)
      const { data: raw } = await supabase.rpc('get_daily_completion', {
        p_user_id: user.id,
        p_days: total,
        p_subjects: subjects,
      })
      if (!live) return

      const list = (raw ?? []) as { day: string; subject: string; count: number }[]
      const planSet = new Set(planSubjects)
      const targetSet = new Set(targetSubjects)
      const counts = new Map<string, { plan: number; target: number }>()
      for (const r of list) {
        const date = String(r.day).slice(0, 10)
        let c = counts.get(date)
        if (!c) { c = { plan: 0, target: 0 }; counts.set(date, c) }
        const n = Number(r.count) || 0
        if (planSet.has(r.subject)) c.plan += n
        if (targetSet.has(r.subject)) c.target += n
      }

      // 补全为连续日历天(首答日 → 今天),保证时间轴可拖可缩放
      const today = localStart(new Date())
      const full: DailyRow[] = []
      for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
        const key = localKey(d)
        const c = counts.get(key) ?? { plan: 0, target: 0 }
        full.push({ date: key, plan: c.plan, target: c.target })
      }
      setRows(full)
      setLoading(false)
    })().catch(() => { if (live) setLoading(false) })

    return () => { live = false }
  }, [user, planSubjects.join(','), targetSubjects.join(',')])

  const totals = useMemo(() => ({
    all: rows.reduce((s, r) => s + r.plan + r.target, 0),
    plan: rows.reduce((s, r) => s + r.plan, 0),
    target: rows.reduce((s, r) => s + r.target, 0),
  }), [rows])

  const option = useMemo(() => {
    if (!rows.length) return null
    const dates = rows.map((r) => r.date.slice(5))
    const axisLabel = { color: pal.label, fontSize: 10 }

    const series =
      active === "all"
        ? [
            { name: "长期计划", type: "bar" as const, stack: "a", barMaxWidth: 20, color: colors.plan, data: rows.map((r) => r.plan) },
            {
              name: "自定义目标",
              type: "bar" as const,
              stack: "a",
              barMaxWidth: 20,
              color: colors.target,
              data: rows.map((r) => r.target),
              animationDelay: (p: unknown) => stagger(p, 12) + 100,
            },
          ]
        : [{ name: labels[active], type: "bar" as const, barMaxWidth: 20, color: colors[active], data: rows.map((r) => (active === "plan" ? r.plan : r.target)) }]

    return {
      backgroundColor: "transparent",
      animation: true,
      animationEasing: "elasticOut",
      animationDelay: (p: unknown) => stagger(p, 12),
      animationDelayUpdate: (p: unknown) => stagger(p, 5),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
        valueFormatter: (v: number | string) => `${v} 题`,
      },
      legend:
        active === "all"
          ? { top: 0, right: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: axisLabel, data: ["长期计划", "自定义目标"] }
          : undefined,
      grid: { left: 8, right: 12, top: 34, bottom: 52, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: dates,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: pal.line } },
        axisLabel: { ...axisLabel, hideOverlap: true },
      },
      yAxis: {
        type: "value" as const,
        splitLine: { lineStyle: { color: pal.line } },
        axisLabel,
      },
      dataZoom: [
        { type: "inside" as const, xAxisIndex: 0, minValueSpan: 3 },
        {
          type: "slider" as const,
          xAxisIndex: 0,
          bottom: 4,
          height: 18,
          minValueSpan: 3,
          borderColor: pal.panelLine,
          backgroundColor: "transparent",
          fillerColor: withAlpha(pal.brand, 0.14),
          handleStyle: { color: pal.brand, borderColor: pal.brand },
          moveHandleStyle: { color: withAlpha(pal.brand, 0.5) },
          dataBackground: { lineStyle: { color: pal.line }, areaStyle: { color: withAlpha(pal.brand, 0.06) } },
          selectedDataBackground: { lineStyle: { color: pal.brand }, areaStyle: { color: withAlpha(pal.brand, 0.16) } },
          textStyle: { color: pal.label, fontSize: 10 },
        },
      ],
      series,
    }
  }, [rows, active, pal])

  const modes = ["all", "plan", "target"] as const

  if (!user || (!planSubjects.length && !targetSubjects.length)) return null
  if (loading) return <div className="h-56 rounded-lg bg-muted animate-pulse" />

  return (
    <Card className="border-0 shadow-none py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3">
          <CardTitle className="text-sm">每日计划完成对比</CardTitle>
          <p className="text-xs text-muted-foreground/70">
            时间轴自你作答的第一天起 · 默认展示全部范围,可拖动滑块或滚轮缩放查看
          </p>
        </div>
        <div className="flex">
          {modes.map((key) => (
            <button
              key={key}
              data-active={active === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l whitespace-nowrap cursor-pointer"
              onClick={() => setActive(key)}
            >
              <span className="text-xs text-muted-foreground">{labels[key]}</span>
              <span className="text-3xl leading-none font-bold tabular-nums">{totals[key].toLocaleString()}</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {option ? (
          <ReactECharts echarts={echarts} option={option} notMerge style={{ height: 300, width: "100%" }} />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>
        )}
      </CardContent>
    </Card>
  )
}
