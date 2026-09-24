/**
 * 一道题 → 小Q 的题干上下文。
 *
 * 为什么要在前端拼好再送进去: 模型看到的是一次纯文本请求, 而"当前这道题"在题库里是一行记录
 * (题型/选项/答案/解析分散在几列, 案例题还嵌着小题)。练习页手里正拿着这一行(和用户刚选的答案),
 * 由它转成一段话, 比让模型反过来调工具取题要可靠得多 —— 也让"解释这道题"这件事不花第二次检索。
 *
 * 用户答案一起带上: 答错了要的是"我为什么错", 只说题目答起来就是一份通用解析。
 */
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { answerText, type LinkedQuestion } from '@/lib/kp-question-refs'
import type { CorrectAnswer, Question, QuestionType } from '@/types'

export interface QuestionContext {
  stem: string
  /** 选项文案(非选择题是空数组) */
  options: string[]
  /** 可读的正确答案; 分析题这类没有答案的是空串 */
  answer: string
  /** 平台解析: 标准解析优先, 题解兜底 */
  explanation: string
  subject: string | null
  keyPoints: string | null
  typeLabel: string
  /** 用户刚选/填的答案, 还没作答就是空串 */
  userAnswer: string
}

/** 正确答案与用户答案共用同一套"取值的形状 → 可读文本"的翻译(见 kp-question-refs) */
function readable(type: QuestionType, options: string[], value: CorrectAnswer | null | undefined): string {
  if (value === null || value === undefined) return ''
  const shaped: Pick<LinkedQuestion, 'questionType' | 'options' | 'correctAnswer'> = {
    questionType: type,
    options,
    correctAnswer: value,
  }
  return answerText(shaped)
}

export function buildQuestionContext(
  question: Pick<Question, 'question_text' | 'options' | 'correct_answer' | 'question_type' | 'answer_explanation' | 'analysis' | 'subject' | 'key_points'>,
  userAnswer?: CorrectAnswer | null,
): QuestionContext {
  const options = Array.isArray(question.options) ? question.options : []
  const type = question.question_type
  return {
    stem: question.question_text.replace(/\s+/g, ' ').trim(),
    options: options.map((text, i) => `${OPTION_LABELS[i] ?? i + 1}. ${text}`),
    answer: readable(type, options, question.correct_answer),
    explanation: (question.analysis || question.answer_explanation || '').trim(),
    subject: question.subject ?? null,
    keyPoints: question.key_points ?? null,
    typeLabel: QUESTION_TYPE_LABELS[type] ?? String(type),
    userAnswer: readable(type, options, userAnswer),
  }
}

/** 上面的结构 → 注入 prompt 的那一段 */
export function questionContextSection(ctx: QuestionContext): string {
  return [
    '【当前题目】用户在练习模式里打开了这道题，问你它为什么这么答。',
    ctx.subject || ctx.keyPoints
      ? `出处：${[ctx.subject, ctx.keyPoints].filter(Boolean).join(' · ')}`
      : null,
    `题型：${ctx.typeLabel}`,
    `题干：${ctx.stem}`,
    ctx.options.length > 0 ? `选项：\n${ctx.options.join('\n')}` : null,
    `正确答案：${ctx.answer || '（本题没有标准答案，人工批改）'}`,
    ctx.userAnswer ? `用户这次选的是：${ctx.userAnswer}` : '用户还没有作答。',
    ctx.explanation ? `平台已有解析（可以引用、可以补充，但不要和它矛盾而不说明）：\n${ctx.explanation}` : null,
    '',
    '要求：',
    '1. 先直接讲这道题为什么选这个答案（把关键的判断依据说出来），再讲易错的地方；',
    '2. 用户答错了就针对他选的那个选项讲清"错在哪一步"，不要只重复正确答案；',
    '3. 需要引用平台资料时照常按编号标注；这题本身已经在上面了，不要再检索一遍题目。',
  ].filter(Boolean).join('\n')
}
