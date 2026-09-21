import { OPTION_LABELS } from '@/lib/constants'
import { markdownToSpeech, splitForSpeech } from './speech'
import type { CorrectAnswer, Question, QuestionType } from '@/types'

/** 答案转成人话 —— 选项下标得换成"A、xxx"，纯数字读出来没有意义 */
function answerToSpeech(answer: CorrectAnswer, type: QuestionType, options: string[]): string {
  if (answer === null || answer === undefined) return ''

  if (type === 'true_false' && typeof answer === 'boolean') return answer ? '正确' : '错误'

  if (typeof answer === 'number' && options[answer] !== undefined) {
    return `${OPTION_LABELS[answer]}、${markdownToSpeech(options[answer])}`
  }

  if (Array.isArray(answer)) {
    const picked = (answer as number[])
      .filter((i) => typeof i === 'number' && options[i] !== undefined)
      .map((i) => `${OPTION_LABELS[i]}、${markdownToSpeech(options[i])}`)
    if (picked.length > 0) return picked.join('；')
    return (answer as string[]).filter((s) => typeof s === 'string' && s.trim()).map(markdownToSpeech).join('；')
  }

  if (typeof answer === 'string') return markdownToSpeech(answer)

  // 编程题的答案是代码，案例分析题的答案是小题容器 —— 都不读，交给解析
  return ''
}

/**
 * 一道题的朗读稿。分成两段是为了"先问后答"：读完 prompt 停下来等用户回想，
 * 用户点头了再读 answer。所以答案绝不能混进 prompt。
 */
export function questionSpeech(q: Question, note?: string | null): { prompt: string[]; answer: string[] } {
  const prompt: string[] = []
  const answer: string[] = []

  prompt.push(...splitForSpeech(markdownToSpeech(q.question_text)))

  const options = q.options ?? []
  if (options.length > 0) {
    const listed = options
      .map((o, i) => (o.trim() ? `${OPTION_LABELS[i]}、${markdownToSpeech(o)}` : ''))
      .filter(Boolean)
      .join('；')
    if (listed) prompt.push(...splitForSpeech(listed))
  }

  for (const sub of q.case_questions ?? []) {
    prompt.push(...splitForSpeech(markdownToSpeech(sub.text)))
    const subOptions = sub.options ?? []
    if (subOptions.length > 0) {
      const listed = subOptions.map((o, i) => `${OPTION_LABELS[i]}、${markdownToSpeech(o)}`).join('；')
      prompt.push(...splitForSpeech(listed))
    }
    const subAnswer = answerToSpeech(sub.answer, sub.type, subOptions)
    if (subAnswer) answer.push(...splitForSpeech(subAnswer))
  }

  const mainAnswer = answerToSpeech(q.correct_answer, q.question_type, options)
  if (mainAnswer) answer.push(...splitForSpeech(mainAnswer))

  if (q.analysis) answer.push(...splitForSpeech(markdownToSpeech(q.analysis)))
  if (q.answer_explanation) answer.push(...splitForSpeech(markdownToSpeech(q.answer_explanation)))
  if (note) answer.push(...splitForSpeech(markdownToSpeech(note)))

  return { prompt, answer }
}
