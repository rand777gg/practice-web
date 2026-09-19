/**
 * 英语（一）真题「卷面结构」提取：给渲染器用的一切。
 *
 * 跟 `english-questions.ts` 的区别：那份是给题库用的（每题一条记录、材料塞进题干），
 * 这份是**还原卷面**用的——分区标题、Directions 原文、整篇完形（挖空处带题号）、
 * 每篇 Text 的正文、Part B 的顺序骨架、翻译全文与待译句位置、两篇写作的排版素材。
 *
 * 卷面是英文原文，一律按英文提取；题号一律来自提取结果，不在这里生成。
 * 纯函数，无 import。
 */

export interface PaperSectionHead {
  /** 'Section I' / 'Section II Part A' / … */
  ordinal: string
  /** 'Use of English' / 'Reading Comprehension' / 'Writing' */
  title: string
  /** Directions 原文（英文，含分值） */
  directions: string
}

/** 完形：整篇一个题，正文里挖空处带题号，每个空四个选项 */
export interface ClozeBlock extends PaperSectionHead {
  /** 正文，挖空处写成 [[1]] [[2]] … 渲染时画成带题号的空 */
  passage: string
  blanks: { no: number; options: string[] }[]
}

export interface ReadingText {
  no: number
  /** 卷面标题就是 Text 1…4 */
  heading: string
  passage: string
  questions: { no: number; stem: string; options: string[] }[]
}

export interface PartBBlock extends PaperSectionHead {
  /** 段落原文，字母在前 */
  paragraphs: { letter: string; text: string }[]
  /** 卷面已给定的段落字母 */
  placed: string[]
  /** 顺序骨架：字母是已给定的，数字是待填的题号 */
  skeleton: (string | number)[]
  questions: { no: number; options: string[] }[]
}

export interface PartCBlock extends PaperSectionHead {
  /** 全文 */
  passage: string
  /** 待译句（渲染时在这几句上加下划线并标题号） */
  segments: { no: number; sentence: string }[]
}

export interface WritingChart {
  kind: 'pie' | 'bar'
  title?: string
  items: { label: string; value: number }[]
}

export interface WritingBlock extends PaperSectionHead {
  /** 小作文的来信原文（渲染成方框） */
  letterBox?: string
  /** 大作文的图表素材（canvas 画） */
  charts?: WritingChart[]
  chartCaption?: string
}

export interface EnglishPaperLayout {
  title: string
  sections: {
    cloze: ClozeBlock | null
    reading: { head: PaperSectionHead; texts: ReadingText[] } | null
    partB: PartBBlock | null
    partC: PartCBlock | null
    writingA: WritingBlock | null
    writingB: WritingBlock | null
  }
  warnings: string[]
}

const WATERMARK = /https?:\/\/zhenti\.burningvocabulary\.cn/g
const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

function region(text: string, from: RegExp, to: RegExp | null): string {
  const a = text.search(from)
  if (a < 0) return ''
  if (!to) return text.slice(a)
  const rest = text.slice(a + 1)
  const b = rest.search(to)
  return b < 0 ? text.slice(a) : text.slice(a, a + 1 + b)
}

/** Directions: 到正文起点的原文 */
function directionsOf(block: string): string {
  const i = block.search(/Directions?\s*:/i)
  if (i < 0) return ''
  const body = block.slice(i).replace(/^Directions?\s*:\s*/i, '')
  const stop = body.search(/(?:^|\n)\s*(?:Text\s*\d|Part\s+[ABC]\b|\d{1,2}\.\s|[A-H]\.\s)/)
  const seg = stop > 0 ? body.slice(0, stop) : body.slice(0, 900)
  // 分值标记之后就该收尾，别把正文带进来
  const score = seg.search(/\(\s*\d+\s*points?\s*\)/i)
  return flat(score >= 0 ? seg.slice(0, score + seg.slice(score).match(/\(\s*\d+\s*points?\s*\)/i)![0].length) : seg)
}

/** 完形：正文（挖空处换成 [[N]]）+ 每空四个选项（选项按字母分列排在后面） */
function parseCloze(block: string): ClozeBlock | null {
  if (!block) return null
  const optStart = block.search(/(?:^|\n)\s*1\.\s*A\.\s/)
  const optBody = optStart >= 0 ? block.slice(optStart) : ''
  // 正文必须从 Directions 的 (10 points) 之后开始：那段里有 "10"，
  // 不过滤掉会被当成第 10 个空挖掉
  const scoreEnd = block.search(/\(\s*\d+\s*points?\s*\)/i)
  const passageFrom = scoreEnd >= 0 ? scoreEnd + block.slice(scoreEnd).match(/\(\s*\d+\s*points?\s*\)/i)![0].length : 0
  const passageRaw = block.slice(passageFrom, optStart >= 0 ? optStart : block.length)

  // 正文里内联的题号 1..20 → [[N]]
  let passage = passageRaw
  for (let no = 1; no <= 20; no++) {
    passage = passage.replace(new RegExp(`(^|[^0-9\\[\\]])${no}(?![0-9\\]])`), `$1[[${no}]]`)
  }

  const aLines = [...optBody.matchAll(/(?:^|\n)\s*(\d{1,2})\.\s*A\.\s*([^\n]*)/g)].map((m) => ({ no: Number(m[1]), text: m[2].trim() }))
  const cols: Record<string, string[]> = { B: [], C: [], D: [] }
  let bm: RegExpExecArray | null
  const bareRe = /(?:^|\n)\s*([B-H])\.\s*([^\n]*)/g
  while ((bm = bareRe.exec(optBody))) if (cols[bm[1]]) cols[bm[1]].push(bm[2].trim())

  return {
    ordinal: 'Section I',
    title: 'Use of English',
    directions: directionsOf(block),
    passage: flat(passage),
    blanks: aLines.filter((l) => l.no <= 20).map((l, i) => ({
      no: l.no || i + 1,
      options: [l.text, cols.B[i] ?? '', cols.C[i] ?? '', cols.D[i] ?? ''],
    })),
  }
}

/** 阅读 Part A：四篇 Text，每篇正文 + 该篇的题 */
function parseReading(block: string): { head: PaperSectionHead; texts: ReadingText[] } | null {
  if (!block) return null
  const marks = [...block.matchAll(/Text\s*(\d)/g)].map((m, i, arr) => ({
    no: Number(m[1]), from: m.index!, to: i + 1 < arr.length ? arr[i + 1].index! : block.length,
  }))
  const texts: ReadingText[] = marks.map((mk) => {
    const body = block.slice(mk.from, mk.to)
    const firstQ = body.search(/(?:^|\n)\s*\d{1,2}\.\s/)
    const passage = flat(body.slice(0, firstQ > 0 ? firstQ : body.length).replace(/^Text\s*\d\s*/, ''))
    const questions: ReadingText['questions'] = []
    const chunks = (firstQ > 0 ? body.slice(firstQ) : '').split(/\n(?=\s*\d{1,2}\.\s)/)
    for (const chunk of chunks) {
      const h = chunk.match(/^\s*(\d{1,2})\.\s*([\s\S]*)$/)
      if (!h) continue
      const optionRe = /(?:^|\n)\s*([A-H])\.\s*/g
      const found: { letter: string; at: number; end: number }[] = []
      let m: RegExpExecArray | null
      while ((m = optionRe.exec(h[2]))) found.push({ letter: m[1], at: m.index, end: m.index + m[0].length })
      const want = found.filter((x) => x.letter.charCodeAt(0) - 65 < 4).slice(0, 4)
      questions.push({
        no: Number(h[1]),
        stem: flat(want.length ? h[2].slice(0, want[0].at) : h[2]),
        options: want.map((x, i) => flat(h[2].slice(x.end, i + 1 < want.length ? want[i + 1].at : h[2].length))),
      })
    }
    return { no: mk.no, heading: `Text ${mk.no}`, passage, questions }
  })

  return {
    head: { ordinal: 'Section II Part A', title: 'Reading Comprehension', directions: directionsOf(block) },
    texts,
  }
}

/** Part B：段落 + 已给定字母 + 顺序骨架 */
function parsePartB(block: string): PartBBlock | null {
  if (!block) return null
  const placed: string[] = (block.match(/Paragraphs?\s+([A-H](?:\s*,\s*[A-H])*(?:\s*,?\s*and\s+[A-H])?)\s+have\s+been/i)?.[1] ?? '')
    .match(/[A-H]/g) ?? []
  const paragraphs = [...block.matchAll(/(?:^|\n)\s*([A-H])\.\s*([^\n][\s\S]*?)(?=\n\s*[A-H]\.\s|$)/g)]
    .map((m) => ({ letter: m[1], text: flat(m[2]) }))

  // 卷面骨架：F → 41. → 42. → H → 43. → C → 44. → 45.
  const skeleton: (string | number)[] = []
  const skRe = /([A-H])\s*(?:→|->)\s*|(\d{2})\.\s*(?:→|->)\s*|(\d{2})\.\s*$/g
  let m: RegExpExecArray | null
  while ((m = skRe.exec(block))) {
    if (m[3]) skeleton.push(Number(m[3]))
    else if (m[2]) skeleton.push(Number(m[2]))
    else if (m[1]) skeleton.push(m[1])
  }

  const usable = paragraphs.map((p) => p.letter).filter((l) => !placed.includes(l))
  return {
    ordinal: 'Section II Part B',
    title: 'Reading Comprehension Part B',
    directions: directionsOf(block),
    paragraphs,
    placed,
    skeleton,
    questions: Array.from({ length: 5 }, (_, i) => ({
      no: 41 + i,
      options: usable.map((l) => `段落 ${l}`),
    })),
  }
}

/** Part C：翻译全文 + 待译句 */
function parsePartC(block: string): PartCBlock | null {
  if (!block) return null
  const body = block.slice(block.search(/Directions?\s*:/i) < 0 ? 0 : block.search(/Directions?\s*:/i))
  const marks = [...body.matchAll(/\((\d{1,2})\)\s*/g)].map((m) => ({ no: Number(m[1]), start: m.index!, end: m.index! + m[0].length }))
  const segments = marks.filter((mk) => mk.no >= 46 && mk.no <= 50).map((mk) => {
    const rest = body.slice(mk.end, mk.end + 1200)
    const stop = rest.search(/[.?!](?=["”')\]]?\s|["”')\]]?$)/)
    return { no: mk.no, sentence: flat(stop >= 0 ? rest.slice(0, stop + 1) : rest.slice(0, 300)) }
  })
  // 全文：把编号去掉，留干净正文
  let passage = body.replace(/^[\s\S]*?Directions?\s*:\s*/i, '')
  passage = passage.replace(/\(\d{1,2}\)\s*/g, '')
  const first = passage.search(/[A-Z]/)
  return {
    ordinal: 'Section II Part C',
    title: 'Reading Comprehension Part C',
    directions: directionsOf(block),
    passage: flat(first > 0 ? passage.slice(first) : passage),
    segments,
  }
}

/** 写作：小作文的来信方框、大作文的图表数据 */
function parseWriting(blockA: string, blockB: string): { a: WritingBlock | null; b: WritingBlock | null } {
  // 来信在 OCR 文字流里可能排在 52 的 Directions 之后，所以两个区块合起来找
  const letterMatch = `${blockA}\n${blockB}`.match(/Hi\s+Li\s+Ming,([\s\S]*?)(?:Yours,\s*Paul|$)/i)
  const a: WritingBlock | null = blockA ? {
    ordinal: 'Section III Part A',
    title: 'Writing Part A',
    directions: directionsOf(blockA),
    letterBox: letterMatch ? flat(`Hi Li Ming,${letterMatch[1]}`.replace(/\s*(?:Yours,\s*)?Paul\s*$/, '').trim() + ' Yours, Paul') : undefined,
  } : null

  const charts: WritingChart[] = []
  const pie = [...blockB.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(完全接受|部分接受|不接受)/g)].map((m) => ({ label: m[2], value: Number(m[1]) }))
  if (pie.length) charts.push({ kind: 'pie', items: pie })
  // 柱状图的数值和标签在文字流里是分开的两段（数值在前、标签在后），
  // 按「数值紧跟标签」配会配错，也会漏——必须先排除饼图的配对再按顺序配
  const barVals = [...blockB.replace(/[\d.]+\s*%\s*(?:完全接受|部分接受|不接受)/g, '')
    .matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]))
  const barLabels = [...blockB.matchAll(/(安全|价格|便利)/g)].map((m) => m[1])
  if (barVals.length && barLabels.length === barVals.length) {
    charts.push({ kind: 'bar', items: barLabels.map((label, i) => ({ label, value: barVals[i] })) })
  }
  const caption = blockB.match(/一项[^，。\n]{4,40}调查/)?.[0]

  const b: WritingBlock | null = blockB ? {
    ordinal: 'Section III Part B',
    title: 'Writing Part B',
    directions: directionsOf(blockB),
    charts: charts.length ? charts : undefined,
    chartCaption: caption,
  } : null
  return { a, b }
}

export function parseEnglishPaperLayout(rawText: string): EnglishPaperLayout {
  const text = rawText.replace(WATERMARK, '')
  const warnings: string[] = []

  const blockCloze = region(text, /Section\s+I\s+Use\s+of\s+English/i, /Section\s+II\s+Reading\s+Comprehension/i)
  const blockReadA = region(text, /Section\s+II\s+Reading\s+Comprehension/i, /Part\s+B\b/)
  const blockB = region(text, /Part\s+B\b/, /Part\s+C\b/)
  const blockC = region(text, /Part\s+C\b/, /Section\s+III\s+Writing/i)
  const blockW = region(text, /Section\s+III\s+Writing/i, null)
  const blockWA = region(blockW, /Section\s+III\s+Writing/i, /Part\s+B\b/)
  const blockWB = region(blockW, /Part\s+B\b/, null)

  const cloze = parseCloze(blockCloze)
  if (!cloze) warnings.push('没找到完形填空分区')
  else if (cloze.blanks.length !== 20) warnings.push(`完形只解出 ${cloze.blanks.length} 个空，期望 20`)
  else if (!/\[\[/.test(cloze.passage)) warnings.push('完形正文里没找到挖空标记')

  const reading = parseReading(blockReadA)
  if (!reading) warnings.push('没找到阅读 Part A')
  else {
    if (reading.texts.length !== 4) warnings.push(`只解出 ${reading.texts.length} 篇 Text，期望 4`)
    for (const t of reading.texts) if (t.questions.length !== 5) warnings.push(`${t.heading} 解出 ${t.questions.length} 题，期望 5`)
  }

  const partB = parsePartB(blockB)
  if (!partB) warnings.push('没找到 Part B')
  else if (partB.skeleton.length < 5) warnings.push(`Part B 顺序骨架只解出 ${partB.skeleton.length} 项`)

  const partC = parsePartC(blockC)
  if (!partC) warnings.push('没找到翻译')
  else if (partC.segments.length !== 5) warnings.push(`翻译只解出 ${partC.segments.length} 句，期望 5`)

  const { a, b } = parseWriting(blockWA, blockWB)
  if (!a) warnings.push('没找到写作 Part A')
  if (!b) warnings.push('没找到写作 Part B')
  if (b && !b.charts) warnings.push('大作文没解出图表数据')

  const title = text.match(/\d{4}\s*年全国硕士研究生招生考试英语[（(]一[)）]/)?.[0].replace(/\s+/g, ' ').trim() ?? '英语（一）'

  return { title, sections: { cloze, reading, partB, partC, writingA: a, writingB: b }, warnings }
}
