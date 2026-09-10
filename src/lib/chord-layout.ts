/**
 * 弦图（Chord Diagram）几何计算。
 *
 * 手写而不是用图表库的弦图实现，原因有两个：
 * 1. 需要与站点主题变量联动、并且能自由控制 hover / 标签排布；
 * 2. 这里只用到极坐标与两段三次贝塞尔，纯函数便于单独校验。
 *
 * 坐标约定：svg 的 y 轴向下，因此「角度增大」在视觉上是顺时针。
 * startAngle 默认 -π/2（12 点方向）。
 */

export interface ChordNodeInput {
  id: string
  name: string
  /** 0 = 上半圈集合，1 = 下半圈集合；两侧集合分别占据连续弧段 */
  side: 0 | 1
  color?: string
}

export interface ChordLinkInput {
  source: string
  target: string
  value: number
}

export interface ChordArc {
  id: string
  name: string
  side: 0 | 1
  value: number
  /** 含两端留白之后的实际弧段，单位弧度 */
  startAngle: number
  endAngle: number
  midAngle: number
  /** 环形扇区路径 */
  path: string
  color: string
  /** 标签锚点 */
  labelX: number
  labelY: number
  labelAnchor: 'start' | 'middle' | 'end'
}

export interface ChordRibbon {
  key: string
  sourceId: string
  targetId: string
  value: number
  path: string
  color: string
}

export interface ChordLayoutResult {
  arcs: ChordArc[]
  ribbons: ChordRibbon[]
  cx: number
  cy: number
  radius: number
  innerRadius: number
  /** 弧段总占比，用于外部校验（应等于 2π） */
  totalAngle: number
}

export interface ChordLayoutOptions {
  cx: number
  cy: number
  radius: number
  innerRadius: number
  /** 相邻节点之间的角度留白（度） */
  padAngle?: number
  /** 起始角度（度），默认 -90 */
  startAngle?: number
  colors: string[]
  /** 标签与圆环之间的额外距离 */
  labelOffset?: number
}

const MIN_SPAN = 0.004

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function pointText(cx: number, cy: number, r: number, angle: number): string {
  const [x, y] = polar(cx, cy, r, angle)
  return `${round(x)} ${round(y)}`
}

/** 环形扇区：外弧顺时针，内弧逆时针闭合 */
function ringPath(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  if (endAngle - startAngle <= 0) return ''
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return [
    `M ${pointText(cx, cy, radius, startAngle)}`,
    `A ${round(radius)} ${round(radius)} 0 ${largeArc} 1 ${pointText(cx, cy, radius, endAngle)}`,
    `L ${pointText(cx, cy, innerRadius, endAngle)}`,
    `A ${round(innerRadius)} ${round(innerRadius)} 0 ${largeArc} 0 ${pointText(cx, cy, innerRadius, startAngle)}`,
    'Z',
  ].join(' ')
}

/**
 * 弦带：源弧 s0→s1 顺时针，再从 s1 弯到目标弧末端 t1，
 * 目标弧 t1→t0 逆时针返回，最后弯回 s0。两段贝塞尔的控制点都落在圆心，
 * 于是所有弦带向中心收拢，构成经典弦图观感。
 */
function ribbonPath(
  cx: number,
  cy: number,
  attachRadius: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
): string {
  const largeSource = sourceEnd - sourceStart > Math.PI ? 1 : 0
  const largeTarget = targetEnd - targetStart > Math.PI ? 1 : 0
  const c = `${round(cx)} ${round(cy)}`
  return [
    `M ${pointText(cx, cy, attachRadius, sourceStart)}`,
    `A ${round(attachRadius)} ${round(attachRadius)} 0 ${largeSource} 1 ${pointText(cx, cy, attachRadius, sourceEnd)}`,
    `C ${c} ${c} ${pointText(cx, cy, attachRadius, targetEnd)}`,
    `A ${round(attachRadius)} ${round(attachRadius)} 0 ${largeTarget} 0 ${pointText(cx, cy, attachRadius, targetStart)}`,
    `C ${c} ${c} ${pointText(cx, cy, attachRadius, sourceStart)}`,
    'Z',
  ].join(' ')
}

export function computeChordLayout(
  nodes: ChordNodeInput[],
  links: ChordLinkInput[],
  options: ChordLayoutOptions,
): ChordLayoutResult {
  const { cx, cy, radius, innerRadius, colors } = options
  const padAngle = ((options.padAngle ?? 2) * Math.PI) / 180
  const startAngle = ((options.startAngle ?? -90) * Math.PI) / 180
  const labelOffset = options.labelOffset ?? 14
  const attachRadius = (radius + innerRadius) / 2

  const totalWeight = links.reduce((sum, link) => sum + Math.max(link.value, 0), 0)
  const empty: ChordLayoutResult = {
    arcs: [], ribbons: [], cx, cy, radius, innerRadius, totalAngle: 0,
  }
  if (!nodes.length || totalWeight <= 0) return empty

  // 每条弦同时占用两端节点的角度，故 2π 对应 2 倍权重总和
  const anglePerUnit = (Math.PI * 2) / (totalWeight * 2)

  const totals = new Map<string, number>()
  for (const node of nodes) totals.set(node.id, 0)
  for (const link of links) {
    const value = Math.max(link.value, 0)
    totals.set(link.source, (totals.get(link.source) ?? 0) + value)
    totals.set(link.target, (totals.get(link.target) ?? 0) + value)
  }

  // 两侧集合各占连续弧段，因此先按 side 稳定排序
  const ordered = [...nodes].sort((a, b) => a.side - b.side)

  let cursor = startAngle
  const spans = new Map<string, { start: number; end: number }>()
  for (const node of ordered) {
    const raw = (totals.get(node.id) ?? 0) * anglePerUnit
    const span = Math.max(raw - padAngle, MIN_SPAN)
    spans.set(node.id, { start: cursor, end: cursor + span })
    cursor += span + padAngle
  }

  const nodeIndex = new Map(ordered.map((node, index) => [node.id, index]))
  const arcs: ChordArc[] = ordered.map((node, index) => {
    const span = spans.get(node.id)!
    const mid = (span.start + span.end) / 2
    // 归一化到 [-π, π) 判断文字朝向
    const normalized = Math.atan2(Math.sin(mid), Math.cos(mid))
    const cos = Math.cos(normalized)
    const labelAnchor: ChordArc['labelAnchor'] = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle'
    const [labelX, labelY] = polar(cx, cy, radius + labelOffset, mid)
    return {
      id: node.id,
      name: node.name,
      side: node.side,
      value: totals.get(node.id) ?? 0,
      startAngle: span.start,
      endAngle: span.end,
      midAngle: mid,
      path: ringPath(cx, cy, radius, innerRadius, span.start, span.end),
      color: node.color ?? colors[index % colors.length],
      labelX,
      labelY,
      labelAnchor,
    }
  })

  // 同一节点上的弦按处理顺序依次占用角度
  const offsets = new Map<string, number>()
  for (const node of ordered) offsets.set(node.id, spans.get(node.id)!.start)

  const ribbons: ChordRibbon[] = []
  for (const link of links) {
    const value = Math.max(link.value, 0)
    if (value <= 0) continue
    const slice = value * anglePerUnit
    const sourceStart = offsets.get(link.source) ?? 0
    const targetStart = offsets.get(link.target) ?? 0
    offsets.set(link.source, sourceStart + slice)
    offsets.set(link.target, targetStart + slice)

    const color = arcs[nodeIndex.get(link.source) ?? 0]?.color ?? colors[0]
    ribbons.push({
      key: `${link.source}-${link.target}`,
      sourceId: link.source,
      targetId: link.target,
      value,
      color,
      path: ribbonPath(
        cx, cy, attachRadius,
        sourceStart, sourceStart + slice,
        targetStart, targetStart + slice,
      ),
    })
  }

  const totalAngle = ordered.reduce((sum, node) => {
    const span = spans.get(node.id)!
    return sum + (span.end - span.start)
  }, 0)

  return { arcs, ribbons, cx, cy, radius, innerRadius, totalAngle }
}
