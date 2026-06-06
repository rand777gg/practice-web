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

export type MinerUModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML'

export interface MinerUPrecisionOptions {
  token: string
  modelVersion: MinerUModelVersion
  isOcr?: boolean
  enableFormula?: boolean
  enableTable?: boolean
  language?: string
}

export interface MinerUTaskResult {
  taskId: string
  state: 'done' | 'pending' | 'running' | 'failed' | 'converting'
  fullZipUrl?: string
  errMsg?: string
  extractProgress?: {
    extractedPages: number
    totalPages: number
    startTime: string
  }
}

export interface MinerUBatchFileResult {
  fileName: string
  state: 'done' | 'pending' | 'running' | 'failed' | 'converting' | 'waiting-file'
  fullZipUrl?: string
  errMsg?: string
}
