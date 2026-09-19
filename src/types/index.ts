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
  // ── 真题卷面专用题型 ──
  // 真实试卷的一整道大题就是一条记录（完形整篇、阅读一篇带 5 问），
  // 不再拆成一条条独立小题跟通用题型混用。小题挂在该记录的 `case_questions` 上
  // ——那个字段是通用的「小题容器」，不是案例分析专属，形状对得上就直接复用，
  // 省掉一次迁移，也让 questionItemCount / 答案形状 { subs } 这些现成机制直接可用。
  | 'cloze'            // 完形填空：整篇正文（挖空处带题号）+ 每空四个选项
  | 'reading_set'      // 阅读理解：一篇 Text 正文 + 若干小题
  | 'sentence_order'   // 新题型（排序）：段落 + 已给定字母 + 顺序骨架
  | 'translation'      // 翻译：全文 + 若干待译句
  | 'writing'          // 写作：应用文 / 短文，AI 建议分

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
  /** OJ 语义单测结果:accepted | wrong_answer | timeout | compile_error | runtime_error(仅 Judge0 判定时存在) */
  status?: string
  /** 单测运行耗时(ms) */
  time_ms?: number | null
  /** 单测峰值内存(KB) */
  memory_kb?: number | null
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
  /** 判题来源:central=平台中心(计入公共成绩);local=本地自测(不计入公共成绩) */
  judge_source?: 'central' | 'local' | null
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

/** 本地时区的 YYYY-MM-DD（不能用 toISOString, 会把东八区的当天零点倒退一天） */
export function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

/**
 * 长期计划下的一轮 = 某学科刷完一遍题。只认真实记录:
 * 起始日与目标完成日由用户设定, 实际完成日由刷题数据检测出来后落库。
 * 起始日/目标日只是这一轮的排期窗口(甘特图条形、逾期判断);
 * "这一遍的进度"另算: 起点 = 上一轮实际刷完那天 / 学科重置时刻, 见 passStartBySubject。
 */
export interface PlanRound {
  id: string
  subject: string
  /** 该学科第几轮, 从 1 开始 */
  round: number
  /** YYYY-MM-DD 这一轮的起始日(排期窗口左端, 甘特图条形左端); null = 没设过 */
  start: string | null
  /** YYYY-MM-DD 计划完成日(排期窗口右端), 不超过长期计划 deadline */
  target: string
  /** YYYY-MM-DD 创建这轮的那天 */
  createdAt: string
  /** YYYY-MM-DD 实际刷完的那天; 未完成 = null */
  doneAt: string | null
}

export function newRoundId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}`
}

function isDayStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * 归一化已存储的轮次。列是 JSONB, PostgREST 直接回数组; 兼容历史上可能存成
 * JSON 字符串(双重编码)的情况, 丢弃脏数据并按 学科 → 轮次 排序。
 */
export function normalizePlanRounds(raw: unknown): PlanRound[] {
  if (typeof raw === 'string') {
    try { return normalizePlanRounds(JSON.parse(raw) as unknown) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter((r) => typeof r.subject === 'string' && !!r.subject && isDayStr(r.target))
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : newRoundId(),
      subject: r.subject as string,
      round: Math.max(1, Math.round(Number(r.round) || 1)),
      start: isDayStr(r.start) ? r.start : null,
      target: r.target as string,
      createdAt: isDayStr(r.createdAt) ? r.createdAt : todayStr(),
      doneAt: isDayStr(r.doneAt) ? r.doneAt : null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.round - b.round)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function daysBetweenDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
}

/**
 * 一次性把旧的时间窗里程碑搬成轮次: "D 之前刷 N 轮" 展开成第 1..N 轮各自的完成日,
 * 在 (计划起点, D] 上按轮次均分, 最后一轮正好落在 D。老模型本来就有时间窗,
 * 所以每轮的起始日就是它那一段的左端。统计起点统一为今天 ——
 * 旧模型只存了目标、没有历史完成记录, 从今天重新起算才不会凭空冒出一堆已完成轮次。
 * 截止日已经过去的里程碑直接丢掉(那是上一版计划的残留)。
 */
export function migrateMilestonesToRounds(raw: unknown, planStart: string): PlanRound[] {
  const list = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw) as unknown } catch { return [] as unknown } })()
    : raw
  if (!Array.isArray(list)) return []
  const milestones = list
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && isDayStr(m.deadline))
    .sort((a, b) => (a.deadline as string).localeCompare(b.deadline as string))
    .filter((m) => (m.deadline as string) >= planStart)

  const counter = new Map<string, number>()
  const out: PlanRound[] = []
  let segStart = planStart
  for (const m of milestones) {
    const segEnd = m.deadline as string
    const subjects = Array.isArray(m.subjects) ? m.subjects : []
    for (const s of subjects) {
      if (!s || typeof s !== 'object') continue
      const subject = (s as { subject?: unknown }).subject
      if (typeof subject !== 'string' || !subject) continue
      const n = Math.max(1, Math.round(Number((s as { rounds?: unknown }).rounds) || 1))
      const span = Math.max(daysBetweenDays(segStart, segEnd), n)
      for (let i = 1; i <= n; i++) {
        const round = (counter.get(subject) ?? 0) + 1
        counter.set(subject, round)
        out.push({
          id: newRoundId(),
          subject,
          round,
          start: addDays(segStart, Math.ceil((span * (i - 1)) / n)),
          target: addDays(segStart, Math.ceil((span * i) / n)),
          createdAt: planStart,
          doneAt: null,
        })
      }
    }
    segStart = segEnd
  }
  return out
}

/**
 * 读取一个账号的轮次: 新列有数据就用新列; 还是空的但留着老里程碑, 就先按内存里搬出来的
 * 结果展示(落库由 PlanRoundWatcher 完成), 免得升级后一段时间里计划看起来是空的。
 */
export function resolveRounds(profile: { plan_rounds?: unknown; milestones?: unknown } | null): PlanRound[] {
  const rounds = normalizePlanRounds(profile?.plan_rounds)
  if (rounds.length > 0) return rounds
  if (!profile?.milestones) return []
  return migrateMilestonesToRounds(profile.milestones, todayStr())
}

/**
 * 自定义计划的一批: 某学科刷够 count 题。和长期计划的一轮是同一套记录模型,
 * 区别只在"一批刷多少题"—— 轮次固定等于该学科题量, 批次由自己定。
 */
export interface PlanGoal {
  id: string
  subject: string
  /** 这批要刷多少题 */
  count: number
  /** YYYY-MM-DD 计划完成日 */
  target: string
  /** YYYY-MM-DD 创建这批的那天, 也是这批统计的起点 */
  createdAt: string
  /** YYYY-MM-DD 实际刷够的那天; 未完成 = null */
  doneAt: string | null
}

/** 归一化已存储的批次目标(JSONB 列 / JSON 字符串两种存法都认), 丢弃脏数据并按 学科 → 目标日 排序 */
export function normalizePlanGoals(raw: unknown): PlanGoal[] {
  if (typeof raw === 'string') {
    try { return normalizePlanGoals(JSON.parse(raw) as unknown) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .filter((g) => typeof g.subject === 'string' && !!g.subject && isDayStr(g.target))
    .map((g) => ({
      id: typeof g.id === 'string' && g.id ? g.id : newRoundId(),
      subject: g.subject as string,
      count: Math.max(1, Math.round(Number(g.count) || 1)),
      target: g.target as string,
      createdAt: isDayStr(g.createdAt) ? g.createdAt : todayStr(),
      doneAt: isDayStr(g.doneAt) ? g.doneAt : null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.target.localeCompare(b.target))
}

/** 旧数据的 deadline 可能是 ISO 时间戳也可能是 YYYY-MM-DD, 统一成本地日期 */
function isoToDay(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  if (isDayStr(v)) return v
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? toDateStr(d) : null
}

/**
 * 一次性把旧的"每日定额"搬成批次目标: 每组里每个学科各一批, 题数用它自己填的 count,
 * 目标完成日沿用组的截止日。没填截止日的组(原来就是"每天 N 题")给一周缓冲期, 之后可在弹窗里改。
 */
export function migrateDailyTargetsToGoals(raw: unknown, today: string): PlanGoal[] {
  const list = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw) as unknown } catch { return [] as unknown } })()
    : raw
  if (!Array.isArray(list)) return []
  const out: PlanGoal[] = []
  for (const t of list) {
    if (!t || typeof t !== 'object') continue
    const deadline = isoToDay((t as { deadline?: unknown }).deadline)
    const subjects = (t as { subjects?: unknown }).subjects
    if (!Array.isArray(subjects)) continue
    for (const s of subjects) {
      const subject = s && typeof s === 'object' ? (s as { subject?: unknown }).subject : null
      if (typeof subject !== 'string' || !subject) continue
      out.push({
        id: newRoundId(),
        subject,
        count: Math.max(1, Math.round(Number((s as { count?: unknown }).count) || 1)),
        target: deadline ?? addDays(today, 7),
        createdAt: today,
        doneAt: null,
      })
    }
  }
  // 顺序必须和统计阈值(每批题数的累加)一致 —— 同学科按目标日排, 后面的批次才算在后面
  return out.sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN') || a.target.localeCompare(b.target))
}

/** 读一个账号的批次目标: 新列优先, 还没搬过就先按内存里搬出来的结果展示 */
export function resolveGoals(profile: { plan_goals?: unknown; daily_targets?: unknown } | null): PlanGoal[] {
  const goals = normalizePlanGoals(profile?.plan_goals)
  if (goals.length > 0) return goals
  const legacy = profile?.daily_targets
  if (!legacy || legacy === 'null') return []
  return migrateDailyTargetsToGoals(legacy, todayStr())
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
  /** 显式选定的头像 URL(绑定 GitHub 的账号登录时自动写入 GitHub 头像) */
  avatar_url?: string | null
  /** 显式选定的生成头像, 格式 <样式>:<配色索引>:<种子> */
  avatar_preset?: string | null
  deadline: string | null
  plan_subjects: string | null
  /** 长期计划下的轮次(JSONB 列, PostgREST 直接回数组), 见 PlanRound */
  plan_rounds: PlanRound[] | null
  /** 自定义计划的批次目标(JSONB 列), 见 PlanGoal */
  plan_goals: PlanGoal[] | null
  /** 已废弃的每日定额, 只在首次加载时用来搬成 plan_goals */
  daily_targets: string | null
  daily_deadline: string | null
  /** 已废弃的时间窗里程碑, 只在首次加载时用来搬成 plan_rounds */
  milestones?: unknown
  /** 备考目标类型:kaoyan 考研 / gongkao 考公 / final 期末考 / other 其他考试 */
  goal_type?: string | null
  /** 备考状态:school 在校/full 全职/working 在职/repeat 二战及以后/done 已上岸 */
  exam_status?: string | null
  /** 目标院校, 自由文本 */
  target_school?: string | null
  /** 自习室公开开关 {goal_type,exam_status,target_school}, 缺键=不公开 */
  profile_visibility?: Record<string, boolean> | null
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
  /** 开考时的模板快照(名称/封面/排版/分区分值); 刷新续考时还原卷首与工具栏, 模板后续被改/删不影响本场 */
  template?: ExamTemplate | null
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

/** 周期预约考试: 到点(设备本地时间)按模板快照自动组卷开考 */
export interface ExamSchedule {
  id: string
  user_id: string
  name: string
  /** 0=周日 .. 6=周六 (与 Date#getDay 一致) */
  days_of_week: number[]
  /** 开考时刻 = 当日 0 点起算分钟数 0..1439 */
  fire_time: number
  /** 组卷模板快照(建约时复制, 之后改/删模板不影响已建预约) */
  template: ExamTemplate
  enabled: boolean
  /** IANA 时区, 服务端 cron 按它换算到点时刻(建约时写入) */
  tz: string
  /** 最近一次已开考的业务日 YYYY-MM-DD(客户端本地日) */
  last_fire_date: string | null
  /** 最近一次已推送提醒的业务日 YYYY-MM-DD(服务端 cron 维护) */
  last_notify_date: string | null
  /** 定时邮件通知开关(用户自选发送日期/时间 email_send_date + email_time) */
  email_enabled: boolean
  /** 提醒邮件发送时刻 = 当日 0 点起算分钟数 0..1439 */
  email_time: number | null
  /** 提醒邮件发送日期 YYYY-MM-DD(空 = 兼容旧行为按每周重复日发) */
  email_send_date: string | null
  /** 最近一次已发提醒邮件的业务日 YYYY-MM-DD(服务端 cron 维护) */
  last_email_date: string | null
  created_at: string
  updated_at: string
}

export interface UserAnswer {
  id: string
  user_id: string
  question_id: string
  selected_answer: CorrectAnswer
  is_correct: boolean
  mode: AnswerMode
  /** 作答来源: sequential = 顺序学习(推进计划轮次), random = 复习自由刷; 老数据为 null */
  source?: 'sequential' | 'random' | null
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
  /** 接口协议：openai = /chat/completions + Bearer；anthropic = /v1/messages + x-api-key */
  protocol: 'openai' | 'anthropic'
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
    // 卷面专用题型：一题多小题的四种与 case_analysis 同形，写作是单篇文字
    case 'cloze':
    case 'reading_set':
    case 'sentence_order':
    case 'translation':
      return raw && typeof raw === 'object' && !Array.isArray(raw) && 'subs' in (raw as Record<string, unknown>)
        ? (raw as CaseAnswer)
        : { subs: [] } as CaseAnswer
    case 'writing':
      return String(raw)
    case 'case_analysis':
      return raw && typeof raw === 'object' && !Array.isArray(raw) && 'subs' in (raw as Record<string, unknown>)
        ? (raw as CaseAnswer)
        : { subs: [] } as CaseAnswer
    case 'coding':
      if (raw && typeof raw === 'object' && 'code' in (raw as Record<string, unknown>)) {
        return raw as CodingAnswer
      }
      return { code: '', language: 'javascript', allPassed: false }
    default:
      return ''
  }
}
