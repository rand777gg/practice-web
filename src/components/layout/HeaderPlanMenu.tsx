import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import ReactECharts from "echarts-for-react"
import { Check, ChevronDown, Timer } from "lucide-react"

import echarts from "@/lib/echarts"
import { CATEGORY_COLORS, useChartPalette, withAlpha } from "@/lib/chart-theme"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { FocusTimer } from "./FocusTimer"
import { PlanDialog } from "./PlanDialog"
import { usePlanCompletion } from "@/hooks/use-plan-completion"
import { useFocusStore } from "@/stores/focus-store"
import { useT } from "@/i18n/use-t"

interface SubjectDetail {
  label: string
  done: number
  total: number
}

interface PlanRow {
  name: string
  done: number
  total: number
  today: number
  color: string
  details: SubjectDetail[]
}

export function HeaderPlanMenu() {
  const { t } = useT()
  const plan = usePlanCompletion()
  const pal = useChartPalette()
  const focusRunning = useFocusStore((s) => s.running)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)

  const planMode = searchParams.get("mode") === "random" ? "random" as const : "sequential" as const
  const handlePlanModeChange = (m: "sequential" | "random") => {
    setDialogOpen(false)
    navigate(`/practice?mode=${m === "sequential" ? "seq" : "random"}`)
  }

  const longDone = plan.longTerm.reduce((s, r) => s + r.doneAll, 0)
  const longTotal = plan.longTerm.reduce((s, r) => s + r.total, 0)
  const longToday = plan.longTerm.reduce((s, r) => s + r.doneToday, 0)
  const targetDone = plan.targets.reduce((s, g) => s + g.totalDone, 0)
  const targetTotal = plan.targets.reduce((s, g) => s + g.total, 0)

  const rows = useMemo<PlanRow[]>(() => {
    const list: PlanRow[] = []
    if (longTotal > 0) {
      list.push({
        name: `${t("plan.longTerm")} · ${t("plan.overall")}`,
        done: longDone,
        total: longTotal,
        today: longToday,
        color: CATEGORY_COLORS[0],
        details: plan.longTerm.map((r) => ({
          label: r.subject || t("plan.other"),
          done: r.doneAll,
          total: r.total,
        })),
      })
    }
    if (targetTotal > 0) {
      list.push({
        name: `${t("plan.daily")} · ${t("plan.today")}`,
        done: targetDone,
        total: targetTotal,
        today: targetDone,
        color: CATEGORY_COLORS[4],
        details: plan.targets.flatMap((g) =>
          g.subjects.map((s) => ({
            label: s.subject || t("plan.other"),
            done: s.done,
            total: s.count,
          }))
        ),
      })
    }
    return list
  }, [plan.longTerm, plan.targets, longDone, longTotal, longToday, targetDone, targetTotal, t])

  const option = useMemo(() => {
    if (rows.length === 0) return null
    const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)

    return {
      backgroundColor: "transparent",
      animation: true,
      animationDuration: 420,
      animationEasing: "cubicOut" as const,
      grid: { left: 0, right: 46, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: pal.panel,
        borderColor: pal.panelLine,
        textStyle: { color: pal.ink, fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params]
          const first = arr[0] as { dataIndex?: number } | undefined
          const row = first?.dataIndex !== undefined ? rows[first.dataIndex] : undefined
          if (!row) return ""
          const head = `<div style="font-weight:600;margin-bottom:2px">${row.name}</div>`
          const summary = `<div style="color:${pal.label};font-size:11px">${row.done}/${row.total} · ${pct(row.done, row.total)}%${row.today !== row.done ? ` · ${t("plan.today")} ${row.today}` : ""}</div>`
          const items = row.details
            .map(
              (d) =>
                `<div style="display:flex;gap:8px;font-size:11px"><span>${d.label}</span><span style="margin-left:auto;color:${pal.label}">${d.done}/${d.total}</span></div>`
            )
            .join("")
          return `${head}${summary}<div style="margin-top:4px;border-top:1px solid ${pal.panelLine};padding-top:4px">${items}</div>`
        },
      },
      xAxis: {
        type: "value" as const,
        max: 100,
        show: false,
      },
      yAxis: {
        type: "category" as const,
        inverse: true,
        data: rows.map((r) => r.name),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: pal.label, fontSize: 11 },
      },
      series: [
        {
          name: t("plan.doneCount"),
          type: "bar" as const,
          stack: "total",
          barWidth: 18,
          data: rows.map((r) => ({
            value: pct(r.done, r.total),
            itemStyle: { color: r.color, borderRadius: [4, 0, 0, 4] },
          })),
          label: {
            show: true,
            position: "inside" as const,
            color: "#fff",
            fontSize: 10,
            fontWeight: "bold" as const,
            formatter: (p: { value?: unknown }) => (Number(p.value) >= 12 ? `${p.value}%` : ""),
          },
        },
        {
          name: t("plan.remaining"),
          type: "bar" as const,
          stack: "total",
          barWidth: 18,
          data: rows.map((r) => ({
            value: 100 - pct(r.done, r.total),
            itemStyle: { color: withAlpha(r.color, 0.16), borderRadius: [0, 4, 4, 0] },
          })),
          label: {
            show: true,
            position: "right" as const,
            color: pal.ink,
            fontSize: 10,
            formatter: (p: { dataIndex?: number }) => {
              const row = p.dataIndex !== undefined ? rows[p.dataIndex] : undefined
              return row ? `${row.done}/${row.total}` : ""
            },
          },
        },
      ],
    }
  }, [rows, pal, t])

  if (plan.loading) return null

  const longPct = plan.dailyGoal > 0 ? Math.min(Math.round((plan.todayDone / plan.dailyGoal) * 100), 100) : 0
  const targetPct = targetTotal > 0 ? Math.min(Math.round((targetDone / targetTotal) * 100), 100) : 0
  const allDone = (plan.dailyGoal === 0 || plan.todayDone >= plan.dailyGoal) && (targetTotal === 0 || targetDone >= targetTotal)

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          {plan.hasPlan ? (
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground transition-colors min-w-0"
            >
              {allDone ? (
                <span className="flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                  <Check className="hidden h-3.5 w-3.5 sm:inline" />
                  <span className="hidden sm:inline">{t("plan.allDone")}</span>
                  <span className="sm:hidden">✓</span>
                </span>
              ) : (
                <>
                  {plan.dailyGoal > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("plan.longTerm")}</span>
                      <Progress value={longPct} className="h-2 w-10 [&>div]:bg-blue-500" />
                      <span className="shrink-0 tabular-nums text-[10px]">{plan.todayDone}/{plan.dailyGoal}</span>
                    </span>
                  )}
                  {targetTotal > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("plan.daily")}</span>
                      <Progress value={targetPct} className="h-2 w-10 [&>div]:bg-pink-500" />
                      <span className="shrink-0 tabular-nums text-[10px]">{targetDone}/{targetTotal}</span>
                    </span>
                  )}
                </>
              )}
              {focusRunning && <Timer className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent transition-colors"
            >
              {t("plan.setDeadline")}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[360px] space-y-3 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{t("nav.planCompletion")}</span>
            {plan.deadline && (
              <span className="text-[10px] text-muted-foreground">
                {t("plan.deadline")} {plan.deadline}
              </span>
            )}
          </div>

          {option ? (
            <div className="h-[104px] w-full">
              <ReactECharts
                echarts={echarts}
                option={option}
                notMerge
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          ) : (
            <p className="py-4 text-center text-[11px] text-muted-foreground">{t("plan.notSet")}</p>
          )}

          <Separator />
          <FocusTimer />
          <Separator />

          <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => setDialogOpen(true)}>
            {plan.hasPlan ? t("plan.change") : t("plan.setDeadline")}
          </Button>
        </PopoverContent>
      </Popover>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} mode={planMode} onModeChange={handlePlanModeChange} />
    </>
  )
}
