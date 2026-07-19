import * as React from "react"
import { cn } from "@/lib/utils"

const InputGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex items-stretch rounded-md [&_input]:rounded-r-none [&_button:last-child]:rounded-l-none", className)} {...props} />
  )
)
InputGroup.displayName = "InputGroup"

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />
  )
)
InputGroupInput.displayName = "InputGroupInput"

const InputGroupAddon = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { align?: "inline-start" | "inline-end" }>(
  ({ className, align = "inline-end", ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center", align === "inline-end" ? "-ml-px" : "-mr-px order-first", className)} {...props} />
  )
)
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & { variant?: string; size?: string }>(
  ({ className, ...props }, ref) => (
    <button ref={ref} type="button" className={cn("inline-flex items-center justify-center rounded-md border border-input bg-transparent h-8 w-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground", className)} {...props} />
  )
)
InputGroupButton.displayName = "InputGroupButton"

export { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton }
