import { streamText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAiConfig } from './config'
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { Question, CorrectAnswer } from '@/types'

// Human-readable rendering of an answer for the prompt
function describeAnswer(q: Question, ans: CorrectAnswer | null | undefined): string {
  if (ans === null || ans === undefined || ans === '') return '（未作答）'
  switch (q.question_type) {
    case 'single_choice':
      return typeof ans === 'number' ? `${OPTION_LABELS[ans]}. ${q.options[ans] ?? ''}` : String(ans)
    case 'multi_select':
      return Array.isArray(ans) ? (ans as number[]).map((i) => `${OPTION_LABELS[i]}. ${q.options[i] ?? ''}`).join('；') : String(ans)
    case 'true_false':
      return ans === true ? '正确' : '错误'
    case 'judge_correct':
      return ans === true ? '正确' : `错误（修正：${String(ans)}）`
    default:
      return Array.isArray(ans) ? (ans as string[]).join('；') : String(ans)
  }
}

const SYSTEM_PROMPT = `你是一位循循善诱的学科老师。请针对下面这道题给学生做讲解，用简体中文、Markdown 格式输出。

要求：
- 先点明正确答案及其核心理由
- 若提供了学生的作答且答错，指出他错在哪、为什么错、正确的思路是什么
- 讲清涉及的关键知识点或原理，必要时举一反三
- 结尾给一个简短的易错提示或记忆要点
- 简洁清晰，避免空话套话；可用列表、加粗突出重点
- 若题目本身或已有解析存在明显错误，请直接指出`

/**
 * Stream an AI explanation for a question. onDelta receives the full accumulated
 * text on each chunk (so the UI can render progressively). Returns the final text.
 * Throws Error('AI_NOT_CONFIGURED') when no API key is set.
 */
export async function streamQuestionExplanation(
  question: Question,
  opts: { userAnswer?: CorrectAnswer | null; isCorrect?: boolean },
  onDelta: (full: string) => void,
): Promise<string> {
  const config = getAiConfig()
  if (!config.apiKey) throw new Error('AI_NOT_CONFIGURED')

  const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
  const model = client(config.model || 'deepseek-chat')

  const isChoice = question.question_type === 'single_choice' || question.question_type === 'multi_select'
  const lines: string[] = [
    `题型：${QUESTION_TYPE_LABELS[question.question_type]}`,
    question.subject ? `学科：${question.subject}` : '',
    `题目：${question.question_text}`,
  ]
  if (isChoice && question.options.length) {
    lines.push('选项：')
    question.options.forEach((o, i) => lines.push(`${OPTION_LABELS[i]}. ${o}`))
  }
  lines.push(`正确答案：${describeAnswer(question, question.correct_answer)}`)
  if (question.key_points) lines.push(`知识点：${question.key_points}`)
  if (question.answer_explanation) lines.push(`已有解析（仅供参考，可能不完整或有误）：${question.answer_explanation}`)
  if (question.analysis) lines.push(`已有分析（仅供参考）：${question.analysis}`)
  if (opts.userAnswer !== undefined) {
    lines.push(`学生的作答：${describeAnswer(question, opts.userAnswer)}`)
    lines.push(`学生${opts.isCorrect ? '答对了' : '答错了'}`)
  }

  const { textStream } = streamText({
    model,
    system: SYSTEM_PROMPT,
    prompt: lines.filter(Boolean).join('\n'),
    temperature: 0.5,
    maxOutputTokens: 900,
  })

  let full = ''
  for await (const delta of textStream) {
    full += delta
    onDelta(full)
  }
  return full.trim()
}
