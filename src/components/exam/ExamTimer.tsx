import { cn } from '@/lib/utils'
import { useTimer } from '@/hooks/use-timer'
import { EXAM_DURATION_MS } from '@/lib/constants'

interface Props {
  startedAt: string
  onExpire: () => void
}

export function ExamTimer({ startedAt, onExpire }: Props) {
  const elapsed = Date.now() - new Date(startedAt).getTime()
  const remaining = Math.max(0, EXAM_DURATION_MS - elapsed)

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
