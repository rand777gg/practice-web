import { cn } from '@/lib/utils'
import { EXAM_GOALS, type ExamGoalValue } from '@/lib/exam-goals'

interface Props {
  value?: string | null
  onChange: (value: ExamGoalValue | '') => void
  className?: string
  compact?: boolean
}

/** 首页/计划区的备考目标胶囊选择器:考研 · 考公 · 期末考 · 其他考试 */
export function ExamGoalPicker({ value, onChange, className, compact }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border bg-card p-1',
        compact ? 'px-0.5' : 'px-1',
        className,
      )}
      role="group"
      aria-label="设定备考目标"
    >
      <span className={cn('pl-1.5 text-xs text-muted-foreground', compact && 'hidden sm:inline')}>目标</span>
      {EXAM_GOALS.map((g) => {
        const active = value === g.value
        return (
          <button
            key={g.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? '' : g.value)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              compact ? 'px-2' : 'px-2.5',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {g.label}
          </button>
        )
      })}
    </div>
  )
}
