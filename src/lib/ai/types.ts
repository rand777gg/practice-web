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
  verified?: boolean
}

export interface AiParseResult {
  questions: ParsedQuestion[]
}

export interface DocumentParseResult {
  markdown: string
  fileName: string
  jsonData?: string
  pdfUrl?: string
}

export type MinerUModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML'

export interface MinerUPrecisionOptions {
  token: string
  modelVersion: MinerUModelVersion
  isOcr?: boolean
  enableFormula?: boolean
  enableTable?: boolean
  language?: string
  pageRanges?: string
  extraFormats?: string[]
  noCache?: boolean
  cacheTolerance?: number
  dataId?: string
}

export interface MinerUTaskResult {
  taskId: string
  state: 'done' | 'pending' | 'running' | 'failed' | 'converting'
  fullZipUrl?: string
  errMsg?: string
  code?: number
  msg?: string
  dataId?: string
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
  dataId?: string
}

export interface MinerUBatchStatus {
  batchId: string
  code?: number
  msg?: string
  files: MinerUBatchFileResult[]
}

export interface MinerULightweightStatus {
  taskId: string
  state: string
  code?: number
  msg?: string
  markdownUrl?: string
  errMsg?: string
}
