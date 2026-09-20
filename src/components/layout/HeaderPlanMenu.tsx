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
import { cn } from "@/lib/utils"
import { FocusTimer } from "./FocusTimer"
import { PlanDialog } from "./PlanDialog"
import { subjectDailyProgress, usePlanCompletion } from "@/hooks/use-plan-completion"
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

  // 练习模式: seq=顺序刷题 / random=随机抽题 / review=复习错题与收藏
  const urlMode = searchParams.get("mode")
  const planMode = urlMode === "random" ? "random" as const : urlMode === "review" ? "review" as const : "sequential" as const
  const handlePlanModeChange = (m: "sequential" | "random" | "review") => {
    setDialogOpen(false)
    navigate(`/practice?mode=${m === "sequential" ? "seq" : m}`)
  }

  const longDone = plan.longTerm.reduce((s, r) => s + r.doneAll, 0)
  const longTotal = plan.longTerm.reduce((s, r) => s + r.total, 0)
  const longToday = plan.longTerm.reduce((s, r) => s + r.doneToday, 0)
  // 自定义计划: 按"这批刷够 X 题"的完成度算
  const goalTotal = plan.goals.reduce((s, g) => s + g.quantity, 0)
  const goalDone = plan.goals.reduce((s, g) => s + Math.min(g.done, g.quantity), 0)

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
    if (goalTotal > 0) {
      const bySubject = new Map<string, SubjectDetail>()
      for (const g of plan.goals) {
        const cur = bySubject.get(g.subject) ?? { label: g.subject || t("plan.other"), done: 0, total: 0 }
        cur.done += Math.min(g.done, g.quantity)
        cur.total += g.quantity
        bySubject.set(g.subject, cur)
      }
      list.push({
        name: `${t("plan.daily")} · ${t("plan.overall")}`,
        done: goalDone,
        total: goalTotal,
        today: goalDone,
        color: CATEGORY_COLORS[4],
        details: [...bySubject.values()],
      })
    }
    return list
  }, [plan.longTerm, plan.goals, longDone, longTotal, longToday, goalDone, goalTotal, t])

  /**
   * 长期计划下每个学科"今天该刷多少 / 今天已经刷了多少": 一科一层文字 + 一层进度条,
   * 和计划设置里那些学科行同一个排布(名字/数字一行, 下面一条全宽进度条)。
   */
  const subjectBars = useMemo(
    () => subjectDailyProgress(plan.longTerm, plan.rounds, plan.deadline),
    [plan.longTerm, plan.rounds, plan.deadline],
  )

  const option = useMemo(() => {
    if (rows.length === 0) return null
    const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)

    return {
      backgroundColor: "transparent",
      animation: true,
      animationDuration: 420,
      animationEasing: "cubicOut" as const,
      grid: { left: 0, right: 54, top: 4, bottom: 4, containLabel: true },
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
  const targetPct = plan.goalPerDay > 0 ? Math.min(Math.round((plan.goalTodayDone / plan.goalPerDay) * 100), 100) : 0
  const allDone = (plan.dailyGoal === 0 || plan.todayDone >= plan.dailyGoal)
    && (plan.goals.length === 0 || plan.goals.every((g) => g.state === 'done'))

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
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("plan.today")}</span>
                      <Progress value={longPct} className="h-2 w-10 [&>div]:bg-blue-500" />
                      <span className="shrink-0 tabular-nums text-[10px]">{plan.todayDone}/{plan.dailyGoal}</span>
                    </span>
                  )}
                  {plan.goalPerDay > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("plan.daily")}</span>
                      <Progress value={targetPct} className="h-2 w-10 [&>div]:bg-pink-500" />
                      <span className="shrink-0 tabular-nums text-[10px]">{plan.goalTodayDone}/{plan.goalPerDay}</span>
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
        <PopoverContent align="start" sideOffset={6} className="max-h-[70vh] w-[360px] space-y-3 overflow-y-auto p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{t("nav.planCompletion")}</span>
            {plan.deadline && (
              <span className="text-[10px] text-muted-foreground">
                {t("plan.deadline")} {plan.deadline}
              </span>
            )}
          </div>

          {option ? (
            <div className="w-full" style={{ height: Math.max(104, rows.length * 34 + 14) }}>
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

          {/* 长期计划下每个学科的每天的量: 文字一层(学科 + 排期, 右边今日题数), 进度条一层 */}
          {subjectBars.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">
                {t("plan.longTerm")}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t("plan.bySchedule")}
              </p>
              {subjectBars.map((s) => {
                const perDay = s.perDay
                const pct = perDay > 0 ? Math.min(Math.round((s.doneToday / perDay) * 100), 100) : 0
                const pace = perDay > 0
                  ? <>
                      {s.round !== null && <>{t("plan.roundPrefix")}{s.round}{t("plan.roundsUnit")}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" /></>}
                      {t("plan.remaining")}{s.remaining}{t("plan.questions")} ÷ {s.days}{t("plan.daysUnit")} ≈ {perDay}{t("plan.perDay")}
                    </>
                  : t("plan.roundsAllDone")
                return (
                  <div key={s.subject} className="space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-muted-foreground">
                        <span className="text-foreground">{s.subject}</span>
                        <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{pace}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.doneToday}/{perDay}{t("plan.questions")}
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className={cn('h-1.5', perDay > 0 ? '[&>div]:bg-blue-500' : '[&>div]:bg-emerald-500')}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {plan.reviewCount > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t("plan.today")} {plan.todayDone}/{plan.dailyGoal} {t("plan.questions")}
              <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{t("plan.reviewIncluded")} <b className="text-pink-500 dark:text-pink-400">{plan.reviewCount}</b> {t("plan.questions")}
            </p>
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
