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
  | 'coding'
  | 'case_analysis'

export interface TestCase {
  input: string
  expected: string
}

export interface ExampleCase {
  input: string
  expected: string
  explanation?: string
}

export interface RuntimeConfig {
  timeout_ms?: number
  memory_mb?: number
}

export interface SubmissionResult {
  testCaseIndex: number
  passed: boolean
  input: string
  expected: string
  actual: string
  error?: string
}

export interface Submission {
  id: string
  user_id: string
  question_id: string
  code: string
  language: string
  status: 'pending' | 'running' | 'accepted' | 'wrong_answer' | 'runtime_error' | 'timeout' | 'compile_error'
  results: SubmissionResult[] | null
  error: string | null
  execution_time_ms: number | null
  created_at: string
}

export interface CodingAnswer {
  code: string
  language: string
  allPassed: boolean
}

/** 案例分析题中的一个小题; 与整题共用 case 材料作为题干 */
export interface CaseQuestion {
  id: string
  /** 仅允许可自动判分的小题型: 单选/多选/判断/判断改错/填空/简答 */
  type: QuestionType
  text: string
  options: string[]
  answer: CorrectAnswer
}

/** 案例分析题整题的用户作答: 每个小题一份子答案 */
export interface CaseAnswer {
  subs: { id: string; value: CorrectAnswer }[]
}

export type CorrectAnswer =
  | number      // single_choice: index into options
  | number[]    // multi_select: indices into options
  | boolean     // true_false
  | string      // fill_blank: expected text
  | string[]    // short_answer: acceptable answers
  | null        // analysis: manual grading
  | CodingAnswer // coding: submission result
  | CaseAnswer  // case_analysis: per-sub answers

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

/** 计划学科 -> 认领知识点数组。如 {"数学":["一元二次方程"]}。 */
export type PlanScope = Record<string, string[]>

/**
 * 从 profile 读取并归一化 plan_scope。
 * 返回空对象表示"无显式范围"(即沿用旧行为:按整科学科统计)。
 */
export function getPlanScope(profile: { plan_scope?: PlanScope | null } | null): PlanScope {
  const raw = profile?.plan_scope
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: PlanScope = {}
  for (const [subj, kps] of Object.entries(raw)) {
    if (Array.isArray(kps)) {
      const clean = kps.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
      if (clean.length > 0) out[subj] = [...new Set(clean)]
    }
  }
  return out
}

/**
 * 判断某学科是否处于“显式知识点范围”内。
 * - 该学科没有 entry -> false(视为整科)
 * - entry 为 [] 或空数组 -> false(视为整科)
 */
export function hasKpScope(scope: PlanScope, subject: string): boolean {
  const kps = scope[subject]
  return Array.isArray(kps) && kps.length > 0
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
  /** 计划学科 -> 认领知识点数组的映射。如 {"数学":["一元二次方程"]}。NULL 或缺省=该学科全部知识点 */
  plan_scope: PlanScope | null
  subject_reset_at: Record<string, string> | null
  daily_reset_at: string | null
  totp_enabled?: boolean
  preferred_2fa?: 'totp' | 'passkey'
  passkey_timeout_minutes?: number
  mfa_grace_until?: string | null
  mfa_validity_days?: number
  onboarded_at?: string | null
  created_at: string
}

export interface PasskeyCredential {
  id: string
  user_id: string
  credential_id: string
  public_key: string
  counter: number
  transports: string[]
  device_name: string | null
  platform: string | null
  credential_device_type: string | null
  credential_backed_up: boolean | null
  created_at: string
  last_used_at: string | null
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
  unordered_blanks: number[] | null
  source_page: string | null
  test_cases?: TestCase[]
  runtime_config?: RuntimeConfig
  execution_mode?: 'stdio' | 'function'
  examples?: ExampleCase[]
  /** 案例分析题的小题列表; question_text 为共用案例材料 */
  case_questions?: CaseQuestion[]
  issue_flag?: 'none' | 'suspected' | 'confirmed'
  issue_note?: string | null
  flagged_at?: string | null
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

/** 整卷排序: section=按分区顺序拼接, shuffle=全卷打散 */
export type ExamOrderMode = 'section' | 'shuffle'

/** 分区内抽题策略: random=随机, wrong_first=错题优先, unseen_first=未做优先, seq=真题原序 */
export type ExamSampleMode = 'random' | 'wrong_first' | 'unseen_first' | 'seq'

export interface ExamTemplateSection {
  id: string
  /** 题型; 空表示不限题型（仅旧版单分区模式使用） */
  type: QuestionType | null
  count: number
  /** 每题分值 */
  score: number
  /** 该分区限定分类, 空表示不限 */
  categories: string[]
  /**
   * 该分区限定学科(可多选);
   * null / 空数组 / 缺省 = 继承整卷学科(整卷学科也为空时=不限学科)
   */
  subject?: string[] | null
}

import type {
  ExamTemplateCover,
  ExamTemplateCoverBlock,
  ExamTemplateCoverInfoRow,
} from '@/lib/paper-cover'
import type {
  ExamTemplateLayout,
  PaperAdditionalBlock,
  PaperBinderLine,
  PaperHeaderFooter,
  PaperMargins,
  PaperSealBand,
  PaperWatermark,
} from '@/lib/paper-layout'

export type {
  ExamTemplateCover,
  ExamTemplateCoverBlock,
  ExamTemplateCoverInfoRow,
}
export type {
  ExamTemplateLayout,
  PaperAdditionalBlock,
  PaperBinderLine,
  PaperHeaderFooter,
  PaperMargins,
  PaperSealBand,
  PaperWatermark,
}

export interface ExamTemplate {
  id: string
  user_id: string | null
  name: string
  /**
   * 整卷学科(可多选); 空数组 / null = 不限学科。
   * 兼容旧版单字符串存储, 读取端由 store normalize 为数组。
   */
  subject: string[] | null
  duration_min: number
  order_mode: ExamOrderMode
  sample_mode: ExamSampleMode
  sections: ExamTemplateSection[]
  /** 可选封面; 编辑器里编辑 / PDF 解析填充; PaperPreview 自动渲染在最前面 */
  cover?: ExamTemplateCover | null
  /** 可选排版 token; 控制纸张/边距/字号/分栏/装订线/密封条/水印/页眉页脚/得分框 */
  layout?: ExamTemplateLayout | null
  /** 继承来源模板 id (快照继承: 仅记录来源, 内容已复制, 后续互不影响) */
  parent_id?: string | null
  sort_order: number
  created_at: string
  updated_at: string
  /** 内置预设只存在于前端代码, 不可编辑/删除 */
  builtin?: boolean
}

export interface ExamComposeStat {
  type: string | null
  requested: number
  got: number
}

/** 内置预设在前端定义, 未落库时的占位值 */
export const BUILTIN_TEMPLATE_ORIGIN = '__builtin__'

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
  unordered_blanks?: number[] | null
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
    case 'case_analysis':
      return raw && typeof raw === 'object' && !Array.isArray(raw) && 'subs' in (raw as Record<string, unknown>)
        ? (raw as CaseAnswer)
        : { subs: [] } as CaseAnswer
    case 'coding':
      if (raw && typeof raw === 'object' && 'code' in (raw as Record<string, unknown>)) {
        return raw as CodingAnswer
      }
      return { code: '', language: 'javascript', allPassed: false }
  }
}
