import { useRef, useState } from 'react'
import { Icon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { GroupDist } from '@/components/practice/SequentialKpNav'

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
  seekable?: boolean
  onSeekKp?: (relativeIndex: number) => void
  distMode?: boolean
  dist?: GroupDist | null
  done?: number
  doneTotal?: number
}

export function SequentialProgressBar({ currentIndex, total, kpCurrent, kpTotal, kpName, deviceIcon, deviceName, syncText, syncStatus, seekable, onSeekKp, distMode, dist, done, doneTotal }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragRatio, setDragRatio] = useState<number | null>(null)

  const kpPct = kpTotal > 0 ? Math.round((kpCurrent / kpTotal) * 100) : 0
  const kpDone = dist ? dist.correct + dist.wrong : 0
  const doneCount = done ?? currentIndex + 1
  const doneTotalCount = doneTotal ?? total
  const overallPct = doneTotalCount > 0 ? Math.round((doneCount / doneTotalCount) * 100) : 0

  const ratioFromClientX = (clientX: number) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const seekFromRatio = (ratio: number) => {
    if (!onSeekKp || kpTotal <= 1) return
    onSeekKp(Math.round(ratio * (kpTotal - 1)))
  }

  const showDistBar = distMode && dist && dist.total > 0
  const dragRel = dragRatio != null ? Math.round(dragRatio * (kpTotal - 1)) : null

  return (
    <div className="space-y-2">
      {kpName && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground truncate">{kpName}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{kpDone}/{kpTotal}</span>
          </div>
          <div className="relative">
              <div
                ref={barRef}
                role={seekable ? 'slider' : undefined}
                aria-valuemin={1}
                aria-valuemax={kpTotal}
                aria-valuenow={kpCurrent}
                aria-label={kpName}
                title={seekable ? '拖动切换题目' : undefined}
                className={cn(
                  'relative h-2 rounded-full bg-muted overflow-hidden',
                  seekable && 'cursor-grab active:cursor-grabbing touch-none select-none',
                )}
                onPointerDown={seekable ? (e) => {
                  e.preventDefault()
                  draggingRef.current = true
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setDragRatio(ratioFromClientX(e.clientX))
                } : undefined}
                onPointerMove={seekable ? (e) => {
                  if (draggingRef.current) setDragRatio(ratioFromClientX(e.clientX))
                } : undefined}
                onPointerUp={seekable ? (e) => {
                  if (!draggingRef.current) return
                  draggingRef.current = false
                  const r = ratioFromClientX(e.clientX)
                  setDragRatio(null)
                  seekFromRatio(r)
                } : undefined}
                onPointerCancel={seekable ? () => { draggingRef.current = false; setDragRatio(null) } : undefined}
              >
                {showDistBar ? (
                  <div className="absolute inset-0">
                    {(() => {
                      const statuses = dist!.statuses
                      const n = statuses.length
                      return statuses.map((st, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            'absolute',
                            st === 'correct' && 'bg-green-500',
                            st === 'wrong' && 'bg-red-500',
                            st === 'tooEasy' && 'bg-muted-foreground/40',
                            idx === 0 && 'rounded-l-full',
                            idx === n - 1 && 'rounded-r-full',
                          )}
                          style={{ top: st === 'wrong' ? 0.5 : 0, bottom: 0, left: `${(idx * 100) / n}%`, width: `${100 / n}%` }}
                        />
                      ))
                    })()}
                  </div>
                ) : (
                  (() => {
                    const statuses = dist?.statuses
                    const n = statuses ? Math.min(kpTotal, statuses.length) : 0
                    if (!statuses || n <= 0) {
                      return (
                        <div className="h-full rounded-full transition-all duration-300 bg-blue-500" style={{ width: `${kpPct}%` }} />
                      )
                    }
                    return (
                      <div className="absolute inset-0">
                        {Array.from({ length: n }, (_, idx) => {
                          const st = statuses[idx]
                          const done = st === 'correct' || st === 'wrong'
                          return (
                            <div
                              key={idx}
                              className={cn('absolute inset-y-0 transition-colors duration-300', done ? 'bg-blue-500' : '', idx === 0 && 'rounded-l-full', idx === n - 1 && 'rounded-r-full')}
                              style={{ left: `${(idx * 100) / n}%`, width: `${100 / n}%` }}
                            />
                          )
                        })}
                      </div>
                    )
                  })()
                )}
                {(() => {
                  const units = showDistBar ? dist!.statuses.length : kpTotal
                  if (units <= 0) return null
                  const slot = dragRel != null ? dragRel : kpCurrent - 1
                  const atLeft = slot === 0
                  const atRight = slot === units - 1
                  const slotW = 100 / units
                  return (
                    <div
                      className={cn('absolute inset-y-0 pointer-events-none', dragRatio == null && 'transition-[left] duration-200 ease-out')}
                      style={{ left: dragRatio != null ? `calc(${dragRatio * 100}% - ${slotW / 2}%)` : `${(slot * 100) / units}%`, width: `${slotW}%` }}
                    >
                      <div
                        className={cn(
                          'h-full w-full transition-[transform,border-radius] duration-200 ease-out',
                          atLeft && 'rounded-l-full',
                          atRight && 'rounded-r-full',
                        )}
                        style={{
                          transform: dragRatio != null ? 'scale(1.1)' : 'scale(1)',
                          backgroundImage: 'linear-gradient(hsl(var(--foreground)) 0 1px, transparent 1px 2px), linear-gradient(90deg, hsl(var(--foreground)) 0 1px, transparent 1px 2px)',
                          backgroundSize: '2px 2px',
                        }}
                      />
                    </div>
                  )
                })()}
              </div>
              {seekable && dragRatio != null && dragRel != null && (
                <div
                  className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10px] leading-none text-background shadow"
                  style={{ left: `${dragRatio * 100}%` }}
                >
                  第 {dragRel + 1} 题
                </div>
              )}
          </div>
        </div>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">总进度</span>
          <span className="text-muted-foreground tabular-nums shrink-0">{doneCount}/{doneTotalCount}</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${overallPct}%` }} />
        </div>
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
