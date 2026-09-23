import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SeparatorProps extends HTMLAttributes<HTMLSpanElement> {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

const Separator = forwardRef<HTMLSpanElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'block h-[1px] w-full' : 'inline-block h-full w-[1px]',
        className,
      )}
      {...props}
    />
  ),
)
Separator.displayName = 'Separator'

export { Separator }
