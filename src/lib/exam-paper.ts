/**
 * 卷面素材 → 真题卷面。
 *
 * 一条题目记录 = 卷面的一整道大题：完形整篇（20 空）、一篇 Text（5 问）、
 * Part B 排序（5 空）、翻译（5 句）、一篇写作。卷面素材（分区标题、Directions 原文、
 * 整篇正文、段落骨架、图表）挂在记录自带的 `paper` 字段上——卷面跟题目记录一起走，
 * 不再另开一张快照表：少一套数据通路，也不会出现「题库换了、快照没换」的错位。
 *
 * 小题挂在 `case_questions` 上，**小题 id 就是卷面题号**。答题卡是按题号涂格的，
 * 拿题号当小题 id，就不必再维护一层 id ↔ 题号对照表。
 *
 * 纯函数，无副作用。
 */
import { MULTI_ITEM_QUESTION_TYPES } from '@/lib/constants'
import type { CaseAnswer, CaseQuestion, CorrectAnswer, Question, QuestionType } from '@/types'
import type {
  ClozeBlock,
  EnglishPaperLayout,
  PartBBlock,
  PartCBlock,
  PaperSectionHead,
  ReadingText,
  WritingBlock,
  WritingChart,
} from '@/lib/english-paper-layout'

/** 题目记录自带的卷面素材 */
export interface QuestionPaper {
  /** 整卷标题（各分区记录上都带一份，渲染时取第一条） */
  paperTitle: string
  /** 'Section I' / 'Section II Part A' / … */
  ordinal: string
  /** 'Use of English' / 'Reading Comprehension' / 'Writing' */
  sectionTitle: string
  /** Directions 原文（英文，含分值） */
  directions: string
  /** 完形 / 阅读 / 翻译的整篇正文（完形挖空处是 [[n]]） */
  passage?: string
  /** 阅读的卷面标题（'Text 1'） */
  heading?: string
  /** 新题型的段落原文 */
  paragraphs?: { letter: string; text: string }[]
  /** 新题型卷面已给定的段落字母 */
  placed?: string[]
  /** 新题型顺序骨架：字母是已给定的，数字是待填的题号 */
  skeleton?: (string | number)[]
  /** 应用文的来信原文 */
  letterBox?: string
  /** 短文写作的图表素材 */
  charts?: WritingChart[]
  chartCaption?: string
}

/**
 * 卷面题型每条记录含多少小题。
 *
 * 考场卷面是固定的（完形 20 空、阅读每篇 5 问、新题型 5 空、翻译 5 句、写作 1 篇），
 * 模板还没组卷时要拿它算「总题数 / 总分」，只能靠这张表；
 * 组卷之后一律以记录里的小题数为准（`case_questions.length`）。
 */
export const PAPER_ITEMS_PER_RECORD: Partial<Record<QuestionType, number>> = {
  cloze: 20,
  reading_set: 5,
  sentence_order: 5,
  translation: 5,
  writing: 1,
}

export function paperItemsPerRecord(type: QuestionType | null): number {
  return (type ? PAPER_ITEMS_PER_RECORD[type] : undefined) ?? 1
}

/** 卷面素材里的小题：多小题题型取 `case_questions`，单条记录（写作）没有 */
export function paperSubs(q: Question): CaseQuestion[] {
  return q.case_questions ?? []
}

/** 卷面记录的小题数（答题卡按它切题号） */
export function paperItemCount(q: Pick<Question, 'case_questions'>): number {
  return Math.max(1, q.case_questions?.length ?? 0)
}

/** 卷面上的一格：一条记录 + 一个小题 */
export interface PaperSlot {
  questionId: string
  subId: string
}

/** 单条记录的题型（写作）没有小题，槽位的小题 id 用空串 */
export const RECORD_SUB_ID = ''

export function slotKey(questionId: string, subId: string): string {
  return subId ? `${questionId}#${subId}` : questionId
}

/** 一条记录占卷面几格：多小题题型按小题展开，其余占一格 */
export function recordSlotIds(q: Pick<Question, 'question_type' | 'case_questions'>): string[] {
  const subs = MULTI_ITEM_QUESTION_TYPES.includes(q.question_type as typeof MULTI_ITEM_QUESTION_TYPES[number])
    ? q.case_questions ?? []
    : []
  return subs.length ? subs.map((s) => s.id) : [RECORD_SUB_ID]
}

/** 作答 → 槽位取值：多小题题型按小题拆开，单条记录用空 subId */
export function slotEntries(answer: CorrectAnswer | null | undefined): { subId: string; value: CorrectAnswer }[] {
  if (answer == null) return []
  if (typeof answer === 'object' && !Array.isArray(answer) && 'subs' in (answer as object)) {
    return ((answer as CaseAnswer).subs ?? []).map((s) => ({ subId: s.id, value: s.value }))
  }
  return [{ subId: RECORD_SUB_ID, value: answer }]
}

/** 取某个槽的作答值；形状对不上返回 null */
export function slotValue(answer: CorrectAnswer | null | undefined, subId: string): CorrectAnswer | null {
  if (answer == null) return null
  const grouped = typeof answer === 'object' && !Array.isArray(answer) && 'subs' in (answer as object)
  if (subId === RECORD_SUB_ID) return grouped ? null : answer
  if (!grouped) return null
  return (answer as CaseAnswer).subs?.find((s) => s.id === subId)?.value ?? null
}

/** 写回某个槽：多小题题型合并进 `{ subs }`（只动这一格），其余整条替换 */
export function withSlotValue(
  prev: CorrectAnswer | null | undefined,
  subId: string,
  value: CorrectAnswer,
): CorrectAnswer {
  if (subId === RECORD_SUB_ID) return value
  const grouped = prev != null && typeof prev === 'object' && !Array.isArray(prev) && 'subs' in (prev as object)
  const subs = grouped ? (prev as CaseAnswer).subs ?? [] : []
  return { subs: [...subs.filter((s) => s.id !== subId), { id: subId, value }] } as CaseAnswer
}

/** 完形正文里的挖空标记 → 卡片模式能直接读的正文 */
export function paperProse(passage: string): string {
  return passage.replace(/\[\[(\d+)\]\]/g, ' ___ ')
}

const bySeq = (a: Question, b: Question) => (a.seq_number ?? 0) - (b.seq_number ?? 0)

const head = (p: QuestionPaper): PaperSectionHead => ({
  ordinal: p.ordinal,
  title: p.sectionTitle,
  directions: p.directions,
})

const questionNo = (sub: CaseQuestion, fallback: number): number => {
  const n = Number(sub.id)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 一组题目记录 → 卷面。卷面题型一条都没有时返回 null（就是一份普通试卷，走通用渲染）。
 */
export function buildPaperLayout(questions: Question[]): EnglishPaperLayout | null {
  const papers = questions.filter((q) => q.paper)
  if (papers.length === 0) return null

  const clozeQ = papers.find((q) => q.question_type === 'cloze')
  const readingQs = papers.filter((q) => q.question_type === 'reading_set').sort(bySeq)
  const orderQ = papers.find((q) => q.question_type === 'sentence_order')
  const transQ = papers.find((q) => q.question_type === 'translation')
  const writingQs = papers.filter((q) => q.question_type === 'writing').sort(bySeq)

  if (!clozeQ && readingQs.length === 0 && !orderQ && !transQ && writingQs.length === 0) return null

  const cloze: ClozeBlock | null = clozeQ
    ? {
        ...head(clozeQ.paper!),
        passage: clozeQ.paper!.passage ?? '',
        blanks: paperSubs(clozeQ).map((s, i) => ({ no: questionNo(s, i + 1), options: s.options })),
      }
    : null

  const reading = readingQs.length
    ? {
        head: head(readingQs[0].paper!),
        texts: readingQs.map((q, i): ReadingText => ({
          no: i + 1,
          heading: q.paper!.heading ?? `Text ${i + 1}`,
          passage: q.paper!.passage ?? '',
          questions: paperSubs(q).map((s, si) => ({
            no: questionNo(s, si + 1),
            stem: s.text,
            options: s.options,
          })),
        })),
      }
    : null

  const partB: PartBBlock | null = orderQ
    ? {
        ...head(orderQ.paper!),
        paragraphs: orderQ.paper!.paragraphs ?? [],
        placed: orderQ.paper!.placed ?? [],
        skeleton: orderQ.paper!.skeleton ?? [],
        questions: paperSubs(orderQ).map((s, i) => ({ no: questionNo(s, i + 1), options: s.options })),
      }
    : null

  const partC: PartCBlock | null = transQ
    ? {
        ...head(transQ.paper!),
        passage: transQ.paper!.passage ?? '',
        segments: paperSubs(transQ).map((s, i) => ({ no: questionNo(s, i + 1), sentence: s.text })),
      }
    : null

  const writingBlock = (q: Question | undefined): WritingBlock | null => (q?.paper
    ? {
        ...head(q.paper),
        letterBox: q.paper.letterBox,
        charts: q.paper.charts,
        chartCaption: q.paper.chartCaption,
      }
    : null)

  return {
    title: papers[0].paper!.paperTitle,
    sections: {
      cloze,
      reading,
      partB,
      partC,
      writingA: writingBlock(writingQs[0]),
      writingB: writingBlock(writingQs[1]),
    },
    warnings: [],
  }
}
