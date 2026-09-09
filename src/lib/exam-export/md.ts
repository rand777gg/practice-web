/**
 * 轻量 Markdown → 块模型(md.ts)
 * 只服务「导出试卷」:把题干/解析这类由题库编辑产出的轻量 markdown
 * 解析成结构化块, 供 HTML / DOCX 两种导出端复用同一份语义, 保证排版一致。
 *
 * 支持的子集:段落、标题(#~######)、有序/无序列表、围栏代码块、引用、分隔线;
 * 行内:加粗/斜体/删除线/行内代码/链接/图片(图片在 DOCX 端退化为 alt 文本)。
 * LaTeX 数学($…$ / $$…$$ / \(…\) / \[…\])原样保留在文本里:
 *   HTML 端交给 MathJax 排版; DOCX 端按字面文本落(并置成等宽), 保证不错乱。
 */

export interface Span {
  t: string
  b?: boolean
  i?: boolean
  s?: boolean // 删除线
  c?: boolean // 行内代码
  a?: string // 链接 href(超文本时)
  img?: string // 图片 src(图片占位, DOCX 端显示 alt)
}

export type Block =
  | { k: 'p'; spans: Span[] }
  | { k: 'h'; level: number; spans: Span[] }
  | { k: 'ul'; items: Span[][] }
  | { k: 'ol'; items: Span[][] }
  | { k: 'code'; lang: string; lines: string[] }
  | { k: 'quote'; spans: Span[] }
  | { k: 'hr' }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** 转义普通文本中的 HTML 元字符(行内代码/普通文本用) */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c] ?? c)
}

/** 行内解析: 把一段文本切成 spans (支持嵌套一层 加粗+斜体) */
function inline(text: string): Span[] {
  const out: Span[] = []
  let i = 0
  const n = text.length
  const push = (t: string, base: Partial<Span> = {}) => {
    if (!t) return
    const last = out[out.length - 1]
    if (last && !base.b && !base.i && !base.s && !base.c && !last.b && !last.i && !last.s && !last.c && !base.a && !last.a && !base.img && !last.img) {
      last.t += t
    } else {
      out.push({ t, ...base })
    }
  }
  while (i < n) {
    // 图片 ![alt](src)
    const img = text.slice(i).match(/^!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (img) {
      push(img[1] || '', { img: img[2] })
      i += img[0].length
      continue
    }
    // 链接 [text](href)
    const link = text.slice(i).match(/^\[([^\]]*)\]\(([^)\s]+)\)/)
    if (link) {
      push(link[1], { a: link[2] })
      i += link[0].length
      continue
    }
    // 行内代码 `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > -1) {
        push(escapeHtml(text.slice(i + 1, end)), { c: true })
        i = end + 1
        continue
      }
    }
    // 图片/链接/代码都处理完后, 再处理强调(避免吞掉 * 在链接语法里)
    // 填空下划线 ____ 连排 >=3 时视为留空文本, 不做强调解析
    if (text[i] === '_') {
      let r = i
      while (r < n && text[r] === '_') r++
      if (r - i >= 3) {
        push(escapeHtml(text.slice(i, r)))
        i = r
        continue
      }
    }
    const star = text[i] === '*' || text[i] === '_'
    if (star && i + 1 < n) {
      const ch = text[i]
      const double = text[i + 1] === ch
      const mark = double ? text.slice(i, i + 2) : text[i]
      const close = double ? text.indexOf(ch + ch, i + 2) : text.indexOf(ch, i + 1)
      if (close > i) {
        const inner = text.slice(i + mark.length, close)
        const emph: Partial<Span> = double ? { b: true } : { i: true }
        // 支持 **__粗斜__** 之类嵌套(粗略: 内层再切一次)
        push(inner, emph)
        i = close + mark.length
        continue
      }
    }
    // 删除线 ~~x~~
    if (text[i] === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2)
      if (close > i) {
        push(escapeHtml(text.slice(i + 2, close)), { s: true })
        i = close + 2
        continue
      }
    }
    // 普通字符聚合成段
    let j = i
    while (j < n) {
      const c = text[j]
      if (c === '`' || c === '*' || c === '_' || (c === '~' && text[j + 1] === '~') || (c === '!' && text[j + 1] === '[') || c === '[') break
      j++
    }
    if (j === i) j = i + 1
    push(escapeHtml(text.slice(i, j)))
    i = j
  }
  return out
}

/** 解析 markdown 为块模型 */
export function mdToBlocks(md: string): Block[] {
  const raw = String(md ?? '').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')
  const blocks: Block[] = []
  let i = 0

  // 读一段纯文本行(不含空白行)直到空行/其它块起点, 返回文本行数组
  const isParaText = (s: string) =>
    s.trim().length > 0 &&
    !/^\s*(#+\s|[-*+]\s|\d+[.)]\s|```|>|```$)/.test(s) &&
    s.trim() !== '---' &&
    s.trim() !== '***'

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }
    // 围栏代码块
    if (/^```/.test(trimmed)) {
      const lang = trimmed.replace(/^```/, '').trim()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i])
        i++
      }
      i++ // 跳过结束围栏
      blocks.push({ k: 'code', lang, lines: code })
      continue
    }
    // 标题
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      blocks.push({ k: 'h', level: h[1].length, spans: inline(h[2]) })
      i++
      continue
    }
    // 引用(合并连续 > 行)
    if (/^>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ k: 'quote', spans: inline(quote.join(' ')) })
      continue
    }
    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ k: 'hr' })
      i++
      continue
    }
    // 有序列表
    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: Span[][] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
        if (!m) break
        items.push(inline(m[1]))
        i++
      }
      blocks.push({ k: 'ol', items })
      continue
    }
    // 无序列表
    if (/^\s*[-*+]\s/.test(line)) {
      const items: Span[][] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+(.*)$/)
        if (!m) break
        items.push(inline(m[1]))
        i++
      }
      blocks.push({ k: 'ul', items })
      continue
    }
    // 连续文本段落(允许单换行当软换行)
    const para: string[] = []
    while (i < lines.length && isParaText(lines[i])) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push({ k: 'p', spans: inline(para.join(' ')) })
  }
  return blocks
}

/** 供导出面板在浏览器里直接把 markdown 原样预览时快速转 HTML(纯字符串, 无 React 依赖) */
export function blocksToHtml(blocks: Block[]): string {
  const spanHtml = (s: Span) => {
    let inner = s.t
    if (s.c) {
      inner = `<code>${s.t}</code>`
    } else {
      if (s.b) inner = `<strong>${inner}</strong>`
      if (s.i) inner = `<em>${inner}</em>`
      if (s.s) inner = `<del>${inner}</del>`
    }
    if (s.img) return `<img src="${s.img}" alt="${escapeHtml(s.t)}" />`
    if (s.a) return `<a href="${s.a}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    return inner
  }
  const itemsHtml = (items: Span[][]) =>
    items.map((it) => `<li>${it.map(spanHtml).join('')}</li>`).join('')
  const out: string[] = []
  for (const b of blocks) {
    switch (b.k) {
      case 'p':
        out.push(`<p>${b.spans.map(spanHtml).join('')}</p>`)
        break
      case 'h':
        out.push(`<h${b.level}>${b.spans.map(spanHtml).join('')}</h${b.level}>`)
        break
      case 'ul':
        out.push(`<ul>${itemsHtml(b.items)}</ul>`)
        break
      case 'ol':
        out.push(`<ol>${itemsHtml(b.items)}</ol>`)
        break
      case 'code':
        out.push(`<pre><code>${escapeHtml(b.lines.join('\n'))}</code></pre>`)
        break
      case 'quote':
        out.push(`<blockquote>${b.spans.map(spanHtml).join('')}</blockquote>`)
        break
      case 'hr':
        out.push('<hr />')
        break
    }
  }
  return out.join('\n')
}

export function mdToHtml(md: string): string {
  return blocksToHtml(mdToBlocks(md))
}

/** 去掉 markdown 语法, 得纯文本(供 txt / docx 首层文本, 保留换行) */
export function mdToText(md: string): string {
  const blocks = mdToBlocks(md)
  const lines: string[] = []
  for (const b of blocks) {
    if (b.k === 'code') {
      lines.push(b.lines.join('\n'))
    } else if (b.k === 'ul' || b.k === 'ol') {
      for (const it of b.items) lines.push(it.map((s) => s.t).join(''))
    } else if (b.k === 'p' || b.k === 'h' || b.k === 'quote') {
      lines.push(b.spans.map((s) => s.t).join(''))
    }
  }
  return lines.join('\n')
}
