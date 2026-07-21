import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { getOsIcon, getBrowserIcon, getOsLabel, getBrowserLabel } from '@/lib/device-info'
import { Separator } from '@/components/ui/separator'

const OS_COLORS: Partial<Record<string, string>> = {
  windows: '#00A4EF',
  macos: '#000000',
  linux: '#FCC624',
  android: '#3DDC84',
  ios: '#000000',
  unknown: '#6B7280',
}

const BROWSER_COLORS: Partial<Record<string, string>> = {
  edge: '#0078D7',
  firefox: '#FF7139',
  safari: '#006CFF',
  unknown: '#6B7280',
}

function iconColor(icon: string, map: Partial<Record<string, string>>, key: string): string | undefined {
  if (icon.startsWith('devicon:') || icon.startsWith('logos:')) return undefined
  return map[key]
}

interface Props {
  deviceName?: string | null
  fallback?: string
  className?: string
  iconClassName?: string
  iconOnly?: boolean
}

export function DeviceLabel({ deviceName, fallback, className, iconClassName, iconOnly }: Props) {
  const name = deviceName || ''
  if (!name && !iconOnly) {
    return <span className={cn('text-muted-foreground', className)}>{fallback || 'Unknown'}</span>
  }
  if (iconOnly && !name) {
    const dft = getOsIcon('unknown')
    return <Icon icon={dft} className={cn('h-5 w-5 shrink-0', iconClassName)} />
  }

  const parts = name.split(' · ')
  const osPart = (parts[0] || '').toLowerCase()
  const browserPart = (parts[1] || '').toLowerCase()

  const osIcon = getOsIcon(osPart)
  const browserIcon = getBrowserIcon(browserPart)
  const osColor = iconColor(osIcon, OS_COLORS, osPart)
  const browserColor = iconColor(browserIcon, BROWSER_COLORS, browserPart)
  const osLabel = getOsLabel(osPart) || parts[0] || 'Unknown'
  const browserLabel = getBrowserLabel(browserPart) || parts[1] || 'Unknown'

  if (iconOnly) {
    return (
      <span className={cn('inline-flex items-center gap-0.5', className)}>
        <Icon icon={osIcon} className={cn('h-5 w-5 shrink-0', iconClassName)} style={osColor ? { color: osColor } : undefined} />
        <Icon icon={browserIcon} className={cn('h-4 w-4 shrink-0', iconClassName)} style={browserColor ? { color: browserColor } : undefined} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex items-center gap-1">
        <Icon icon={osIcon} className={cn('h-4 w-4 shrink-0', iconClassName)} style={osColor ? { color: osColor } : undefined} />
        <span className="text-inherit">{osLabel}</span>
      </span>
      <Separator orientation="vertical" className="h-4" />
      <span className="inline-flex items-center gap-1">
        <Icon icon={browserIcon} className={cn('h-3.5 w-3.5 shrink-0', iconClassName)} style={browserColor ? { color: browserColor } : undefined} />
        <span className="text-inherit">{browserLabel}</span>
      </span>
    </span>
  )
}
