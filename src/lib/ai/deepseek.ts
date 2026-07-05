import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AiConfig, AiParseResult, ParsedQuestion } from './types'
import { getAiConfig as getConfig } from './config'

const questionSchema = z.object({
  question_type: z.enum(['single_choice','multi_select','true_false','fill_blank','short_answer','analysis','judge_correct']),
  question_text: z.string(),
  options: z.array(z.any()).transform(arr => arr.map(String)),
  correct_answer: z.any(),
  analysis: z.string().optional().nullable(),
  answer_explanation: z.string().optional().nullable(),
})

const resultSchema = z.object({
  questions: z.array(questionSchema),
}).passthrough()

const SYSTEM_PROMPT = `你是一个试题提取助手。从给定的 Markdown 文档中提取所有题目，并按 JSON 格式输出。

每道题目包含以下字段：

【question_text】题干的原始文本。必须保留原文表述，不要改写、不要省略、不要将选项文本混入题干。填空题的空缺处用 ____（双下划线）标记。

【question_type】题型，取值为以下之一：
- single_choice：单选题（有多个选项，仅一个正确答案）
- multi_select：多选题（有多个选项，多个正确答案）
- true_false：判断题（选项为"正确""错误"或"True""False"）
- fill_blank：填空题（题干中有空缺）
- short_answer：简答题（需要文字作答，无选项）
- analysis：分析题/论述题/案例分析题（无标准答案）
- judge_correct：判断改错题（给出一段陈述，判断正误并改正错误）

【options】选项列表（字符串数组）。选择题提取全部选项文本，保留原文。注意：选项文本中不要包含前缀字母/序号/分隔符（如 A. B) C、 D. 等），只保留纯文本内容。非选择题为空数组 []。

【correct_answer】正确答案：
- 单选题：整数（0-based 索引，即第一个选项索引为 0）
- 多选题：整数数组（如 [0, 2]）
- 判断题：布尔值 true/false
- 判断改错题：陈述正确为 true，陈述错误为修正后的正确表述字符串
- 填空题：答案字符串或字符串数组（多个空时按顺序对应）
- 简答题：答案字符串或字符串数组
- 分析题：null

【analysis】解析或答案说明。文档中有则提取，没有则留空字符串 ""。

逐题提取，保持原文顺序，不要遗漏任何题目。`

const GENERATE_FROM_DOC_SYSTEM = `你是一位经验丰富的考官。根据提供的学习材料，识别核心知识点，并以此出题。

出题规则：
- single_choice（单选题）：correct_answer 为整数（0-based 索引），options 至少4个
- multi_select（多选题）：correct_answer 为整数数组，options 至少4个
- true_false（判断题）：correct_answer 为 boolean，options=["正确","错误"]
- judge_correct（判断改错题）：题干给出一段陈述，correct_answer 为 true（正确）或字符串（指明错在哪里并给出修正后的正确表述），options 为空数组[]
- fill_blank（填空题）：correct_answer 为字符串或字符串数组（多个空时按顺序对应），options 为空数组[]，题干中用 ____ 标记空缺位置
- short_answer（简答题）：correct_answer 为字符串或字符串数组，options 为空数组[]
- analysis（分析题/论述题/案例分析题）：correct_answer 为 null，options 为空数组[]

要求：
- 以考官视角，考察对材料核心知识点的理解，而非机械记忆
- 涵盖概念理解、细节辨析、逻辑推理、案例分析等多种层次
- 针对每道题，明确指出其考查内容来源于材料的哪个章节、小节或段落，越具体越好（如"第3章第2节 关于XXX的部分"）
- 简答题和分析题的答案要详尽，分层次作答
- 每题附带详细的解析（analysis），解释正确答案及出处
- 题目数量不少于5道，尽量覆盖材料中的主要知识点`

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
    // Split long documents into chunks to avoid AI response truncation.
    // DeepSeek max output is ~8K tokens (~24K chars). Each question with analysis
    // can be 1-2K chars, so we limit input to ~10K chars per chunk.
    const MAX_CHUNK = 12000
    if (markdown.length <= MAX_CHUNK) {
      const { object } = await generateObject({
        model: this.model,
        schema: resultSchema,
        system: systemPrompt || SYSTEM_PROMPT,
        prompt: `Extract all questions from this document:\n\n${markdown}`,
        temperature: 0.1,
        maxOutputTokens: 8000,
      })
      return { questions: this.normalize(object.questions) }
    }

    // Split by paragraph boundaries, group into chunks
    const paragraphs = markdown.split(/\n\n+/)
    const chunks: string[] = []
    let current = ''
    for (const p of paragraphs) {
      if (current && current.length + p.length > MAX_CHUNK) {
        chunks.push(current)
        current = p
      } else {
        current = current ? current + '\n\n' + p : p
      }
    }
    if (current) chunks.push(current)

    // Process each chunk
    const allQuestions: ParsedQuestion[] = []
    const totalChunks = chunks.length
    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i]
      const chunkLabel = totalChunks > 1 ? ` (Part ${i + 1}/${totalChunks})` : ''
      const { object } = await generateObject({
        model: this.model,
        schema: resultSchema,
        system: systemPrompt || SYSTEM_PROMPT,
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
- 填空题用 ____ 标记空缺
- 题目难度适中，避免过于简单或偏门`

    const { object } = await generateObject({
      model: this.model,
      schema: resultSchema,
      system: systemPrompt || `You are a test question generation assistant. Create original, high-quality practice questions based on the given subject and parameters. Include detailed analysis (analysis field) for each question explaining the correct answer. Questions should be educational and test real understanding.`,
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
      system: systemPrompt || GENERATE_FROM_DOC_SYSTEM,
      prompt,
      temperature: 0.7,
    })

    const questions = this.normalize(object.questions)
    return { questions: params.count ? questions.slice(0, params.count) : questions }
  }

  async generateFromDocument(markdown: string, systemPrompt?: string): Promise<AiParseResult> {
    return this.parseDocument(markdown, systemPrompt || GENERATE_FROM_DOC_SYSTEM)
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
      system: `你是一个基于艾宾浩斯遗忘曲线的学习规划助手。根据用户的遗忘曲线和学科紧急度数据，给出个性化的学习建议。
输出要求：
- 用自然的口吻，像一位学习教练
- 指出最需要复习的学科，建议每天复习多少题
- 根据遗忘曲线的高峰期（第1、3、7天）给出复习节奏
- 输出 3-5 句话，总长度控制在 150 字以内
- 不要用 markdown 格式`,
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
