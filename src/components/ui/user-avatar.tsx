import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveAvatar, type AvatarOwner } from '@/lib/avatar'
import { cn } from '@/lib/utils'

const SIZE_CLASS = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-20 text-xl',
} as const

export type UserAvatarSize = keyof typeof SIZE_CLASS

export function UserAvatar({
  owner,
  size = 'md',
  className,
  fallbackClassName,
}: {
  owner: AvatarOwner
  size?: UserAvatarSize
  className?: string
  fallbackClassName?: string
}) {
  const { src, initials } = resolveAvatar(owner)
  return (
    <Avatar className={cn(SIZE_CLASS[size], className)}>
      <AvatarImage src={src} alt={owner.name ?? ''} />
      <AvatarFallback className={cn('font-medium', fallbackClassName)}>{initials}</AvatarFallback>
    </Avatar>
  )
}
