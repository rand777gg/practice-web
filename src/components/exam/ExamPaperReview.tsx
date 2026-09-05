import { useMemo } from 'react'
import { PaperPreview, type PaperGrade } from './PaperPreview'
import { buildPaperSections } from '@/lib/exam-compose'
import { caseSubResults } from '@/lib/answer-utils'
import type { CorrectAnswer, ExamTemplate, Question } from '@/types'

interface Props {
  title: string
  meta?: string
  /** 卷面顺序的题目(调用方按 session.question_ids 排好, 含未作答题) */
  questions: Question[]
  /** 学生作答, key = question_id; 缺省即未作答 */
  answers: Map<string, CorrectAnswer>
  /** 判题结果, key = question_id */
  results: Map<string, boolean>
  template?: ExamTemplate | null
  /** sheet: 单栏 A4; spread: 多栏摊开 */
  layout?: 'sheet' | 'spread'
}

const MANUAL_TYPES = new Set(['analysis'])

/** 已提交的考试卷: 卷面上直接标出对错、你的答案、正确答案与解析 */
export function ExamPaperReview({
  title,
  meta,
  questions,
  answers,
  results,
  template,
  layout = 'spread',
}: Props) {
  const sections = useMemo(
    () => buildPaperSections(questions, template ?? null),
    [questions, template],
  )

  const grading = useMemo(() => {
    const m = new Map<string, PaperGrade>()
    for (const q of questions) {
      const answered = answers.has(q.id)
      let isCorrect: boolean | null = MANUAL_TYPES.has(q.question_type)
        ? null
        : answered
          ? (results.get(q.id) ?? false)
          : false
      // 案例分析题统一按「小题口径」判分: partial 携带答对/总小题数, 整题是否全对由其推导
      let partial: PaperGrade['partial'] = null
      if (q.question_type === 'case_analysis') {
        const subRes = caseSubResults(q.case_questions ?? [], answers.get(q.id))
        if (subRes && subRes.length > 0) {
          const correct = subRes.filter((r) => r.correct).length
          partial = { correct, total: subRes.length }
          isCorrect = correct === subRes.length
        }
      }
      m.set(q.id, {
        isCorrect,
        // 案例分析题的"正确答案"以逐小题答案的复合结构给出, 便于卷面逐小题展示
        correctAnswer: q.question_type === 'case_analysis'
          ? { subs: (q.case_questions ?? []).map((sub) => ({ id: sub.id, value: sub.answer })) } as CorrectAnswer
          : q.correct_answer,
        explanation: q.answer_explanation ?? q.analysis,
        partial,
      })
    }
    return m
  }, [questions, answers, results])

  return (
    <PaperPreview
      title={title}
      meta={meta}
      sections={sections}
      answers={answers}
      readOnly
      grading={grading}
      layout={layout}
      cover={template?.cover ?? null}
      paperLayout={template?.layout ?? null}
    />
  )
}
