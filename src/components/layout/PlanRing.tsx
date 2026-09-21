import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

interface Props extends React.ComponentProps<'button'> {
  /** 0~100 */
  value: number
  size?: number
  done?: boolean
}

/** 计划完成情况的圆环触发器: 点一下展开原有的计划面板 */
export function PlanRing({ value, size = 34, done = false, className, children, ...props }: Props) {
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, Math.round(value)))

  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            className={cn('transition-[stroke-dashoffset] duration-500', done ? 'stroke-emerald-500' : 'stroke-primary')}
          />
        </svg>
        <span className="absolute text-[9px] font-semibold tabular-nums text-foreground">
          {done ? <Check className="size-3.5 text-emerald-500" /> : pct}
        </span>
      </span>
      {children}
    </button>
  )
}
