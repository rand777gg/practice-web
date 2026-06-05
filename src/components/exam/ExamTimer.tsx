import { cn } from '@/lib/utils'
import { useTimer } from '@/hooks/use-timer'

interface Props {
  startedAt: string
  durationMs: number
  onExpire: () => void
}

export function ExamTimer({ startedAt, durationMs, onExpire }: Props) {
  const elapsed = Date.now() - new Date(startedAt).getTime()
  const remaining = Math.max(0, durationMs - elapsed)

  const { formatted, isWarning, isExpired } = useTimer({
    durationMs: remaining,
    onExpire,
  })

  return (
    <div
      className={cn(
        'text-lg font-mono font-bold tabular-nums',
        isExpired && 'text-destructive',
        isWarning && !isExpired && 'text-yellow-600',
      )}
    >
      {formatted}
    </div>
  )
}
