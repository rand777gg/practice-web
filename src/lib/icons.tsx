import { Icon as IconifyIcon } from '@iconify/react/offline'
import { cn } from '@/lib/utils'
import { iconData } from './icons-data'

interface IconProps {
  icon: string
  className?: string
  style?: React.CSSProperties
}

export function Icon({ icon, className, style }: IconProps) {
  const data = iconData[icon]
  if (!data) {
    // Fallback: render a placeholder so layout doesn't break
    return <span className={cn('inline-block bg-muted rounded', className)} style={{ width: '1em', height: '1em', ...style }} />
  }
  return <IconifyIcon icon={data} className={className} style={style} />
}
