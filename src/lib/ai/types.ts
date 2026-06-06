import type { QuestionType, CorrectAnswer } from '@/types'

export interface AiConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

export interface ParsedQuestion {
  question_type: QuestionType
  question_text: string
  options: string[]
  correct_answer: CorrectAnswer
  analysis?: string
  key_points?: string
  answer_explanation?: string
}

export interface AiParseResult {
  questions: ParsedQuestion[]
}

export interface DocumentParseResult {
  markdown: string
  fileName: string
}
