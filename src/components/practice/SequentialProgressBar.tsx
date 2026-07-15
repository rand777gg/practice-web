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
    <div className="space-y-1.5 w-full">
      {kpName && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground w-16 shrink-0 truncate">{kpName}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${kpPct}%` }} />
          </div>
          <span className="text-muted-foreground w-12 text-right shrink-0">{kpCurrent}/{kpTotal}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground w-16 shrink-0">总进度</span>
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${overallPct}%` }} />
        </div>
        <span className="text-muted-foreground w-12 text-right shrink-0">{currentIndex + 1}/{total}</span>
      </div>
    </div>
  )
}
