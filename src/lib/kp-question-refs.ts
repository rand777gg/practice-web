/**
 * 知识点解读的「相关真题」—— 解读 ↔ 题库里那道真题的那条边(纯逻辑这一半)。
 *
 * 「真题」在这套题库里不是独立实体, 而是**分类约定**: questions.category / categories 里形如
 * `2024年真题` 的那一条。所以"挂真题"就是挂一道具体的题, 而题本身已经在题库里, 这里只存关联
 * (见 Section 64)。读者在解读里展开就能看到题干、选项、答案与解析。
 *
 * 读写拆在 kp-question-refs-store.ts(和 kp-resource-refs 同一个分法), 这一半能被 Node 直接跑验证。
 */
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from './constants.ts'
import type { CorrectAnswer, QuestionType } from '@/types'

/** 「真题」的分类约定: 题库靠它把历年真题和普通练习题分开(全站所有筛选都认这一条) */
export const REAL_YEAR_RE = /^\d{4}年真题$/

/** 从题库里读出来的一道题, 只带解读要展示的那几列 */
export interface LinkedQuestion {
  id: string
  questionType: QuestionType
  questionText: string
  options: string[]
  correctAnswer: CorrectAnswer
  subject: string | null
  category: string | null
  categories: string[]
  analysis: string | null
  answerExplanation: string | null
}

/** 一条关联: 关联本身(备注/顺序) + 那道题; 题被删掉时 question 为 null(理论上外键会级联删掉整行) */
export interface KpQuestionLink {
  id: string
  note: string
  sortOrder: number
  question: LinkedQuestion | null
}

/** 编辑期的一条关联: 年份/题型/题干只是**本地展示用**, 不落库(题本身就是它的快照) */
export interface KpQuestionDraft {
  questionId: string
  note: string
  year: string | null
  type: QuestionType
  stem: string
}

/** 题目挂的年份真题标签。挂了好几年时取**最新**那一年 —— 那才是读者最该对着练的 */
export function realYearOf(q: Pick<LinkedQuestion, 'category' | 'categories'>): string | null {
  const cats = q.categories?.length ? q.categories : q.category ? [q.category] : []
  const years = cats.filter((c) => REAL_YEAR_RE.test(c)).sort().reverse()
  return years[0] ?? null
}

/** 分类清单里所有年份真题标签(倒序) —— 选择器的年份下拉用它 */
export function realYearsFrom(categories: string[]): string[] {
  return categories.filter((c) => REAL_YEAR_RE.test(c)).sort().reverse()
}

export function questionTypeLabel(type: QuestionType | string): string {
  return QUESTION_TYPE_LABELS[type as QuestionType] ?? String(type)
}

/** 列表里的一行题干: 压掉换行, 太长就截断 */
export function questionStem(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** 真题的年份徽章文案: 没有年份标签的题(比如普通练习题)返回 null */
export function yearBadge(q: Pick<LinkedQuestion, 'category' | 'categories'>): string | null {
  return realYearOf(q)
}

/**
 * 选择题里哪些选项是答案(用来给选项打对勾)。不是"选项即答案"的题型返回 null ——
 * 判断改错、填空、案例这些的答案不是一个下标, 硬套只会标错。
 */
export function correctOptionIndexes(q: Pick<LinkedQuestion, 'questionType' | 'correctAnswer'>): number[] | null {
  if (q.questionType === 'single_choice') {
    return typeof q.correctAnswer === 'number' ? [q.correctAnswer] : null
  }
  if (q.questionType === 'multi_select') {
    return Array.isArray(q.correctAnswer) ? (q.correctAnswer as number[]) : null
  }
  return null
}

/**
 * 正确答案的可读文本。判断题、填空、简答这些各写各的, 所以按**取值的形状**兜底而不是按题型
 * 穷举: 认不出来的形状宁可说"见解析", 也不要印一个 JSON 出来。
 */
export function answerText(q: Pick<LinkedQuestion, 'questionType' | 'options' | 'correctAnswer'>): string {
  const a = q.correctAnswer
  switch (q.questionType) {
    case 'single_choice':
      return typeof a === 'number'
        ? `${OPTION_LABELS[a] ?? a}${q.options[a] ? `. ${q.options[a]}` : ''}`
        : ''
    case 'multi_select': {
      const list = Array.isArray(a) ? (a as number[]) : []
      return list.map((i) => OPTION_LABELS[i] ?? String(i)).join('、')
    }
    case 'true_false':
      return typeof a === 'boolean' ? (a ? '正确' : '错误') : String(a ?? '')
    case 'judge_correct':
      // 判断改错: true = 判断正确; 字符串 = 判断错误并给出改正内容
      return typeof a === 'boolean' ? (a ? '正确' : '错误') : String(a ?? '')
    default:
      break
  }
  if (a === null || a === undefined) return ''
  if (Array.isArray(a)) return a.map((v) => String(v)).join('；')
  if (typeof a === 'object') return '见解析'
  return String(a)
}

/** 解析: 标准解析优先, 题解(AI 写的作答说明)兜底 —— 和练习页的取法一致 */
export function explanationOf(q: Pick<LinkedQuestion, 'analysis' | 'answerExplanation'>): string {
  return (q.analysis || q.answerExplanation || '').trim()
}

/** 题库里读出来的行 → LinkedQuestion */
export function questionFromRow(row: {
  id: string
  question_type: string
  question_text: string
  options: unknown
  correct_answer: unknown
  subject: string | null
  category: string | null
  categories: unknown
  analysis: string | null
  answer_explanation: string | null
}): LinkedQuestion {
  return {
    id: row.id,
    questionType: row.question_type as QuestionType,
    questionText: row.question_text,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctAnswer: row.correct_answer as CorrectAnswer,
    subject: row.subject,
    category: row.category,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    analysis: row.analysis,
    answerExplanation: row.answer_explanation,
  }
}
