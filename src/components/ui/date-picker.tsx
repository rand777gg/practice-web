import { useState } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
      <PopoverContent className="w-auto overflow-hidden p-0 z-50" align="start" sideOffset={4}>
        <Calendar mode="single" selected={date} captionLayout="dropdown" defaultMonth={date}
          onSelect={(d) => { onSelect(d); setOpen(false) }}
          className="[--cell-size:2.5rem] p-4" />
      </PopoverContent>
    </Popover>
  )
}
