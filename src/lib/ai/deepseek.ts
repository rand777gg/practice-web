import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AiConfig, AiParseResult, ParsedQuestion } from './types'
import { getAiConfig as getConfig } from './config'

const questionSchema = z.object({
  question_type: z.enum(['single_choice','multi_select','true_false','fill_blank','short_answer','analysis']),
  question_text: z.string(),
  options: z.array(z.string()),
  correct_answer: z.union([z.number(), z.array(z.number()), z.boolean(), z.string(), z.array(z.string()), z.null()]),
  analysis: z.string().optional(),
  key_points: z.string().optional(),
  answer_explanation: z.string().optional(),
})

const resultSchema = z.object({
  questions: z.array(questionSchema),
})

const SYSTEM_PROMPT = `You are a test question extraction assistant. Given a document in markdown format, extract ALL questions found in the document.

Rules for each question type:
- single_choice: correct_answer is an integer (0-based index). options must have ≥2 items.
- multi_select: correct_answer is an array of integers. options must have ≥2 items.
- true_false: correct_answer is boolean. options=["正确","错误"] or ["True","False"].
- fill_blank: correct_answer is a string. options is empty array []. In the question_text, mark the blank position with ____ (double underscores).
- short_answer: correct_answer is a string or string[]. options is empty array [].
- analysis: correct_answer is null. options is empty array [].

Output every question you find in the document verbatim. Do not reword or reorder.`

export class DeepSeekParser {
  private client: ReturnType<typeof createDeepSeek>
  private model: ReturnType<ReturnType<typeof createDeepSeek>>

  constructor(config: AiConfig) {
    this.client = createDeepSeek({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
    this.model = this.client(config.model || 'deepseek-chat')
  }

  async parseDocument(markdown: string): Promise<AiParseResult> {
    const { object } = await generateObject({
      model: this.model,
      schema: resultSchema,
      system: SYSTEM_PROMPT,
      prompt: `Extract all questions from this document:\n\n${markdown}`,
      temperature: 0.1,
    })

    return { questions: this.normalize(object.questions) }
  }

  async generateKeyPoints(context: {
    questionText: string
    questionType: string
    options?: string[]
    correctAnswer?: string
    analysis?: string
    answerExplanation?: string
  }): Promise<string> {
    const parts: string[] = [`题目类型：${context.questionType}`, `题干：${context.questionText}`]
    if (context.options?.length) parts.push(`选项：${context.options.join(' | ')}`)
    if (context.correctAnswer) parts.push(`正确答案：${context.correctAnswer}`)
    if (context.analysis) parts.push(`解析：${context.analysis}`)
    if (context.answerExplanation) parts.push(`答案解析：${context.answerExplanation}`)

    const { text } = await generateText({
      model: this.model,
      system: '你是一个题目知识点的提炼助手。根据题干、答案、解析，提取3-5个核心知识点。用逗号分隔，每项简短（不超过10个字）。只输出知识点，不要其他内容。',
      prompt: parts.join('\n'),
      temperature: 0.2,
    })

    return text.trim()
  }

  async suggestExam(stats: {
    totalPractice: number
    wrongBySubject: { subject: string; wrong: number; total: number }[]
    wrongByCategory: { category: string; wrong: number }[]
    wrongByType: { type: string; wrong: number }[]
    availableSubjects: string[]
    availableCategories: string[]
    availableTypes: string[]
  }): Promise<{
    subjects: string[]
    categories: string[]
    types: string[]
    questionCount: number
    durationMin: number
    reason: string
  }> {
    const wrongSummary = stats.wrongBySubject
      .filter(s => s.wrong > 0)
      .map(s => `${s.subject}（错${s.wrong}/${s.total}）`)
      .join('，') || '无显著弱项'
    const wrongCats = stats.wrongByCategory
      .filter(c => c.wrong > 0)
      .map(c => `${c.category}（错${c.wrong}）`)
      .join('，') || '无'
    const wrongTypes = stats.wrongByType
      .filter(t => t.wrong > 0)
      .map(t => `${t.type}（错${t.wrong}）`)
      .join('，') || '无'

    const prompt = [
      `总练习量：${stats.totalPractice} 题`,
      `各学科错误：${wrongSummary}`,
      `各分类错误：${wrongCats}`,
      `各题型错误：${wrongTypes}`,
      `可选学科：${stats.availableSubjects.join('、') || '全部'}`,
      `可选分类：${stats.availableCategories.join('、') || '全部'}`,
      `可选题型：${stats.availableTypes.join('、') || '全部'}`,
    ].join('\n')

    const { object } = await generateObject({
      model: this.model,
      schema: z.object({
        subjects: z.array(z.string()),
        categories: z.array(z.string()),
        types: z.array(z.string()),
        questionCount: z.number().min(5).max(100),
        durationMin: z.number().min(5).max(300),
        reason: z.string(),
      }),
      system: `你是一个智能出题助手。根据用户的练习数据分析弱项，推荐考试配置。
- subjects/categories/types 从可选列表中选，优先选择错误率高的
- 如果某类错误为0或数据不足，选2-3个有代表性的
- questionCount 建议 10-50 题，弱项多则多出
- durationMin 建议 10-60 分钟，平均每题 1-2 分钟
- reason 用简短中文解释推荐理由，50字以内`,
      prompt,
      temperature: 0.3,
    })

    return object
  }

  private normalize(raw: z.infer<typeof resultSchema>['questions']): ParsedQuestion[] {
    return raw
      .filter(q => q.question_text.trim().length > 0)
      .map(q => {
        let { question_type, correct_answer, options } = q

        // Auto-fix type mismatches
        if (question_type === 'single_choice' && Array.isArray(correct_answer)) {
          correct_answer = correct_answer[0] ?? 0
        }
        if (question_type === 'multi_select' && typeof correct_answer === 'number') {
          correct_answer = [correct_answer]
        }
        if (question_type === 'true_false') {
          options = ['正确', '错误']
          correct_answer = Boolean(correct_answer)
        }
        if (['fill_blank','short_answer','analysis'].includes(question_type)) {
          options = []
        }
        if (question_type === 'analysis') {
          correct_answer = null
        }
        if (options.length < 2 && ['single_choice','multi_select'].includes(question_type)) {
          question_type = 'short_answer'
          options = []
        }

        return {
          question_type,
          question_text: q.question_text.trim(),
          options,
          correct_answer,
          analysis: q.analysis?.trim() || undefined,
          key_points: q.key_points?.trim() || undefined,
          answer_explanation: q.answer_explanation?.trim() || undefined,
        }
      })
  }
}

export async function generateKeyPoints(context: {
  questionText: string
  questionType: string
  options?: string[]
  correctAnswer?: string
  analysis?: string
  answerExplanation?: string
}): Promise<string> {
  const parser = new DeepSeekParser(getConfig())
  return parser.generateKeyPoints(context)
}

export async function suggestExamConfig(stats: {
  totalPractice: number
  wrongBySubject: { subject: string; wrong: number; total: number }[]
  wrongByCategory: { category: string; wrong: number }[]
  wrongByType: { type: string; wrong: number }[]
  availableSubjects: string[]
  availableCategories: string[]
  availableTypes: string[]
}): Promise<{
  subjects: string[]
  categories: string[]
  types: string[]
  questionCount: number
  durationMin: number
  reason: string
}> {
  const parser = new DeepSeekParser(getConfig())
  return parser.suggestExam(stats)
}
