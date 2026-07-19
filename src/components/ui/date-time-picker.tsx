import { useState } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Props {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DateTimePicker({ date, onSelect, placeholder = "选择日期", className }: Props) {
  const [open, setOpen] = useState(false)

  const timeStr = date
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "00:00"

  const handleTime = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    const d = date ? new Date(date) : new Date()
    d.setHours(h, m, 0, 0)
    onSelect(d)
  }

  const handleDate = (d: Date | undefined) => {
    if (!d) { onSelect(undefined); setOpen(false); return }
    const cur = date ? new Date(date) : new Date()
    d.setHours(cur.getHours(), cur.getMinutes(), 0, 0)
    onSelect(d)
    setOpen(false)
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("flex-[6] justify-start text-xs font-normal h-8 min-w-0", !date && "text-muted-foreground")}>
            {date ? format(date, "yyyy-MM-dd") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="overflow-hidden p-0 z-50" align="center" sideOffset={4} style={{ width: 'calc(var(--radix-popover-trigger-width) * 0.8)' }}>
          <Calendar mode="single" selected={date} captionLayout="dropdown" defaultMonth={date}
            onSelect={handleDate} className="[--cell-size:3rem] p-4 w-full" />
        </PopoverContent>
      </Popover>
      <Input type="time" value={timeStr} onChange={(e) => handleTime(e.target.value)} step="60"
        className="flex-[4] h-8 text-xs px-2 [&::-webkit-calendar-picker-indicator]:hidden" />
    </div>
  )
}
