import { Icon } from '@/lib/icons'

interface Props {
  currentIndex: number
  total: number
  kpCurrent: number
  kpTotal: number
  kpName: string | null
  deviceIcon?: string
  deviceName?: string
  syncText?: string | null
  syncStatus?: 'idle' | 'syncing' | 'synced'
}

export function SequentialProgressBar({ currentIndex, total, kpCurrent, kpTotal, kpName, deviceIcon, deviceName, syncText, syncStatus }: Props) {
  const kpPct = kpTotal > 0 ? Math.round((kpCurrent / kpTotal) * 100) : 0
  const overallPct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="grid gap-y-1.5 text-xs" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        {kpName && (
          <>
            <span className="text-muted-foreground whitespace-nowrap pr-2">{kpName}</span>
            <div className="h-2 rounded-full bg-muted overflow-hidden self-center">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${kpPct}%` }} />
            </div>
            <span className="text-muted-foreground tabular-nums whitespace-nowrap pl-2">{kpCurrent}/{kpTotal}</span>
          </>
        )}
        <span className="text-muted-foreground whitespace-nowrap pr-2">总进度</span>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden self-center">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${overallPct}%` }} />
        </div>
        <span className="text-muted-foreground tabular-nums whitespace-nowrap pl-2">{currentIndex + 1}/{total}</span>
      </div>
      {deviceIcon && (
        <div className="flex items-center justify-end gap-1">
          <Icon icon={deviceIcon} className="h-3 w-3 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">{deviceName}</span>
          {syncStatus === 'syncing' ? (
            <Icon icon="mingcute:loading-line" className="h-3 w-3 text-blue-500 animate-spin ml-1" />
          ) : syncStatus === 'synced' ? (
            <Icon icon="mingcute:check-circle-fill" className="h-3 w-3 text-green-500 ml-1" />
          ) : syncText ? (
            <span className="text-[9px] text-muted-foreground tabular-nums ml-1">{syncText}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
