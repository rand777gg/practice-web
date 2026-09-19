/**
 * 考研英语（一）试题 PDF → 分区与题号。
 *
 * 为什么单独写一份，不复用 paper-cover.ts 的 parseSectionsFromText：
 * 那份是给中文自命题卷用的，认「一、」「第 N~M 题」「共 N 分」。英语（一）是
 * 「Section I Use of English / Section II Reading Comprehension Part A/B/C /
 * Section III Writing Part A/B」，一个都对不上。
 *
 * 这份 PDF 的文字层是 OCR 出来的，有几个坑必须专门处理：
 *   - 每页页眉有 https://zhenti.burningvocabulary.cn 水印，先剥掉；
 *   - 单词会粘在一起（alsohas / Theworld），所以调用方要按 x 间距补空格再喂进来
 *     （见 scripts/parse-english-paper.mjs 的 extractPagesText）；
 *   - 完形填空的选项是「按字母分列」的：先 1~20 的 A 选项、再 1~20 的 B 选项……；
 *   - 翻译 46–50 用的是圆括号编号 (46)，不是「46.」；
 *   - Part B 的 41–45 在正文里是 `F → 41. → 42. → H → 43. → C → 44. → 45.` 这种骨架，
 *     题号不在行首，只能靠显式的 “For questions 41-45”。
 *
 * 模块保持纯函数（无 import），便于脚本直接跑起来验证。
 */

export type EnglishSectionType = 'single_choice' | 'short_answer'

export interface EnglishPaperSection {
  /** 'Section I' / 'Section II Part A' / … */
  ordinal: string
  name: string
  type: EnglishSectionType
  /** 题号范围（卷面事实，答题卡映射就靠它） */
  range: [number, number]
  count: number
  /** 该大题总分 */
  score: number
  /** 单选：每题选项数；主观题 0 */
  options: number
  /** 选项字母，非 A–D 时给出（Part B 是 A–H，且 F/H/C 已给定） */
  optionLabels?: string[]
}

export interface EnglishPaperParse {
  title: string
  sections: EnglishPaperSection[]
  /** 页眉水印剥掉了几个 */
  watermarkHits: number
  warnings: string[]
}

/**
 * 页眉水印。注意不能顺带吃掉后面的换行——水印紧跟在页码后面，
 * 吃掉换行会让下一页首个题号（如完形的 1.、阅读的 21.）不再位于行首而漏检。
 */
const WATERMARK = /https?:\/\/zhenti\.burningvocabulary\.cn/g

export function stripWatermark(text: string): { text: string; hits: number } {
  const hits = (text.match(WATERMARK) ?? []).length
  return { text: text.replace(WATERMARK, ''), hits }
}

/** 六个分区的锚点，必须按卷面顺序找，后一个从上一个之后开始找 */
const ANCHORS: { key: string; label: string; re: RegExp }[] = [
  { key: 'cloze', label: 'Section I', re: /Section\s+I\s+Use\s+of\s+English/i },
  { key: 'readA', label: 'Section II Part A', re: /Section\s+II\s+Reading\s+Comprehension[\s\S]{0,60}?Part\s+A/i },
  { key: 'readB', label: 'Section II Part B', re: /Part\s+B/i },
  { key: 'readC', label: 'Section II Part C', re: /Part\s+C/i },
  { key: 'writeA', label: 'Section III Part A', re: /Section\s+III\s+Writing[\s\S]{0,60}?Part\s+A/i },
  { key: 'writeB', label: 'Section III Part B', re: /Part\s+B/i },
]

/** 英语（一）的固定结构：锚点上认不出范围/分数时用这套兜底 */
const FALLBACK: Record<string, Omit<EnglishPaperSection, 'ordinal'>> = {
  cloze: { name: 'Use of English（完形填空）', type: 'single_choice', range: [1, 20], count: 20, score: 10, options: 4 },
  readA: { name: 'Reading Comprehension Part A（阅读理解）', type: 'single_choice', range: [21, 40], count: 20, score: 40, options: 4 },
  readB: { name: 'Reading Comprehension Part B（新题型）', type: 'single_choice', range: [41, 45], count: 5, score: 10, options: 5 },
  readC: { name: 'Reading Comprehension Part C（翻译）', type: 'short_answer', range: [46, 50], count: 5, score: 10, options: 0 },
  writeA: { name: 'Writing Part A（应用文）', type: 'short_answer', range: [51, 51], count: 1, score: 10, options: 0 },
  writeB: { name: 'Writing Part B（短文写作）', type: 'short_answer', range: [52, 52], count: 1, score: 20, options: 0 },
}

/** 行首的「N.」题号 */
function lineNumbers(text: string): number[] {
  return [...text.matchAll(/(?:^|\n)\s*(\d{1,2})\.\s/g)].map((m) => Number(m[1]))
}

/** 圆括号编号 (46)，翻译用的就是这种 */
function parenNumbers(text: string): number[] {
  return [...text.matchAll(/\((\d{1,2})\)/g)].map((m) => Number(m[1]))
}

/** 段落字母 A. / B. …，Part B 的选项就是这样列的 */
function paragraphLetters(text: string): string[] {
  return [...new Set([...text.matchAll(/(?:^|\n)\s*([A-H])\.\s/g)].map((m) => m[1]))].sort()
}

export function parseEnglishPaper(rawText: string): EnglishPaperParse {
  const warnings: string[] = []
  const { text, hits } = stripWatermark(rawText)

  const titleMatch = text.match(/\d{4}\s*年全国硕士研究生招生考试英语[（(]一[)）]/)
  const title = titleMatch ? titleMatch[0].replace(/\s+/g, ' ').trim() : '考研英语（一）'

  // 按卷面顺序落锚点
  const found: { key: string; label: string; start: number; end: number }[] = []
  let cursor = 0
  for (const anchor of ANCHORS) {
    const slice = text.slice(cursor)
    const m = slice.match(anchor.re)
    if (!m || m.index === undefined) {
      warnings.push(`没找到 ${anchor.label} 的标题`)
      continue
    }
    const start = cursor + m.index
    found.push({ key: anchor.key, label: anchor.label, start, end: text.length })
    cursor = start + m[0].length
  }
  // 每个分区的结束位置 = 下一个分区开始位置
  for (let i = 0; i < found.length - 1; i++) found[i].end = found[i + 1].start

  const sections: EnglishPaperSection[] = []
  for (const f of found) {
    const fallback = FALLBACK[f.key]
    const body = text.slice(f.start, f.end)

    // 总分：分区里第一个 (N points)
    const scoreMatch = body.match(/\(\s*(\d+)\s*points?\s*\)/i)
    const score = scoreMatch ? Number(scoreMatch[1]) : fallback.score
    if (!scoreMatch) warnings.push(`${f.label} 没读到分值，用兜底 ${fallback.score}`)

    // 题号范围：显式 “For questions 41-45” 优先，其次从卷面题号推
    let range = fallback.range
    const explicit = body.match(/For\s+questions?\s+(\d+)\s*[-–—]\s*(\d+)/i)
    if (explicit) {
      range = [Number(explicit[1]), Number(explicit[2])]
    } else {
      const nums = fallback.type === 'short_answer' && f.key === 'readC' ? parenNumbers(body) : lineNumbers(body)
      const inFallback = nums.filter((n) => n >= fallback.range[0] - 2 && n <= fallback.range[1] + 2)
      if (inFallback.length) {
        const lo = Math.min(...inFallback)
        const hi = Math.max(...inFallback)
        // 只在跟固定结构对得上时才信卷面题号，否则说明抓串了
        if (lo === fallback.range[0] && hi === fallback.range[1]) range = [lo, hi]
        else warnings.push(`${f.label} 卷面题号 ${lo}-${hi} 与固定结构 ${fallback.range.join('-')} 不一致，用固定结构`)
      }
    }

    // 选项：Part B 的选项是段落字母，且 F/H/C 已在卷面给定，学生实际只在这几个里挑
    let optionLabels: string[] | undefined
    let options = fallback.options
    if (f.key === 'readB') {
      const letters = paragraphLetters(body)
      const placed: string[] = (body.match(/Paragraphs?\s+([A-H](?:\s*,\s*[A-H])*(?:\s*,?\s*and\s+[A-H])?)\s+have\s+been/i)?.[1] ?? '')
        .match(/[A-H]/g) ?? []
      if (letters.length >= 4) {
        const usable = letters.filter((l) => !placed.includes(l))
        optionLabels = usable.length ? usable : letters
        options = optionLabels.length
        warnings.push(
          `Part B 段落共 ${letters.length} 个（${letters.join('')}），卷面已给定 ${placed.join('') || '?'}，`
          + `待选 ${options} 个（${optionLabels.join('')}）→ 都落在卡上 A–G 七格里，卡不用改`,
        )
      } else {
        warnings.push('Part B 没读到段落列表，选项数用兜底')
      }
    }

    sections.push({
      ordinal: f.label,
      name: fallback.name,
      type: fallback.type,
      range,
      count: range[1] - range[0] + 1,
      score,
      options,
      optionLabels,
    })
  }

  // 结构自检：六个分区、题号首尾相连
  const expected = [1, 20, 21, 40, 41, 45, 46, 50, 51, 51, 52, 52]
  const flat = sections.flatMap((s) => s.range)
  if (flat.length === expected.length && flat.some((v, i) => v !== expected[i])) {
    warnings.push(`题号区间跟英语（一）固定结构不一致：${flat.join(',')}`)
  }
  if (sections.length !== 6) warnings.push(`分区数 ${sections.length}，期望 6`)

  return { title, sections, watermarkHits: hits, warnings }
}
