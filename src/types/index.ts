export type UserRole = 'admin' | 'user'
export type AnswerMode = 'practice' | 'exam'
export type ExamStatus = 'in_progress' | 'completed'

// === Question Types ===
export type QuestionType =
  | 'single_choice'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'analysis'
  | 'judge_correct'

export type CorrectAnswer =
  | number      // single_choice: index into options
  | number[]    // multi_select: indices into options
  | boolean     // true_false
  | string      // fill_blank: expected text
  | string[]    // short_answer: acceptable answers
  | null        // analysis: manual grading

export interface DailyTarget {
  subjects: { subject: string; count: number }[]
  deadline: string | null
}

/** Normalize legacy DailyTarget formats to the current shape */
export function normalizeDailyTargets(raw: any[] | null | undefined): DailyTarget[] {
  if (!raw) return []
  return raw.map((t: any) => {
    // Current format: subjects: [{ subject, count }]
    if (Array.isArray(t.subjects) && t.subjects.length > 0 && typeof t.subjects[0] === 'object' && 'subject' in t.subjects[0]) {
      return {
        subjects: t.subjects.map((s: any) => ({ subject: s.subject, count: s.count ?? 5 })),
        deadline: t.deadline ?? null,
      }
    }
    // Previous format: subjects: string[], count: number
    if (Array.isArray(t.subjects) && t.subjects.length > 0 && typeof t.subjects[0] === 'string') {
      const totalCount = t.count ?? 5
      const per = Math.max(1, Math.floor(totalCount / t.subjects.length))
      const rem = totalCount - per * t.subjects.length
      return {
        subjects: t.subjects.map((s: string, i: number) => ({
          subject: s,
          count: per + (i < rem ? 1 : 0),
        })),
        deadline: t.deadline ?? null,
      }
    }
    // Legacy: subject: string, count: number
    if (t.subject) {
      return {
        subjects: [{ subject: t.subject, count: t.count ?? 5 }],
        deadline: t.deadline ?? null,
      }
    }
    return { subjects: [], deadline: t.deadline ?? null }
  })
}

export interface Profile {
  id: string
  role: UserRole
  nickname: string | null
  deadline: string | null
  plan_subjects: string | null
  daily_targets: string | null
  daily_deadline: string | null
  plan_reset_at: string | null
  daily_reset_at: string | null
  created_at: string
}

export interface Question {
  id: string
  question_type: QuestionType
  question_text: string
  options: string[]
  correct_answer: CorrectAnswer
  category: string | null
  categories: string[]
  subject: string | null
  analysis: string | null
  key_points: string | null
  answer_explanation: string | null
  seq_number: number | null
  created_at: string
  created_by: string | null
  verified: boolean
  import_mode: string | null
  allow_unordered: boolean
  source_page: string | null
}

export interface ExamSession {
  id: string
  user_id: string
  status: ExamStatus
  total_questions: number
  correct_count: number
  score: number | null
  question_ids: string[]
  current_index: number
  duration_ms: number
  started_at: string
  completed_at: string | null
}

export interface UserAnswer {
  id: string
  user_id: string
  question_id: string
  selected_answer: CorrectAnswer
  is_correct: boolean
  mode: AnswerMode
  exam_session_id: string | null
  note: string | null
  is_public: boolean
  answered_at: string
}

// === AI Provider Types ===
export interface AiModel {
  id: string
  name: string
  enabled: boolean
}

export interface AiProviderConfig {
  id: string
  name: string
  description: string
  type: 'official' | 'community'
  enabled: boolean
  apiKey: string
  baseUrl: string
  models: AiModel[]
}

export interface ImportedQuestion {
  question_type: QuestionType
  question_text: string
  options: string[]
  correct_answer: CorrectAnswer
  category?: string
  categories?: string[]
  subject?: string
  analysis?: string
  key_points?: string
  answer_explanation?: string
  allow_unordered?: boolean
}

/** Parse correct_answer from DB JSONB to typed CorrectAnswer */
export function parseCorrectAnswer(raw: unknown, type: QuestionType): CorrectAnswer {
  if (raw === null || raw === undefined) {
    if (type === 'analysis') return null
    if (type === 'multi_select') return []
    if (type === 'true_false') return false
    return ''
  }
  switch (type) {
    case 'single_choice':
      return typeof raw === 'number' ? raw : Number(raw)
    case 'multi_select':
      return Array.isArray(raw) ? raw.map(Number) : [Number(raw)]
    case 'true_false':
      return raw === true || raw === 'true' || raw === 1
    case 'judge_correct':
      return raw === true ? true : String(raw)
    case 'fill_blank':
      return String(raw)
    case 'short_answer':
      return Array.isArray(raw) ? raw.map(String) : [String(raw)]
    case 'analysis':
      return null
  }
}
