/**
 * 试卷导出排版模型(paper.ts)
 * 把「由真实题库组出来的卷面分区 PaperSection[]」连同模板元信息,
 * 归一化成一份统一的 PaperDoc —— 编号、分区分值、题型/选项/填空/案例小问、
 * 主观题作答留白区全部在这里算好。
 * HTML / DOCX / 打印 三种导出共用同一份 PaperDoc, 保证「排版不乱」且各端一致。
 */

import type { CaseQuestion, QuestionType, ExamTemplate } from '@/types'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { PaperSection } from '@/lib/exam-compose'
import { mdToHtml } from './md'

export interface RenderedCaseSub {
  number: string // "(1)"
  type: QuestionType
  scoreText: string // "" 或 "5分"
  md: string // 原始题干 markdown
  body: string // HTML 题干
  options: { key: string; text: string }[] // 选择题才有
}

export interface RenderedQuestion {
  number: number // 全卷连续题号
  type: QuestionType
  typeLabel: string
  scoreText: string // "（本题10分）" 或 ""
  subject: string | null
  md: string // 原始题干 markdown(DOCX 端排版用)
  body: string // 题干 HTML(HTML 端排版用)
  options: { key: string; text: string }[] // 客观题选项
  /** 填空/判断改错等题干内自含空位时标注所需作答空行数 */
  answerLines: number
  blankLabel: string // 填空/简答等提示文字(导出时显示)
  caseSubs: RenderedCaseSub[]
  isCase: boolean
}

export interface RenderedSection {
  /** 分区序号文字: 一、二、… */
  orderText: string
  name: string // "单项选择题（每题2分，共10题）"
  questions: RenderedQuestion[]
}

export interface PaperDoc {
  title: string
  /** 顶部元信息行, 已 join 好分隔 */
  meta: string[]
  sectionIntro: string // 答题须知类简短说明
  sections: RenderedSection[]
  questionTotal: number
  /** 总分(模板约定分值 × 题目数) */
  scoreTotal: number
  durationMin: number
  subject: string | null
}

const ORDER_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/** 需要手动书写作答留白的题型 */
const WRITTEN_TYPES: Partial<Record<QuestionType, { lines: number; blank: string }>> = {
  short_answer: { lines: 6, blank: '' },
  analysis: { lines: 8, blank: '' },
  judge_correct: { lines: 3, blank: '' },
  fill_blank: { lines: 0, blank: '' },
}

export interface PaperMeta {
  template?: ExamTemplate | null
  durationMin: number
  subjectLabel: string | null
}

/** 汇总每题分值(分区约定)与题型标签 */
function scoreFor(template: ExamTemplate | null | undefined, type: QuestionType): number {
  if (!template) return 0
  for (const s of template.sections) if (s.type === type && s.score) return s.score
  return 0
}

/** 构建一份导出的卷子文档(questions 需已按全卷顺序排列); includeScores=false 时不带任何分值(隐藏打分框/分值) */
export function buildPaperDoc(
  sections: PaperSection[],
  meta: PaperMeta,
  opts?: { includeScores?: boolean },
): PaperDoc {
  const includeScores = opts?.includeScores !== false
  const template = meta.template
  let globalNo = 0
  const outSections: RenderedSection[] = []

  sections.forEach((sec, idx) => {
    const orderText = ORDER_CN[idx] ?? String(idx + 1)
    const per = sec.scorePerQuestion
    const secQs = sec.questions.filter((q) => q && q.id)
    const typeOf = secQs[0]?.question_type
    const count = secQs.length
    let name = sec.name || (typeOf ? QUESTION_TYPE_LABELS[typeOf] ?? '' : '')
    if (count > 0) {
      name = includeScores && per > 0
        ? `${name}（每题${formatNum(per)}分，共${count}题）`
        : `${name}（共${count}题）`
    }

    const rendered: RenderedQuestion[] = secQs.map((q) => {
      globalNo += 1
      const num = globalNo
      const type = q.question_type
      const qScore = per || scoreFor(template, type)
      const written = WRITTEN_TYPES[type]
      const options = type === 'single_choice' || type === 'multi_select'
        ? q.options.map((text, oi) => ({ key: String.fromCharCode(65 + oi), text }))
        : []
      let caseSubs: RenderedCaseSub[] = []
      let isCase = false
      if (type === 'case_analysis' && Array.isArray(q.case_questions)) {
        isCase = true
        const perSub = qScore && q.case_questions.length > 0 ? qScore / q.case_questions.length : 0
        caseSubs = q.case_questions.map((sub, si) => renderCaseSub(sub, si, includeScores ? perSub : 0))
      }
      return {
        number: num,
        type,
        typeLabel: QUESTION_TYPE_LABELS[type] ?? '',
        scoreText: includeScores && !isCase && qScore > 0 ? `（本题${formatNum(qScore)}分）` : '',
        subject: q.subject,
        md: q.question_text,
        body: mdToHtml(q.question_text),
        options,
        answerLines: isCase ? 0 : (written?.lines ?? 0),
        blankLabel: !isCase && type === 'fill_blank' ? '请在划线处作答' : (written?.blank ?? ''),
        caseSubs,
        isCase,
      }
    })
    outSections.push({ orderText, name, questions: rendered })
  })

  const questionTotal = outSections.reduce((a, s) => a + s.questions.length, 0)
  const scoreTotal = includeScores && template ? sectionScoreTotal(template) : 0
  const metaLines: string[] = []
  if (meta.subjectLabel) metaLines.push(meta.subjectLabel)
  if (meta.durationMin > 0) metaLines.push(`考试时间：${meta.durationMin} 分钟`)
  if (includeScores && scoreTotal > 0) metaLines.push(`满分：${formatNum(scoreTotal)} 分`)
  if (questionTotal > 0) metaLines.push(`共 ${questionTotal} 题`)

  const title = (() => {
    const c = template?.cover
    if (c?.title?.trim()) return c.title.trim()
    if (c?.examName?.trim()) return c.examName.trim()
    return template?.name?.trim() || '试卷'
  })()

  return {
    title,
    meta: metaLines,
    sectionIntro:
      '请在各题的指定作答区作答，超出答题区域的答案不予计分。',
    sections: outSections,
    questionTotal,
    scoreTotal,
    durationMin: meta.durationMin,
    subject: meta.subjectLabel,
  }
}

function renderCaseSub(sub: CaseQuestion, idx: number, perSub: number): RenderedCaseSub {
  const type = sub.type
  const options =
    type === 'single_choice' || type === 'multi_select'
      ? sub.options.map((text, oi) => ({ key: String.fromCharCode(65 + oi), text }))
      : []
  const scoreText = perSub > 0 ? `${formatNum(perSub)}分` : ''
  return { number: `(${idx + 1})`, type, scoreText, md: sub.text, body: mdToHtml(sub.text), options }
}

/** 依模板分区统计卷面约定总分(分区 count × 每题分) */
function sectionScoreTotal(template: ExamTemplate | null | undefined): number {
  if (!template?.sections?.length) return 0
  return template.sections.reduce((acc, s) => {
    const c = Math.max(0, s.count ?? 0)
    const sc = Math.max(0, s.score ?? 0)
    return acc + c * sc
  }, 0)
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
