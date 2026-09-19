/**
 * 考研英语（一）试题 → 题目。
 *
 * 接 `english-paper.ts`（那份只切分区和题号），这里把**题干、选项**抠出来。
 * 四种版式各不相同，规则必须分开写：
 *   1–20 完形：题干正文在第 1 页、选项在**另一页按字母分列**（先 1~20 的 A、再 1~20 的 B…）；
 *   21–40 阅读：`21. 题干` 后面直接跟 `A. B. C. D.`，是标准的四选一；
 *   41–45 新题型：题号在正文里是骨架 `F → 41. → 42. → H …`，没有题干，选项是段落字母；
 *   46–50 翻译：圆括号编号 `(46) English sentence`，题干就是那句英文；
 *   51–52 写作：`51. Directions: …`，题干是要求原文。
 *
 * 纯函数，无 import，便于脚本直接跑。
 */

export interface EnglishQuestion {
  no: number
  type: 'single_choice' | 'short_answer'
  stem: string
  /** 单选才有；顺序与卷面一致 */
  options: string[]
  /** 选项自带字母时给出（Part B 是段落字母） */
  optionLabels?: string[]
  /** 主观题的补充说明 */
  note?: string
}

const WATERMARK = /https?:\/\/zhenti\.burningvocabulary\.cn/g

/** 六大分区的锚点，按卷面顺序找 */
const ANCHORS: { key: string; re: RegExp }[] = [
  { key: 'cloze', re: /Section\s+I\s+Use\s+of\s+English/i },
  { key: 'readA', re: /Section\s+II\s+Reading\s+Comprehension[\s\S]{0,60}?Part\s+A/i },
  { key: 'readB', re: /Part\s+B/i },
  { key: 'readC', re: /Part\s+C/i },
  { key: 'writeA', re: /Section\s+III\s+Writing[\s\S]{0,60}?Part\s+A/i },
  { key: 'writeB', re: /Part\s+B/i },
]

function regions(text: string): Record<string, string> {
  const found: { key: string; start: number; end: number }[] = []
  let cursor = 0
  for (const a of ANCHORS) {
    const m = text.slice(cursor).match(a.re)
    if (!m || m.index === undefined) continue
    const start = cursor + m.index
    found.push({ key: a.key, start, end: text.length })
    cursor = start + m[0].length
  }
  for (let i = 0; i < found.length - 1; i++) found[i].end = found[i + 1].start
  const out: Record<string, string> = {}
  for (const f of found) out[f.key] = text.slice(f.start, f.end)
  return out
}

/** 把一段文字按「空行或换行」压成单行，便于当题干 */
const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

/**
 * 阅读 Part A / 完形选项这类标准四选一：
 * `21. 题干\nA. …\nB. …\nC. …\nD. …`
 */
function parseStandardChoice(body: string, from: number, to: number, optionCount = 4): EnglishQuestion[] {
  const out: EnglishQuestion[] = []
  // 以「行首 题号」切块；块内再切选项
  const chunks = body.split(/\n(?=\s*\d{1,2}\.\s)/)
  for (const chunk of chunks) {
    const head = chunk.match(/^\s*(\d{1,2})\.\s*([\s\S]*)$/)
    if (!head) continue
    const no = Number(head[1])
    if (no < from || no > to) continue
    const rest = head[2]
    // 选项切分：A. 之后的内容归 A，依此类推
    const optionRe = /(?:^|\n)\s*([A-H])\.\s*/g
    const marks: { letter: string; at: number; end: number }[] = []
    let m: RegExpExecArray | null
    while ((m = optionRe.exec(rest))) marks.push({ letter: m[1], at: m.index, end: m.index + m[0].length })
    const wanted = marks.filter((x) => x.letter.charCodeAt(0) - 65 < optionCount).slice(0, optionCount)
    const stem = flat(wanted.length ? rest.slice(0, wanted[0].at) : rest)
    const options = wanted.map((x, i) => {
      const stop = i + 1 < wanted.length ? wanted[i + 1].at : rest.length
      return flat(rest.slice(x.end, stop))
    })
    if (!stem) continue
    out.push({ no, type: 'single_choice', stem, options })
  }
  return out
}

/**
 * 完形填空：题干句子在正文里（空格内联编号），选项在另一页按字母分列。
 * 选项块长这样：`1. A. Still` … `20. A. replace` 然后 B 列 20 行、C 列 20 行、D 列 20 行。
 */
function parseCloze(body: string): { questions: EnglishQuestion[]; warnings: string[] } {
  const warnings: string[] = []

  // 选项块：找连续的 `N. A. xxx` 行
  const optLineRe = /(?:^|\n)\s*(\d{1,2})\.\s*([A-H])\.\s*([^\n]*)/g
  const lines: { no: number; letter: string; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = optLineRe.exec(body))) lines.push({ no: Number(m[1]), letter: m[2], text: m[3].trim() })

  const aLines = lines.filter((l) => l.letter === 'A' && l.no <= 20)
  if (aLines.length !== 20) warnings.push(`完形选项块只找到 ${aLines.length} 道题的 A 选项，期望 20`)

  // A 列之后是 B/C/D 列：把选项块剩下的文本按 `X. ` 顺序收集
  const blockStart = body.search(/(?:^|\n)\s*1\.\s*A\.\s/)
  const block = blockStart >= 0 ? body.slice(blockStart) : ''
  const bareRe = /(?:^|\n)\s*([B-H])\.\s*([^\n]*)/g
  const columns: Record<string, string[]> = { B: [], C: [], D: [] }
  let bm: RegExpExecArray | null
  while ((bm = bareRe.exec(block))) {
    const letter = bm[1]
    if (columns[letter]) columns[letter].push(bm[2].trim())
  }
  for (const letter of ['B', 'C', 'D']) {
    if (columns[letter].length !== 20) warnings.push(`完形 ${letter} 列收到 ${columns[letter].length} 项，期望 20`)
  }

  // 题干：正文里空格编号前后的句子片段
  const passageEnd = blockStart >= 0 ? blockStart : body.length
  const passage = body.slice(0, passageEnd)
  const questions: EnglishQuestion[] = aLines.map((a, i) => {
    const no = i + 1
    const marker = new RegExp(`(?:^|[^0-9])${no}(?![0-9])`)
    const hit = marker.exec(passage)
    let stem = ''
    if (hit) {
      const left = passage.slice(0, hit.index)
      const right = passage.slice(hit.index + hit[0].length)
      // 往左取到上一个句号，往右取到下一个句号，就是空格所在的句子
      const start = Math.max(left.lastIndexOf('. ') + 1, left.lastIndexOf('\n') + 1, 0)
      const endRel = right.search(/[.?!]\s/)
      const end = endRel >= 0 ? endRel + 1 : Math.min(right.length, 120)
      stem = flat(left.slice(start) + ' ___ ' + right.slice(0, end))
    }
    if (!stem) warnings.push(`完形第 ${no} 题没定位到题干句子`)
    return {
      no,
      type: 'single_choice',
      stem,
      options: [a.text, columns.B[i] ?? '', columns.C[i] ?? '', columns.D[i] ?? ''],
    }
  })

  return { questions, warnings }
}

/**
 * 翻译：`(46) English sentence` —— **只取紧跟编号的那一句**。
 *
 * 不能取到下一个编号为止：划线段落之间还夹着没编号的正文，
 * 按「到下一个 (47) 为止」会一次吞进两三句，题干就错了。
 */
function parseTranslation(body: string): EnglishQuestion[] {
  const out: EnglishQuestion[] = []
  const re = /\((\d{1,2})\)\s*/g
  const marks: { no: number; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) marks.push({ no: Number(m[1]), start: m.index, end: m.index + m[0].length })
  for (const mk of marks) {
    if (mk.no < 46 || mk.no > 50) continue
    const rest = body.slice(mk.end, mk.end + 1200)
    // 第一个句末标点（后跟空白或行尾）就是这句的终点
    const stop = rest.search(/[.?!](?=["”')\]]?\s|["”')\]]?$)/)
    const sentence = stop >= 0 ? rest.slice(0, stop + 1) : rest.slice(0, 300)
    out.push({ no: mk.no, type: 'short_answer', stem: flat(sentence), options: [], note: '把划线段落译成中文（英语一 Part C）' })
  }
  return out
}

/**
 * 写作：`51. Directions: … (10 points)` —— 到分值标记为止。
 *
 * 不能取到下一题为止：图表标签、小作文的邮件原文在 OCR 的文字流里可能排在
 * 下一题的 Directions 之后，会把别的题的材料混进本题题干。
 */
function parseWriting(body: string): EnglishQuestion[] {
  const out: EnglishQuestion[] = []
  const re = /(?:^|\n)\s*(5[12])\.\s*Directions?:\s*/g
  const marks: { no: number; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) marks.push({ no: Number(m[1]), start: m.index, end: m.index + m[0].length })
  for (const mk of marks) {
    const rest = body.slice(mk.end, mk.end + 1500)
    const stop = rest.search(/\(\s*\d+\s*points?\s*\)/i)
    const text = stop >= 0 ? rest.slice(0, stop + rest.slice(stop).match(/\(\s*\d+\s*points?\s*\)/i)![0].length) : rest.slice(0, 500)
    out.push({ no: mk.no, type: 'short_answer', stem: flat(text), options: [] })
  }
  return out
}

/** 新题型 Part B：选题号与段落字母 */
function parsePartB(body: string): { questions: EnglishQuestion[]; warnings: string[] } {
  const warnings: string[] = []
  const placed: string[] = (body.match(/Paragraphs?\s+([A-H](?:\s*,\s*[A-H])*(?:\s*,?\s*and\s+[A-H])?)\s+have\s+been/i)?.[1] ?? '')
    .match(/[A-H]/g) ?? []
  const letters = [...new Set([...body.matchAll(/(?:^|\n)\s*([A-H])\.\s/g)].map((m) => m[1]))].sort()
  if (letters.length < 5) warnings.push(`Part B 只读到 ${letters.length} 个段落字母`)
  const usable = letters.filter((l) => !placed.includes(l))
  const questions: EnglishQuestion[] = []
  for (let no = 41; no <= 45; no++) {
    questions.push({
      no,
      type: 'single_choice',
      stem: `第 ${no} 个空应填哪一段？（卷面已给定 ${placed.join('、') || '若干'} 段）`,
      options: usable.map((l) => `段落 ${l}`),
      optionLabels: usable,
      note: '排序题：注意段落的逻辑衔接',
    })
  }
  return { questions, warnings }
}

export interface EnglishParseResult {
  questions: EnglishQuestion[]
  warnings: string[]
}

/** 整卷 → 题目（按题号排序） */
export function parseEnglishQuestions(rawText: string): EnglishParseResult {
  const text = rawText.replace(WATERMARK, '')
  const r = regions(text)
  const warnings: string[] = []
  const questions: EnglishQuestion[] = []

  if (r.cloze) {
    const cloze = parseCloze(r.cloze)
    questions.push(...cloze.questions)
    warnings.push(...cloze.warnings)
  } else warnings.push('没找到完形填空分区')

  if (r.readA) questions.push(...parseStandardChoice(r.readA, 21, 40))
  else warnings.push('没找到阅读 Part A 分区')

  if (r.readB) {
    const partB = parsePartB(r.readB)
    questions.push(...partB.questions)
    warnings.push(...partB.warnings)
  } else warnings.push('没找到阅读 Part B 分区')

  if (r.readC) questions.push(...parseTranslation(r.readC))
  else warnings.push('没找到翻译分区')

  const writing = [
    ...(r.writeA ? parseWriting(r.writeA) : []),
    ...(r.writeB ? parseWriting(r.writeB) : []),
  ]
  questions.push(...writing)
  if (writing.length !== 2) warnings.push(`写作只解出 ${writing.length} 题，期望 2`)

  questions.sort((a, b) => a.no - b.no)

  // 自检：52 题、题号连续、单选都是 4 选项（Part B 例外）
  const nos = questions.map((q) => q.no)
  const missing = Array.from({ length: 52 }, (_, i) => i + 1).filter((n) => !nos.includes(n))
  if (missing.length) warnings.push(`缺失题号：${missing.join(',')}`)
  const badOptions = questions.filter((q) => q.type === 'single_choice' && q.no <= 40 && q.options.length !== 4)
  if (badOptions.length) warnings.push(`有 ${badOptions.length} 道单选题不是 4 个选项：${badOptions.map((q) => q.no).join(',')}`)
  const emptyStem = questions.filter((q) => !q.stem.trim())
  if (emptyStem.length) warnings.push(`有 ${emptyStem.length} 道题没解出题干：${emptyStem.map((q) => q.no).join(',')}`)

  return { questions, warnings }
}
