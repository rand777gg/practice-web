import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

interface Props {
  deviceName: string
  fallback?: string
  className?: string
  iconClassName?: string
}

export function DeviceLabel({ deviceName, fallback, className, iconClassName }: Props) {
  // deviceName format: "Windows 11 · Chrome 143" or "macOS 14 · Safari 17" etc.
  const parts = deviceName ? deviceName.split(' · ') : []
  const osPart = parts[0] || ''
  const browserPart = parts[1] || ''

  // Icon detection from the display name
  function getOsIcon(name: string): string {
    const l = name.toLowerCase()
    if (l.includes('windows')) return 'mdi:microsoft-windows'
    if (l.includes('macos') || l.includes('mac os')) return 'mdi:apple'
    if (l.includes('linux')) return 'mdi:linux'
    if (l.includes('android')) return 'mdi:android'
    if (l.includes('ios')) return 'mdi:apple-ios'
    return 'mdi:monitor'
  }

  function getBrowserIcon(name: string): string {
    const l = name.toLowerCase()
    if (l.includes('edge')) return 'mdi:microsoft-edge'
    if (l.includes('chrome')) return 'mdi:google-chrome'
    if (l.includes('firefox')) return 'mdi:firefox'
    if (l.includes('safari')) return 'mdi:safari'
    return 'mdi:web'
  }

  const display = deviceName || fallback || 'Unknown'

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon icon={getOsIcon(osPart)} className={cn('h-4 w-4 shrink-0', iconClassName)} />
      <Icon icon={getBrowserIcon(browserPart)} className={cn('h-3.5 w-3.5 shrink-0', iconClassName)} />
      <span className="truncate">{display}</span>
    </span>
  )
}
