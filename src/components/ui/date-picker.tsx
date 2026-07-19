import { useState, useEffect } from "react"
import { parseDate } from "chrono-node"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function fmt(date: Date | undefined) {
  if (!date) return ""
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", year: "numeric" })
}

interface Props {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DatePicker({ date, onSelect, placeholder = "选择日期", className }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(date ? fmt(date) : "")

  useEffect(() => { setValue(date ? fmt(date) : "") }, [date])

  return (
    <InputGroup className={cn("w-full", className)}>
      <InputGroupInput
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value)
          const d = parseDate(e.target.value)
          if (d) onSelect(d)
        }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true) } }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="选择日期"><CalendarIcon /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="end" sideOffset={8}>
            <Calendar mode="single" selected={date} captionLayout="dropdown" defaultMonth={date}
              onSelect={(d) => { onSelect(d); setValue(fmt(d)); setOpen(false) }}
              className="[--cell-size:2.5rem] p-4" />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
