import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { AiConfig, AiParseResult, ParsedQuestion } from './types'

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
- fill_blank: correct_answer is a string. options is empty array [].
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
