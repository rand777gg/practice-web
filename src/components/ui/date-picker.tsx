import { useState, lazy, Suspense } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// react-day-picker（DayPicker + DayButton + 整套主题化逻辑，压缩前约 89KB）只在**弹层打开时**才需要，
// 而 <Calendar> 是本文件里唯一用到它的地方。静态 import 会让急切布局里的 PlanDialog（以及 PlanWatcher）
// 把它一起拖进入口 chunk —— 它此前就出现在首屏预加载列表里。懒加载放在这里而不是调用方：
// 两个调用方都不用改，而且触发按钮（只用到 date-fns 的 format）照旧立刻渲染。
const Calendar = lazy(() => import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })))

interface Props {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DatePicker({ date, onSelect, placeholder = "选择日期", className }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-full min-w-[160px] justify-start text-xs font-normal h-8", !date && "text-muted-foreground", className)}>
          {date ? format(date, "yyyy-MM-dd") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="overflow-hidden p-0 z-50" align="center" sideOffset={4} style={{ width: 276 }}>
        {/* fallback 占住与日历相当的高度，避免打开弹层后再跳一下 */}
        <Suspense fallback={<div style={{ height: 320 }} />}>
          <Calendar mode="single" selected={date} captionLayout="dropdown" defaultMonth={date}
            onSelect={(d) => { onSelect(d); setOpen(false) }}
            className="[--cell-size:2.25rem] p-3 w-full" />
        </Suspense>
      </PopoverContent>
    </Popover>
  )
}
