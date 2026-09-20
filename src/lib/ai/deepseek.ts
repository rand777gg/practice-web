import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AiConfig, AiParseResult, ParsedQuestion } from './types'
import { getAiConfig as getConfig } from './config'
import { getPrompt } from '@/stores/prompt-store'

const questionSchema = z.object({
  question_type: z.enum(['single_choice','multi_select','true_false','fill_blank','short_answer','analysis','judge_correct']),
  question_text: z.string(),
  options: z.array(z.any()).transform(arr => arr.map(String)),
  correct_answer: z.any(),
  analysis: z.string().optional().nullable(),
  answer_explanation: z.string().optional().nullable(),
  // 这两个原先不在 schema 里, 于是被 zod 直接剥掉 —— 结果 AI 生成的题 key_points 永远是空,
  // 而平台的知识点进度统计正是按 key_points 算的, 那批题一道都不进统计。
  key_points: z.string().optional().nullable(),
  source_page: z.string().optional().nullable(),
})

const resultSchema = z.object({
  questions: z.array(questionSchema),
}).passthrough()

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

  async parseDocument(markdown: string, systemPrompt?: string): Promise<AiParseResult> {
    const paragraphs = markdown.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)

    // DeepSeek 单次输出上限约 8K token，输出 JSON 通常比输入长 1.3~1.5 倍。
    // 按段落数 + 字符数双重约束切块，保证每块题目数不会撑爆输出上限。
    const MAX_PARAGRAPHS = 20
    const MAX_CHARS = 6000
    const chunks: string[] = []
    let current: string[] = []
    let currentChars = 0

    for (const p of paragraphs) {
      const overflow =
        current.length > 0 &&
        (current.length + 1 > MAX_PARAGRAPHS || currentChars + p.length > MAX_CHARS)
      if (overflow) {
        chunks.push(current.join('\n\n'))
        current = []
        currentChars = 0
      }
      current.push(p)
      currentChars += p.length
    }
    if (current.length) chunks.push(current.join('\n\n'))

    const allQuestions: ParsedQuestion[] = []
    const totalChunks = chunks.length
    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i]
      const chunkLabel = totalChunks > 1 ? ` (Part ${i + 1}/${totalChunks})` : ''
      const { object } = await generateObject({
        model: this.model,
        schema: resultSchema,
        system: systemPrompt || getPrompt('extract'),
        prompt: `Extract all questions from this document${chunkLabel}:\n\n${chunk}`,
        temperature: 0.1,
        maxOutputTokens: 8000,
      })
      allQuestions.push(...this.normalize(object.questions))
    }

    return { questions: allQuestions }
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
      system: getPrompt('key_points'),
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
      system: getPrompt('suggest_exam'),
      prompt,
      temperature: 0.3,
    })

    return object
  }

  async generateQuestions(params: {
    subject: string
    questionTypes: string[]
    count: number
    topicDescription?: string
  }, systemPrompt?: string): Promise<AiParseResult> {
    const typeList = params.questionTypes.join('、')
    const topicHint = params.topicDescription ? `\n内容/知识点范围：${params.topicDescription}` : ''

    const prompt = `请根据以下参数生成 ${params.count} 道原创练习题：

学科：${params.subject}
题型：${typeList}${topicHint}

要求：
- 题目要有教育意义，考察对学科知识的理解
- 每题附带详细的解析（analysis），解释正确答案
- 单选题和多选题至少4个选项
- 判断题选项为["正确", "错误"]
- 判断改错题的题干是一段陈述，correct_answer 为 true（正确）或字符串（修正后的正确表述）
- 填空题用 ___ 标记空缺
- 题目难度适中，避免过于简单或偏门`

    const { object } = await generateObject({
      model: this.model,
      schema: resultSchema,
      system: systemPrompt || getPrompt('generate_questions'),
      prompt,
      temperature: 0.7,
    })

    return { questions: this.normalize(object.questions).slice(0, params.count) }
  }

  async generateFromText(params: {
    documentText: string
    subject?: string
    questionTypes?: string[]
    count?: number
  }, systemPrompt?: string): Promise<AiParseResult> {
    const typeHint = params.questionTypes?.length ? `\n题型要求：${params.questionTypes.join('、')}` : ''
    const subjectHint = params.subject ? `\n学科：${params.subject}` : ''
    const countHint = params.count ? `\n请生成 ${params.count} 道题目。` : '\n请生成至少5道题目。'

    const prompt = `请根据以下学习材料，识别核心知识点，以考官视角出题。${subjectHint}${typeHint}${countHint}\n\n材料内容：\n\n${params.documentText}`

    const { object } = await generateObject({
      model: this.model,
      schema: resultSchema,
      system: systemPrompt || getPrompt('generate_doc'),
      prompt,
      temperature: 0.7,
    })

    const questions = this.normalize(object.questions)
    return { questions: params.count ? questions.slice(0, params.count) : questions }
  }

  async generateFromDocument(markdown: string, systemPrompt?: string): Promise<AiParseResult> {
    return this.parseDocument(markdown, systemPrompt || getPrompt('generate_doc'))
  }

  async suggestPlan(data: {
    totalReviewQueue: number
    topUrgent: { subject: string; urgency: number; reviewQueue: number; errorRate: number }[]
    atRiskCurve: { day: number; atRisk: number }[]
    totalSubjects: number
  }): Promise<string> {
    const urgentSummary = data.topUrgent
      .slice(0, 5)
      .map(s => `${s.subject}（紧急度${s.urgency}，待复习${s.reviewQueue}题，错误率${Math.round(s.errorRate * 100)}%）`)
      .join('\n')
    const curveSummary = data.atRiskCurve
      .filter(p => p.atRisk > 0)
      .map(p => `第${p.day}天: ${p.atRisk}题进入遗忘临界`)
      .join('\n')

    const { text } = await generateText({
      model: this.model,
      system: getPrompt('review_advice'),
      prompt: `待复习总题数：${data.totalReviewQueue}\n学科总数：${data.totalSubjects}\n\n学科紧急度：\n${urgentSummary}\n\n遗忘曲线临界分布：\n${curveSummary}`,
      temperature: 0.5,
      maxOutputTokens: 300,
    })

    return text.trim()
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
        if (['fill_blank','short_answer','analysis','judge_correct'].includes(question_type)) {
          options = []
        }
        if (question_type === 'fill_blank') {
          if (Array.isArray(correct_answer)) {
            correct_answer = correct_answer.filter((a): a is string => typeof a === 'string')
          } else if (typeof correct_answer !== 'string') {
            correct_answer = String(correct_answer ?? '')
          }
        }
        if (question_type === 'short_answer' && typeof correct_answer !== 'string' && !Array.isArray(correct_answer)) {
          correct_answer = String(correct_answer ?? '')
        }
        if (question_type === 'analysis') {
          correct_answer = null
        }
        if (question_type === 'judge_correct') {
          if (correct_answer === false || correct_answer === 'false' || correct_answer === 0 || correct_answer === '0') {
            correct_answer = ''
          } else if (correct_answer !== true && typeof correct_answer !== 'string') {
            correct_answer = String(correct_answer ?? '')
          }
          if (typeof correct_answer === 'string' && correct_answer.trim() === '') {
            correct_answer = ''
          }
        }
        if (options.length < 2 && ['single_choice','multi_select'].includes(question_type)) {
          question_type = 'short_answer'
          options = []
        }
        if (correct_answer === null || correct_answer === undefined) {
          correct_answer = ''
        }

        const strOrUndefined = (v: unknown): string | undefined => {
          if (typeof v === 'string') return v.trim() || undefined
          if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').join('、') || undefined
          return undefined
        }

        return {
          question_type,
          question_text: q.question_text.trim(),
          options,
          correct_answer,
          analysis: strOrUndefined(q.analysis),
          answer_explanation: strOrUndefined(q.answer_explanation),
          key_points: strOrUndefined(q.key_points),
          source_page: strOrUndefined(q.source_page),
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

export async function generateQuestions(params: {
  subject: string
  questionTypes: string[]
  count: number
  topicDescription?: string
}, systemPrompt?: string): Promise<AiParseResult> {
  const parser = new DeepSeekParser(getConfig())
  return parser.generateQuestions(params, systemPrompt)
}

export async function generateFromText(params: {
  documentText: string
  subject?: string
  questionTypes?: string[]
  count?: number
}, systemPrompt?: string): Promise<AiParseResult> {
  const parser = new DeepSeekParser(getConfig())
  return parser.generateFromText(params, systemPrompt)
}

export async function generateFromDocument(markdown: string, systemPrompt?: string): Promise<AiParseResult> {
  const parser = new DeepSeekParser(getConfig())
  return parser.generateFromDocument(markdown, systemPrompt)
}

export async function suggestPlan(data: {
  totalReviewQueue: number
  topUrgent: { subject: string; urgency: number; reviewQueue: number; errorRate: number }[]
  atRiskCurve: { day: number; atRisk: number }[]
  totalSubjects: number
}): Promise<string> {
  const parser = new DeepSeekParser(getConfig())
  return parser.suggestPlan(data)
}
