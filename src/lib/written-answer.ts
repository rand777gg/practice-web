/**
 * 主观题作答模型：文字 + 手写笔迹。
 *
 * 为什么两样都要留：
 *   - 没有手写笔的人打字，只要 text；
 *   - 有手写笔的人在真卡上写，笔迹必须留下——那是一笔一划的作答，不能压成位图就了事
 *     （要能回放、能缩放、能撤销、能给 OCR 用）。
 *
 * 笔迹点一律存**相对书写区的比例（0–1）**，不存像素：这样换设备、改缩放、
 * 打印到 A3 都不会变形。
 */

export interface InkPoint {
  /** 相对书写区宽度的比例 0–1 */
  x: number
  /** 相对书写区高度的比例 0–1 */
  y: number
  /** 压感 0–1；鼠标 / 手指没有压感，统一给 0.5 */
  p: number
}

export interface InkStroke {
  points: InkPoint[]
  /** 基准笔宽，也是相对书写区高度的比例 */
  baseWidth: number
}

export interface WrittenAnswer {
  /** 打字内容 */
  text: string
  /** 手写笔迹（可为空） */
  ink: InkStroke[]
}

export const EMPTY_WRITTEN: WrittenAnswer = { text: '', ink: [] }

export function isWrittenEmpty(a: WrittenAnswer | null | undefined): boolean {
  if (!a) return true
  return a.text.trim().length === 0 && a.ink.length === 0
}

/** 有手写就说明是手写作答，判题前需要先 OCR */
export function hasInk(a: WrittenAnswer | null | undefined): boolean {
  return !!a && a.ink.length > 0
}

/**
 * 估字数：中文按字符数，英文按词数，取两者较大值。
 * 用来做「英语一 大作文 160–200 词」这类字数提示，不追求精确。
 */
export function estimateWordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) ?? []).length
  const words = (trimmed.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9'’-]+/g) ?? []).length
  return cjk + words
}

/** 笔迹点数，用来判断「写没写」以及导出的分量 */
export function inkPointCount(a: WrittenAnswer | null | undefined): number {
  return a ? a.ink.reduce((sum, s) => sum + s.points.length, 0) : 0
}

/** 单条笔迹转 SVG path（导出 / 预览用，避免依赖 canvas） */
export function strokeToPath(stroke: InkStroke, width: number, height: number): string {
  if (stroke.points.length === 0) return ''
  const pt = (p: InkPoint) => `${(p.x * width).toFixed(2)} ${(p.y * height).toFixed(2)}`
  if (stroke.points.length === 1) {
    const [p] = stroke.points
    // 单点也要看得见：画一个极短线段
    return `M ${pt(p)} L ${(p.x * width + 0.1).toFixed(2)} ${(p.y * height).toFixed(2)}`
  }
  let d = `M ${pt(stroke.points[0])}`
  // 取中点做二次平滑，手写线才不会一段一段发硬
  for (let i = 1; i < stroke.points.length - 1; i++) {
    const a = stroke.points[i]
    const b = stroke.points[i + 1]
    const mx = ((a.x + b.x) / 2) * width
    const my = ((a.y + b.y) / 2) * height
    d += ` Q ${pt(a)} ${mx.toFixed(2)} ${my.toFixed(2)}`
  }
  d += ` L ${pt(stroke.points[stroke.points.length - 1])}`
  return d
}

/**
 * 把手写笔迹画成 PNG dataURL。
 * 给 OCR 和存档用；打印走 SVG（矢量），不走这条。
 */
export function inkToPng(a: WrittenAnswer, width: number, height: number, inkColor = '#111827'): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = inkColor
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of a.ink) {
    const pts = stroke.points
    if (pts.length === 0) continue
    const base = Math.max(1, stroke.baseWidth * height)
    if (pts.length === 1) {
      const p = pts[0]
      ctx.beginPath()
      ctx.arc(p.x * width, p.y * height, base / 2, 0, Math.PI * 2)
      ctx.fillStyle = inkColor
      ctx.fill()
      continue
    }
    // 与画布预览同一套规则：逐段按压感给笔宽
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      ctx.lineWidth = base * (0.55 + ((p0.p + p1.p) / 2) * 0.9)
      ctx.beginPath()
      ctx.moveTo(p0.x * width, p0.y * height)
      ctx.lineTo(p1.x * width, p1.y * height)
      ctx.stroke()
    }
  }
  return canvas.toDataURL('image/png')
}
