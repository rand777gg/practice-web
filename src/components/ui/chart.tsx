import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = Record<string, { label: string; color?: string }>

interface ChartContextValue { config: ChartConfig }
const ChartContext = React.createContext<ChartContextValue | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a <ChartContainer />")
  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"] }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden", className)}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, c]) => c.color)
  if (!colorConfig.length) return null
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: colorConfig.map(([key, c]) => `${id} [data-chart="${id}"] { --color-${key}: ${c.color}; }`).join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
    hideLabel?: boolean; hideIndicator?: boolean; indicator?: "line" | "dot" | "dashed"
    nameKey?: string; labelKey?: string; className?: string
  }
>(({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, color, nameKey, labelKey }) => {
  const { config } = useChart()
  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null
    const [item] = payload
    const key = `${labelKey || item.dataKey || item.name || "value"}`
    const itemConfig = config[key]
    const value = !labelKey && typeof label === "string" ? config[label]?.label || label : itemConfig?.label || itemConfig?.label || key
    if (labelFormatter) return <>{labelFormatter(value, payload)}</>
    return <div className={cn("font-medium", labelClassName)}>{value}</div>
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey])

  if (!active || !payload?.length) return null

  const nestLabel = payload.length === 1 && indicator !== "dot"
  return (
    <div className={cn("grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl", className)}>
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((p: any, i: number) => {
          const key = `${nameKey || p.dataKey || p.name || "value"}`
          const itemConfig = config[key]
          const indicatorColor = color || p.payload.fill || p.color
          return (
            <div key={i} className="flex items-center gap-1.5">
              {!hideIndicator && (
                <div className={cn("shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)", indicator === "dot" ? "size-2.5 rounded-full" : "w-1", indicator === "line" ? "w-1 shrink-0 rounded-[2px]" : "")} style={{ "--color-bg": indicatorColor, "--color-border": indicatorColor } as React.CSSProperties} />
              )}
              <div className="flex w-full items-center justify-between gap-2">
                {nestLabel ? tooltipLabel : null}
                <span className="text-muted-foreground">{itemConfig?.label || key}</span>
                {p.value != null && <span className="font-mono font-medium tabular-nums text-foreground">{p.value.toLocaleString()}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend
const ChartLegendContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { nameKey?: string }>(({ className, nameKey, ...props }, ref) => {
  const { config } = useChart()
  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-3 pt-4", className)} {...props}>
      {Object.entries(config).map(([key, item]) => (
        <div key={key} className="flex items-center gap-1.5 text-xs">
          <div className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  )
})
ChartLegendContent.displayName = "ChartLegend"

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent }
