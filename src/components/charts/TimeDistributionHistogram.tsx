import { useState, useCallback } from 'react'
import { useThemeStore } from '@/stores/theme-store'

interface Props {
  data: number[][] // 7 rows (Mon=0..Sun=6) x 24 cols (hours)
}

const ringOrder = [6, 0, 1, 2, 3, 4, 5] // outermost→innermost: 周日,周一,周二,周三,周四,周五,周六
const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function wedgePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
) {
  const os = polarToCartesian(cx, cy, outerR, startAngle)
  const oe = polarToCartesian(cx, cy, outerR, endAngle)
  const is = polarToCartesian(cx, cy, innerR, startAngle)
  const ie = polarToCartesian(cx, cy, innerR, endAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return [
    `M ${os.x} ${os.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${ie.x} ${ie.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${is.x} ${is.y}`,
    'Z',
  ].join(' ')
}

const VIEWBOX_W = 440
const VIEWBOX_H = 400
const CX = 198
const CY = 200
const OUTER_R = 178
const INNER_HUB = 27
const RING_W = (OUTER_R - INNER_HUB) / 7
const ringRadii = Array.from({ length: 7 }, (_, i) => OUTER_R - i * RING_W)

export function TimeDistributionHistogram({ data }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const max = Math.max(...data.flat(), 1)

  const [tooltip, setTooltip] = useState<{
    dayLabel: string
    hour: number
    value: number
    x: number
    y: number
  } | null>(null)

  const handlePointerEnter = useCallback(
    (dayLabel: string, hour: number, value: number, e: React.PointerEvent) => {
      const svg = (e.target as SVGElement).closest('svg')
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      setTooltip({ dayLabel, hour, value, x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    [],
  )

  const handlePointerLeave = useCallback(() => setTooltip(null), [])

  function getColor(value: number): string {
    if (value === 0) return isDark ? '#1e293b' : '#f1f5f9'
    const t = value / max
    if (isDark) {
      const r = Math.round(20 + t * 20)
      const g = Math.round(50 + t * 180)
      const b = Math.round(30 + t * 70)
      return `rgb(${r},${g},${b})`
    }
    const r = Math.round(220 - t * 180)
    const g = Math.round(245 - t * 65)
    const b = Math.round(230 - t * 170)
    return `rgb(${r},${g},${b})`
  }

  const mutedStroke = isDark ? '#334155' : '#e2e8f0'

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} style={{ width: '100%', height: 320 }}>
        {/* Radial hour separator lines */}
        {Array.from({ length: 24 }, (_, h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2
          const p = polarToCartesian(CX, CY, OUTER_R, angle)
          return (
            <line
              key={`radial-${h}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke={isDark ? '#1e293b' : '#e2e8f0'}
              strokeWidth={0.5}
              strokeDasharray={h % 6 === 0 ? '3 2' : '2 3'}
            />
          )
        })}

        {/* Concentric ring separators */}
        {ringRadii.map((r, i) => (
          <circle
            key={`ring-sep-${i}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={mutedStroke}
            strokeWidth={0.5}
            strokeDasharray="3 3"
          />
        ))}
        <circle cx={CX} cy={CY} r={INNER_HUB} fill="none" stroke={mutedStroke} strokeWidth={0.8} strokeDasharray="3 3" />

        {/* Wedges — outermost ring first (painted behind) */}
        {ringOrder.map((dataIdx, ringIdx) => {
          const outerR = ringRadii[ringIdx]
          const innerR = outerR - RING_W
          const elements: React.ReactNode[] = []

          for (let h = 0; h < 24; h++) {
            const startAngle = (h / 24) * Math.PI * 2 - Math.PI / 2
            const endAngle = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2
            const val = data[dataIdx][h]
            elements.push(
              <path
                key={`w-${h}`}
                d={wedgePath(CX, CY, innerR, outerR, startAngle, endAngle)}
                fill={getColor(val)}
                stroke={isDark ? '#0f172a' : '#fff'}
                strokeWidth={0.5}
                style={{ cursor: 'pointer', transition: 'opacity 0.12s' }}
                onPointerEnter={(e) => handlePointerEnter(dayLabels[ringIdx], h, val, e)}
                onPointerLeave={handlePointerLeave}
              />,
            )
          }

          return <g key={dataIdx}>{elements}</g>
        })}

        {/* Center hub */}
        <circle cx={CX} cy={CY} r={INNER_HUB} fill="transparent" stroke={mutedStroke} strokeWidth={0.8} />
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isDark ? '#64748b' : '#94a3b8'}
          fontSize={9}
        >
          时刻
        </text>

        {/* Hour labels */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2
          const labelR = OUTER_R + 16
          const p = polarToCartesian(CX, CY, labelR, angle)
          return (
            <text
              key={`hl-${h}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isDark ? '#94a3b8' : '#64748b'}
              fontSize={10}
              fontWeight={600}
            >
              {h}h
            </text>
          )
        })}

      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-lg"
          key={`${tooltip.dayLabel}-${tooltip.hour}`}
          style={{
            left: tooltip.x,
            top: tooltip.y - 36,
            transform: 'translate(-50%, -100%)',
            animation: 'tip-in 0.18s ease-out',
            transition: 'left 0.1s ease-out, top 0.1s ease-out',
          }}
        >
          <span className="font-semibold">
            {tooltip.dayLabel} {String(tooltip.hour).padStart(2, '0')}:00 -{' '}
            {String(tooltip.hour + 1).padStart(2, '0')}:00
          </span>
          <br />
          答题: <b>{tooltip.value}</b> 次
        </div>
      )}
      <style>{`
        @keyframes tip-in {
          from { opacity: 0; transform: translate(-50%, calc(-100% + 6px)); }
          to   { opacity: 1; transform: translate(-50%, -100%); }
        }
      `}</style>
    </div>
  )
}
