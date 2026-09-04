import { useMemo } from 'react'
import { PaperPreview, type PaperGrade } from './PaperPreview'
import { buildPaperSections } from '@/lib/exam-compose'
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
      m.set(q.id, {
        isCorrect: MANUAL_TYPES.has(q.question_type) ? null : answered ? (results.get(q.id) ?? false) : false,
        correctAnswer: q.correct_answer,
        explanation: q.answer_explanation ?? q.analysis,
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
