export type UserRole = 'admin' | 'user'
export type AnswerMode = 'practice' | 'exam'
export type ExamStatus = 'in_progress' | 'completed'

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
  deadline: string | null
  plan_subjects: string | null
  daily_targets: string | null
  daily_deadline: string | null
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
  key_points: string | null
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
  note: string | null
  is_public: boolean
  answered_at: string
}

export interface ImportedQuestion {
  question_text: string
  options: string[]
  correct_answer: number
  category?: string
  subject?: string
  analysis?: string
  key_points?: string
}
