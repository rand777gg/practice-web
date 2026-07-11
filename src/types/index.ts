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
  subjects: string[]
  categories: string[]
  keyPoints: string[]
  count: number
  deadline: string | null
  wrongOnly: boolean
}

/** Normalize legacy DailyTarget formats to the current shape */
export function normalizeDailyTargets(raw: any[] | null | undefined): DailyTarget[] {
  if (!raw) return []
  return raw.map((t: any) => {
    const base = {
      categories: Array.isArray(t.categories) ? t.categories : [],
      keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [],
      deadline: t.deadline ?? null,
      wrongOnly: t.wrongOnly ?? false,
    }
    // Current format: subjects: string[], count: number
    if (Array.isArray(t.subjects) && (t.subjects.length === 0 || typeof t.subjects[0] === 'string')) {
      return { ...base, subjects: t.subjects, count: t.count ?? 5 }
    }
    // Previous format: subjects: [{ subject, count }] — sum per-subject counts
    if (Array.isArray(t.subjects) && typeof t.subjects[0] === 'object' && 'subject' in t.subjects[0]) {
      return {
        ...base,
        subjects: t.subjects.map((s: any) => s.subject),
        count: t.subjects.reduce((sum: number, s: any) => sum + (s.count ?? 5), 0),
      }
    }
    // Legacy: subject: string, count: number
    if (t.subject) {
      return { ...base, subjects: [t.subject], count: t.count ?? 5 }
    }
    return { ...base, subjects: [], count: t.count ?? 5 }
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
  plan_wrong_only: boolean | null
  plan_categories: string | null
  plan_key_points: string | null
  plan_targets: string | null
  created_at: string
}

const safeArr = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p as string[] : [] } catch { return [] }
}

/** Long-term plan groups. Falls back to a single group built from legacy singular columns. */
export function getPlanTargets(
  profile: Pick<Profile, 'plan_targets' | 'plan_subjects' | 'plan_categories' | 'plan_key_points' | 'plan_wrong_only'> | null,
): DailyTarget[] {
  if (!profile) return []
  if (profile.plan_targets) {
    try { return normalizeDailyTargets(JSON.parse(profile.plan_targets)) } catch { /* fall through to legacy */ }
  }
  const subjects = safeArr(profile.plan_subjects)
  const categories = safeArr(profile.plan_categories)
  const keyPoints = safeArr(profile.plan_key_points)
  if (subjects.length || categories.length || keyPoints.length) {
    return [{ subjects, categories, keyPoints, count: 0, deadline: null, wrongOnly: profile.plan_wrong_only ?? false }]
  }
  return []
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
