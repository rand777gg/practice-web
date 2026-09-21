/**
 * Markdown → 可朗读文本。
 *
 * 屏幕上能看的东西一半读不出来：公式读成 LaTeX 是噪音，代码块、表格、图片
 * 读出来只是干扰。这里把不能读的整段丢掉，把只影响排版的标记（加粗、列表符、
 * 标题号）拆掉，剩下的才是给人听的。
 */
export function markdownToSpeech(md: string | null | undefined): string {
  if (!md) return ''
  let s = md
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/~~~[\s\S]*?~~~/g, ' ')
  s = s.replace(/`([^`]*)`/g, '$1')
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ')
  s = s.replace(/\\\[[\s\S]*?\\\]/g, ' ')
  s = s.replace(/\\\([\s\S]*?\\\)/g, ' ')
  s = s.replace(/\$[^$\n]*\$/g, ' ')
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  s = s.replace(/^\s{0,3}>\s?/gm, '')
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, '')
  s = s.replace(/^\s{0,3}\d+[.)]\s+/gm, '')
  s = s.replace(/^\s*\|.*\|\s*$/gm, ' ')
  s = s.replace(/^\s*[-:|\s]{3,}$/gm, ' ')
  // 填空下划线要赶在强调标记之前处理：`目标是___，抢占发生在__时` 里的两组
  // 下划线会被当成一对加粗标记，把中间的内容一起吃掉
  s = s.replace(/_{2,}/g, '填空')
  s = s.replace(/[*~]{1,3}([^*~]+)[*~]{1,3}/g, '$1')
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}

const MAX_CHUNK = 160
const MIN_CHUNK = 4

/**
 * 切成小段再合成：一是长文本首字节要等很久，切开能边下边播；
 * 二是先问后答要在题干和答案之间停一次，那正是段与段之间的边界。
 */
export function splitForSpeech(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const chunks: string[] = []
  let cur = ''
  for (const sentence of clean.split(/(?<=[。！？!?；;…])/)) {
    for (const piece of hardSplit(sentence, max)) {
      if (!piece) continue
      if (!cur) cur = piece
      else if (cur.length + piece.length <= max) cur += piece
      else { chunks.push(cur); cur = piece }
    }
  }
  if (cur) chunks.push(cur)

  // 太短的段（"答。" 这类）单独送一次请求不划算，并进上一段
  const merged: string[] = []
  for (const c of chunks) {
    const prev = merged[merged.length - 1]
    if (prev && (c.length < MIN_CHUNK || prev.length < MIN_CHUNK)) merged[merged.length - 1] = prev + c
    else merged.push(c)
  }
  return merged
}

function hardSplit(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence]
  const out: string[] = []
  let rest = sentence
  while (rest.length > max) {
    const window = rest.slice(0, max)
    // 优先在逗号处断，实在没有才硬切
    const cut = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf('、'), window.lastIndexOf(' '))
    const at = cut > max * 0.5 ? cut + 1 : max
    out.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  if (rest) out.push(rest)
  return out
}

/** 题干 + 选项 + 答案/解析 拼朗读稿，空段直接丢掉 */
export function speechSegments(parts: (string | null | undefined)[][]): string[] {
  const out: string[] = []
  for (const group of parts) {
    for (const raw of group) {
      out.push(...splitForSpeech(markdownToSpeech(raw)))
    }
  }
  return out
}
