/**
 * 考试模式 ↔ 真实答题卡的映射。
 *
 * 核心一件事：**把「卷面题号」这层概念建起来**。考试模式的作答是
 * `Map<questionId, 作答>`，跟题号无关；而真实答题卡的每一格是卷面题号。
 * 没有这层映射，自动涂卡就无从谈起。
 *
 * 题号从哪来：试卷本来就有分区结构（真题模板 `order_mode: 'section'` + `sample_mode: 'seq'`），
 * 分区顺序 × 各分区的小题数，就是卷面的题号区间。所以绑了答题卡的模板必须锁
 * `seq` + `section`：分区内随机抽题会让「完形第 3 题」变成别的题，自动涂卡直接涂错位。
 *
 * 两个坑：
 *   1. **一格 ≠ 一道记录**。卷面一条记录挂多个小题（完形 20 空、阅读一篇 5 问），
 *      所以映射的键是「记录 + 小题」（`slotKey`），不是 questionId。小题 id 就是卷面题号。
 *   2. **选项列号**。应用里 `CorrectAnswer` 的 single_choice 存的是选项下标（number），
 *      而卡上要涂的是字母；Part B 的可选字母是 A、B、D、E、G（C/F/H 已被卷面给定），
 *      下标 2 对应字母 D、在卡上是第 4 列而不是第 3 列。所以一律
 *      **先由下标取出字母，再按字母表算列号**，绝不拿下标当列号用。
 */
import { OFFICIAL_ANSWER_CARDS, type OfficialAnswerCard } from '@/lib/answer-sheet-official'
import { paperItemCount, recordSlotIds, slotEntries, slotKey, type PaperSlot } from '@/lib/exam-paper'
import type { EnglishPaperSection } from '@/lib/english-paper'
import type { PaperSection } from '@/lib/exam-compose'
import type { CorrectAnswer, Question, QuestionType } from '@/types'

export const ENGLISH_CARD_ID = 'official-english1'

/** 英语（一）的卷面结构签名：分区依次是哪种题型、每条记录几格 */
const ENGLISH_SIGNATURE: {
  type: QuestionType
  /** 该分区每条记录占几格（阅读是四篇各 5 问） */
  items: number[]
  ordinal: string
  name: string
  /** 该大题总分 */
  score: number
}[] = [
  { type: 'cloze', items: [20], ordinal: 'Section I', name: '完形填空', score: 10 },
  { type: 'reading_set', items: [5, 5, 5, 5], ordinal: 'Section II Part A', name: '阅读理解 Part A', score: 40 },
  { type: 'sentence_order', items: [5], ordinal: 'Section II Part B', name: '新题型 Part B', score: 10 },
  { type: 'translation', items: [5], ordinal: 'Section II Part C', name: '翻译 Part C', score: 10 },
  { type: 'writing', items: [1], ordinal: 'Section III Part A', name: '应用文', score: 10 },
  { type: 'writing', items: [1], ordinal: 'Section III Part B', name: '短文写作', score: 20 },
]

/** 卷面题号区间，跟真题卷的固定结构一致 */
const ENGLISH_RANGES: [number, number][] = [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]]

/**
 * 从选项文本里抠字母。
 *
 * 两种写法都要认，别只认一种：
 *   - 字母在前带标点：`D. It is undoubtedly true…`；
 *   - 字母在后：`段落 D`（Part B 入库时就是这种，选项是段落引用）。
 * 只认前者的话，Part B 的字母表会退化成 A、B、C、D、E，
 * 于是答案 E 会被当成下标 3 → 涂到 D 格上（错一格，且很隐蔽）。
 */
function letterOf(text: string): string | undefined {
  const s = text.trim()
  const head = /^([A-Ha-h])\s*[.、)．]/.exec(s)
  if (head) return head[1].toUpperCase()
  const tail = /(?:^|\s)([A-Ha-h])$/.exec(s)
  if (tail) return tail[1].toUpperCase()
  return undefined
}

/** 一条记录的代表选项：多小题题型取第一个小题的选项，其余取记录自己的 */
function optionTexts(q: Question): string[] {
  const subs = q.case_questions ?? []
  return (subs.length ? subs[0].options : q.options) ?? []
}

function lettersFromQuestions(questions: Question[]): string[] | undefined {
  const opts = optionTexts(questions[0])
  if (!opts.length) return undefined
  const letters = opts.map(letterOf)
  if (!letters.every((l): l is string => typeof l === 'string')) return undefined
  if (new Set(letters).size !== letters.length) return undefined
  return letters
}

/** 单选题的选项字母：优先取卷面自带的字母前缀，否则按 A、B、C… 顺序 */
function optionsForSection(questions: Question[], count: number): string[] {
  const fromText = lettersFromQuestions(questions)
  if (fromText && fromText.length === count) return fromText
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i))
}

export interface EnglishCardBinding {
  card: OfficialAnswerCard
  /** 与试卷分区一一对应的卡上分区 */
  sections: EnglishPaperSection[]
  warnings: string[]
}

/**
 * 用试卷分区去认「英语（一）」这张卡。
 *
 * 按「分区数 + 分区题型 + 每区小题数」的结构签名来认，而不是让模板显式声明卡 id
 * ——显式声明要给 exam_templates 加列、走迁移，等要同时支持数学 / 政治时再补。
 * 签名不匹配就返回 null：宁可不出答题卡视图，也不硬套一张错位卡。
 */
export function matchEnglishCard(paperSections: PaperSection[]): EnglishCardBinding | null {
  const usable = paperSections.filter((s) => s.questions.length > 0)
  if (usable.length !== ENGLISH_SIGNATURE.length) return null

  for (let i = 0; i < ENGLISH_SIGNATURE.length; i++) {
    const want = ENGLISH_SIGNATURE[i]
    const got = usable[i]
    if (got.questions.length !== want.items.length) return null
    if (got.questions.some((q, qi) => q.question_type !== want.type || paperItemCount(q) !== want.items[qi])) return null
  }

  const card = OFFICIAL_ANSWER_CARDS.find((c) => c.id === ENGLISH_CARD_ID)
  if (!card) return null

  const warnings: string[] = []
  const sections: EnglishPaperSection[] = ENGLISH_SIGNATURE.map((sig, i) => {
    // 只有 Part B 的选项自带字母（段落 A、B、D、E、G）。完形/阅读的选项是英文句子，
    // 去文本里抠字母反而可能被词尾字母骗到（如 `… in a`），一律按 A–D
    const objective = sig.type !== 'translation' && sig.type !== 'writing'
    const partB = sig.type === 'sentence_order'
    const count = sig.items.reduce((n, v) => n + v, 0)
    const optionLabels = !objective
      ? undefined
      : partB
        ? optionsForSection(usable[i].questions, 5)
        : ['A', 'B', 'C', 'D']
    if (partB && !lettersFromQuestions(usable[i].questions)) {
      warnings.push(
        `第 ${i + 1} 个分区（题号 ${ENGLISH_RANGES[i][0]}-${ENGLISH_RANGES[i][1]}）的选项文本里没有字母前缀，`
        + `列号按顺序 ${optionLabels?.join('')} 推算；Part B 卷面可选字母是 ABDEG，对不上就会涂错列`,
      )
    }
    return {
      ordinal: sig.ordinal,
      name: `${card.name} · ${sig.name}`,
      type: objective ? 'single_choice' : 'short_answer',
      range: ENGLISH_RANGES[i],
      count,
      score: sig.score,
      options: objective ? (partB ? 5 : 4) : 0,
      optionLabels,
    }
  })

  return { card, sections, warnings }
}

export interface NumberMap {
  /** 卷面题号 → 该格对应的记录与小题 */
  slotByNo: Map<number, PaperSlot>
  /** `slotKey(记录, 小题)` → 卷面题号 */
  noBySlot: Map<string, number>
  warnings: string[]
}

/** 按分区顺序把题号铺到记录的小题上（一条记录可能占好几格） */
export function buildNumberMap(paperSections: PaperSection[], binding: EnglishCardBinding): NumberMap {
  const slotByNo = new Map<number, PaperSlot>()
  const noBySlot = new Map<string, number>()
  const warnings: string[] = []

  const usable = paperSections.filter((s) => s.questions.length > 0)
  usable.forEach((section, si) => {
    const [from, to] = binding.sections[si].range
    let no = from
    let warned = false
    for (const q of section.questions) {
      for (const subId of recordSlotIds(q)) {
        if (no > to) {
          if (!warned) {
            warnings.push(`第 ${si + 1} 个分区的小题数超出题号区间 ${from}-${to}，多出来的没映射到卡上`)
            warned = true
          }
          continue
        }
        const slot: PaperSlot = { questionId: q.id, subId }
        slotByNo.set(no, slot)
        noBySlot.set(slotKey(q.id, subId), no)
        no += 1
      }
    }
  })

  return { slotByNo, noBySlot, warnings }
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
 * 卡上列号 → 应用里的选项下标。`answerColumns` 的逆运算。
 *
 * 在卡上直接点格子作答时必须走这里：Part B 的可选字母是 A、B、D、E、G，
 * 卡上的第 4 列（D）对应的是应用里第 3 个选项（下标 2），拿列号当下标会错位。
 * 点到了不可选的列（Part B 的 C、F）返回 null，调用方忽略即可。
 */
export function columnToAnswerIndex(column: number, section: EnglishPaperSection): number | null {
  const labels = section.optionLabels ?? ['A', 'B', 'C', 'D']
  const letter = String.fromCharCode(65 + column)
  const i = labels.indexOf(letter)
  return i >= 0 ? i : null
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
    for (const { subId, value } of slotEntries(answer)) {
      const no = numberMap.noBySlot.get(slotKey(questionId, subId))
      if (no == null) continue
      const section = sectionByNo(binding, no)
      if (!section || section.type !== 'single_choice') continue
      const cols = answerColumns(value, section)
      if (cols.length) out[no] = cols
    }
  }
  return out
}
