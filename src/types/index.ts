export type UserRole = 'admin' | 'user'
export type AnswerMode = 'practice' | 'exam'
export type ExamStatus = 'in_progress' | 'completed'

export interface Profile {
  id: string
  role: UserRole
  deadline: string | null
  created_at: string
}

export interface Question {
  id: string
  question_text: string
  options: string[]
  correct_answer: number
  category: string | null
  subject: string | null
  analysis: string | null
  created_at: string
  created_by: string | null
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
  selected_answer: number
  is_correct: boolean
  mode: AnswerMode
  exam_session_id: string | null
  answered_at: string
}

export interface ImportedQuestion {
  question_text: string
  options: string[]
  correct_answer: number
  category?: string
  subject?: string
  analysis?: string
}
