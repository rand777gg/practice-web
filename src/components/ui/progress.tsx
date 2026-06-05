import { cn } from '@/lib/utils'

interface Props {
  value: number
  className?: string
}

export function Progress({ value, className }: Props) {
  const clamped = Math.min(Math.max(value, 0), 100)
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
