import { forwardRef } from 'react'
import {
  OneTimePasswordField,
  OneTimePasswordFieldInput,
} from '@radix-ui/react-one-time-password-field'
import { cn } from '@/lib/utils'

export interface InputOtpProps {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  className?: string
}

const slotCn = cn(
  'flex h-12 w-10 items-center justify-center',
  'rounded-md border border-input bg-background',
  'text-center text-lg font-medium',
  'shadow-xs transition-[color,box-shadow]',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden',
  'aria-invalid:border-destructive',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'data-[selection-start=true]:border-ring data-[selection-start=true]:ring-[3px] data-[selection-start=true]:ring-ring/50',
)

const OneTimePasswordFieldInputImpl = forwardRef<
  HTMLInputElement,
  { index: number; disabled?: boolean; __scopeOneTimePasswordField?: unknown }
>(({ index, disabled, ...props }, ref) => (
  <OneTimePasswordFieldInput
    ref={ref}
    index={index}
    disabled={disabled}
    className={slotCn}
    {...(props as any)}
  />
))
OneTimePasswordFieldInputImpl.displayName = 'OneTimePasswordFieldInput'

export function InputOtp({
  value,
  onChange,
  length = 6,
  disabled = false,
  className,
}: InputOtpProps) {
  return (
    <OneTimePasswordField
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      validationType="numeric"
      autoComplete="one-time-code"
      className={cn('flex items-center gap-2 justify-center', className)}
    >
      {Array.from({ length }, (_, i) => (
        <OneTimePasswordFieldInputImpl key={i} index={i} disabled={disabled} />
      ))}
    </OneTimePasswordField>
  )
}
