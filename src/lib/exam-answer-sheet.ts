/**
 * 考试模式 ↔ 真实答题卡的映射。
 *
 * 核心一件事：**把「题号」这层概念建起来**。考试模式的作答是
 * `Map<questionId, CorrectAnswer>`，跟题号无关；而真实答题卡的每一格是卷面题号。
 * 没有这层映射，自动涂卡就无从谈起。
 *
 * 题号从哪来：试卷本来就是按分区顺序拼的（`order_mode: 'section'`），
 * 所以 `buildPaperSections()` 切出来的分区顺序 × 各分区题数，就对应卷面的题号区间。
 * 这也是为什么绑了答题卡的模板必须锁 `seq` + `section`：分区内随机抽题会让
 * 「完形第 3 题」变成别的题，自动涂卡直接涂错位。
 *
 * 第二个坑是**选项列号**：应用里 `CorrectAnswer` 的 single_choice 存的是选项下标
 * （number），而卡上要涂的是字母；Part B 的可选字母是 ABDEG（F/H/C 已被卷面给定），
 * 下标 2 对应的是字母 D、在卡上是第 4 列而不是第 3 列。所以一律
 * **先由下标取出字母，再按字母表算列号**，绝不拿下标当列号用。
 */
import { OFFICIAL_ANSWER_CARDS, type OfficialAnswerCard } from '@/lib/answer-sheet-official'
import type { EnglishPaperSection } from '@/lib/english-paper'
import type { PaperSection } from '@/lib/exam-compose'
import type { CorrectAnswer } from '@/types'

export const ENGLISH_CARD_ID = 'official-english1'

/** 英语（一）的卷面结构签名：(题型, 题数) 依次排列 */
const ENGLISH_SIGNATURE: { type: EnglishPaperSection['type']; count: number; options: number }[] = [
  { type: 'single_choice', count: 20, options: 4 },
  { type: 'single_choice', count: 20, options: 4 },
  { type: 'single_choice', count: 5, options: 5 },
  { type: 'short_answer', count: 5, options: 0 },
  { type: 'short_answer', count: 1, options: 0 },
  { type: 'short_answer', count: 1, options: 0 },
]

/** 卷面题号区间，跟 english-paper.ts 的固定结构一致 */
const ENGLISH_RANGES: [number, number][] = [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]]

/**
 * 从选项文本里抠字母前缀（`D. It is undoubtedly true…` → `D`）。
 *
 * Part B 的选项是段落字母，卷面上是 F/H/C 已给定、只在 ABDEG 里挑，
 * 应用里存的是「下标」，光看下标推不出字母。好在导入的真题选项通常自带字母前缀，
 * 有就按它来；没有就退回顺序字母并报警告——绝不拿下标当列号用。
 */
function lettersFromQuestions(questions: { options?: string[] }[]): string[] | undefined {
  const opts = questions[0]?.options ?? []
  if (!opts.length) return undefined
  const letters = opts.map((o) => /^\s*([A-Ha-h])\s*[.、)．]/.exec(o)?.[1]?.toUpperCase())
  return letters.every((l): l is string => typeof l === 'string') ? letters : undefined
}

/** 单选题的选项字母：优先取卷面自带的字母前缀，否则按 A、B、C… 顺序 */
function optionsForSection(questions: PaperSection['questions'], count: number): string[] {
  const fromText = lettersFromQuestions(questions)
  if (fromText && fromText.length === count) return fromText
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i))
}

export interface EnglishCardBinding {
  card: OfficialAnswerCard
  /** 与试卷分区一一对应的卡上分区 */
  sections: EnglishPaperSection[]
  /** 每个分区分到的题数（用来切题号） */
  counts: number[]
  warnings: string[]
}

/**
 * 用试卷分区去认「英语（一）」这张卡。
 *
 * 现在按「分区数 + 每区题数 + 是否单选 + 选项数」的结构签名来认，而不是让模板显式声明卡 id
 * ——显式声明要给 exam_templates 加列、走迁移，等要同时支持数学 / 政治时再补。
 * 签名不匹配就返回 null：宁可不出答题卡视图，也不硬套一张错位卡。
 */
export function matchEnglishCard(paperSections: PaperSection[]): EnglishCardBinding | null {
  const usable = paperSections.filter((s) => s.questions.length > 0)
  if (usable.length !== ENGLISH_SIGNATURE.length) return null

  for (let i = 0; i < ENGLISH_SIGNATURE.length; i++) {
    const want = ENGLISH_SIGNATURE[i]
    const got = usable[i]
    if (got.questions.length !== want.count) return null
    const types = new Set(got.questions.map((q) => q.question_type))
    if (want.type === 'single_choice') {
      if (types.size !== 1 || !types.has('single_choice')) return null
      const optionCounts = new Set(got.questions.map((q) => q.options?.length ?? 0))
      // Part B 允许 5~8 个选项（不同年份 7 选 5 / 8 选 5），其余必须是 4
      if (want.options === 4 ? [...optionCounts].some((n) => n !== 4) : [...optionCounts].some((n) => n < 5 || n > 8)) return null
    } else if (types.has('single_choice')) {
      return null
    }
  }

  const card = OFFICIAL_ANSWER_CARDS.find((c) => c.id === ENGLISH_CARD_ID)
  if (!card) return null

  const warnings: string[] = []
  const sections: EnglishPaperSection[] = ENGLISH_SIGNATURE.map((sig, i) => {
    const optionLabels = sig.type === 'single_choice' ? optionsForSection(usable[i].questions, sig.options) : undefined
    if (sig.type === 'single_choice' && !lettersFromQuestions(usable[i].questions) && sig.options !== 4) {
      warnings.push(
        `第 ${i + 1} 个分区（题号 ${ENGLISH_RANGES[i][0]}-${ENGLISH_RANGES[i][1]}）的选项文本里没有字母前缀，`
        + `列号按顺序 ${optionLabels?.join('')} 推算；Part B 卷面可选字母是 ABDEG，对不上就会涂错列`,
      )
    }
    return {
      ordinal: ['Section I', 'Section II Part A', 'Section II Part B', 'Section II Part C', 'Section III Part A', 'Section III Part B'][i],
      name: `${card.name} · ${['完形填空', '阅读理解 Part A', '新题型 Part B', '翻译 Part C', '应用文', '短文写作'][i]}`,
      type: sig.type,
      range: ENGLISH_RANGES[i],
      count: sig.count,
      score: [10, 40, 10, 10, 10, 20][i],
      options: sig.options,
      optionLabels,
    }
  })

  return { card, sections, counts: ENGLISH_SIGNATURE.map((s) => s.count), warnings }
}

export interface NumberMap {
  /** questionId -> 卷面题号 */
  noByQuestionId: Map<string, number>
  /** 卷面题号 -> questionId */
  questionIdByNo: Map<number, string>
  warnings: string[]
}

/** 按分区顺序把题号铺到题目上 */
export function buildNumberMap(paperSections: PaperSection[], binding: EnglishCardBinding): NumberMap {
  const noByQuestionId = new Map<string, number>()
  const questionIdByNo = new Map<number, string>()
  const warnings: string[] = []

  const usable = paperSections.filter((s) => s.questions.length > 0)
  usable.forEach((section, si) => {
    const [from, to] = binding.sections[si].range
    section.questions.forEach((q, qi) => {
      const no = from + qi
      if (no > to) {
        warnings.push(`第 ${si + 1} 个分区题数超出题号区间 ${from}-${to}，多出来的题没映射到卡上`)
        return
      }
      noByQuestionId.set(q.id, no)
      questionIdByNo.set(no, q.id)
    })
  })

  return { noByQuestionId, questionIdByNo, warnings }
}

/**
 * 学生答案 → 卡上要涂的列号。
 * 先由下标取字母、再按字母表算列号：Part B 的下标 2 是字母 D → 第 4 列（index 3）。
 */
export function answerColumns(answer: CorrectAnswer | null | undefined, section: EnglishPaperSection): number[] {
  if (answer == null) return []
  const labels = section.optionLabels ?? ['A', 'B', 'C', 'D']
  const indices = typeof answer === 'number'
    ? [answer]
    : Array.isArray(answer) && answer.every((v) => typeof v === 'number')
      ? (answer as number[])
      : []
  return indices
    .map((i) => labels[i])
    .filter((l): l is string => typeof l === 'string' && l.length === 1)
    .map((l) => l.toUpperCase().charCodeAt(0) - 65)
    .filter((c) => c >= 0 && c < 26)
}

/** 卡上题号 → 分区（用来查选项字母表与题型） */
export function sectionByNo(binding: EnglishCardBinding, no: number): EnglishPaperSection | null {
  return binding.sections.find((s) => no >= s.range[0] && no <= s.range[1]) ?? null
}

/**
 * 会话作答 → 答题卡草稿（题号 → 要涂的列号）。
 * 主观题（翻译 / 写作）在卡上是手写框，这里不出格子。
 */
export function buildCardAnswers(
  answers: Map<string, CorrectAnswer>,
  numberMap: NumberMap,
  binding: EnglishCardBinding,
): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const [questionId, answer] of answers) {
    const no = numberMap.noByQuestionId.get(questionId)
    if (no == null) continue
    const section = sectionByNo(binding, no)
    if (!section || section.type !== 'single_choice') continue
    const cols = answerColumns(answer, section)
    if (cols.length) out[no] = cols
  }
  return out
}
