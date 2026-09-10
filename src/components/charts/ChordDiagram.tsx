import { useState } from 'react'
import { CATEGORY_COLORS, useChartPalette } from '@/lib/chart-theme'
import { computeChordLayout, type ChordLinkInput, type ChordNodeInput } from '@/lib/chord-layout'
import { cn } from '@/lib/utils'

interface ChordDiagramProps {
  nodes: ChordNodeInput[]
  links: ChordLinkInput[]
  /** 两侧集合的说明，形如 ['专业课', '知识点类别'] */
  sideLabels?: [string, string]
  /** 中心默认文案的标题 */
  centerLabel?: string
  width?: number
  height?: number
}

/**
 * 弦图：左半圈为一个集合、右半圈为另一个集合，弦带宽度表示共现强度。
 * 悬停任一节点会高亮它相关的全部弦带，并在圆心显示该节点的总量。
 */
export function ChordDiagram({
  nodes,
  links,
  sideLabels,
  centerLabel = '合计',
  width = 640,
  height = 460,
}: ChordDiagramProps) {
  const pal = useChartPalette()
  const [activeId, setActiveId] = useState<string | null>(null)

  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) / 2 - 58
  const innerRadius = radius - 13

  const layout = computeChordLayout(nodes, links, {
    cx,
    cy,
    radius,
    innerRadius,
    padAngle: 2,
    startAngle: -90,
    labelOffset: 12,
    colors: CATEGORY_COLORS,
  })

  const total = links.reduce((sum, link) => sum + link.value, 0)
  const activeArc = layout.arcs.find((arc) => arc.id === activeId) ?? null
  const activeShare = activeArc && total > 0 ? Math.round((activeArc.value / (total * 2)) * 100) : 0

  function isDimmed(nodeId: string): boolean {
    if (!activeId) return false
    if (nodeId === activeId) return false
    return !links.some(
      (link) =>
        (link.source === activeId && link.target === nodeId) ||
        (link.target === activeId && link.source === nodeId),
    )
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`${centerLabel}弦图`}
      >
        {/* 弦带先画，圆环压在弦带之上，接口处更干净 */}
        <g>
          {layout.ribbons.map((ribbon) => {
            const linked = activeId === ribbon.sourceId || activeId === ribbon.targetId
            return (
              <path
                key={ribbon.key}
                d={ribbon.path}
                fill={ribbon.color}
                fillOpacity={activeId ? (linked ? 0.62 : 0.05) : 0.34}
                stroke={ribbon.color}
                strokeOpacity={activeId ? (linked ? 0.75 : 0.05) : 0.28}
                strokeWidth={0.75}
                className="transition-[fill-opacity,stroke-opacity] duration-200"
              />
            )
          })}
        </g>

        <g>
          {layout.arcs.map((arc) => (
            <path
              key={arc.id}
              d={arc.path}
              fill={arc.color}
              fillOpacity={isDimmed(arc.id) ? 0.35 : 1}
              className="cursor-pointer transition-opacity duration-200"
              onMouseEnter={() => setActiveId(arc.id)}
              onMouseLeave={() => setActiveId(null)}
            />
          ))}
        </g>

        <g>
          {layout.arcs.map((arc) => (
            <text
              key={`label-${arc.id}`}
              x={arc.labelX}
              y={arc.labelY}
              textAnchor={arc.labelAnchor}
              dominantBaseline="middle"
              className={cn(
                'pointer-events-none text-[11px] transition-opacity duration-200',
                isDimmed(arc.id) ? 'opacity-40' : 'opacity-100',
              )}
              fill={activeId === arc.id ? arc.color : pal.label}
              fontWeight={activeId === arc.id ? 600 : 400}
            >
              {arc.name}
            </text>
          ))}
        </g>

        <g className="pointer-events-none">
          {activeArc ? (
            <>
              <text x={cx} y={cy - 16} textAnchor="middle" className="text-[13px] font-semibold" fill={activeArc.color}>
                {activeArc.name}
              </text>
              <text x={cx} y={cy + 4} textAnchor="middle" className="text-[20px] font-semibold tabular-nums" fill={pal.ink}>
                {activeArc.value.toLocaleString()}
              </text>
              <text x={cx} y={cy + 22} textAnchor="middle" className="text-[10px]" fill={pal.label}>
                占全部选择的 {activeShare}%
              </text>
            </>
          ) : (
            <>
              <text x={cx} y={cy - 12} textAnchor="middle" className="text-[11px]" fill={pal.label}>
                {centerLabel}
              </text>
              <text x={cx} y={cy + 10} textAnchor="middle" className="text-[20px] font-semibold tabular-nums" fill={pal.ink}>
                {total.toLocaleString()}
              </text>
              <text x={cx} y={cy + 27} textAnchor="middle" className="text-[10px]" fill={pal.label}>
                悬停任意节点查看明细
              </text>
            </>
          )}
        </g>
      </svg>

      {sideLabels && (
        <div className="flex items-center justify-between px-2 text-[11px] text-muted-foreground">
          <span>{sideLabels[0]}</span>
          <span>{sideLabels[1]}</span>
        </div>
      )}
    </div>
  )
}
