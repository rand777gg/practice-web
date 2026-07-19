interface Props {
  currentIndex: number
  total: number
  kpCurrent: number
  kpTotal: number
  kpName: string | null
}

export function SequentialProgressBar({ currentIndex, total, kpCurrent, kpTotal, kpName }: Props) {
  const kpPct = kpTotal > 0 ? Math.round((kpCurrent / kpTotal) * 100) : 0
  const overallPct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0

  return (
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
  )
}
