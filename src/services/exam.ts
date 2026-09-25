import type { Database, Json } from '@/types/database'
import type {
  ExamComposeStat,
  ExamOrderMode,
  ExamSampleMode,
  ExamSchedule,
  ExamSession,
  ExamTemplate,
  ExamTemplateSection,
  QuestionType,
} from '@/types'
import type { ExamTemplateCover, ExamTemplateCoverBlock } from '@/lib/paper-cover'
import type { ExamTemplateLayout } from '@/lib/paper-layout'
import { normalizeLayout } from '@/lib/paper-layout'
import { db, run, runList, toJson, type Insert, type QueryOptions, type Update } from './db'
import { assertColumns } from './columns'

/**
 * exam_sessions / exam_templates / exam_schedules 的字段集。
 *
 * 三张表都挂着 JSONB(模板快照、分区、封面、版式): select('*') 会让「只探一下有没有在考」
 * 这种 30 秒一次的轮询把整份快照拉回来。列集与 mapper 分开写必然漂移, 所以每个集合都由
 * assertColumns 在编译期核对「mapper 要读的字段是否都在这段字符串里」。
 */
export type ExamSessionSource = {
  id: string
  user_id: string
  status: string
  total_questions: number
  correct_count: number
  score: number | null
  question_ids: Json
  current_index: number
  duration_ms: number
  started_at: string
  completed_at: string | null
  /** 开考时的模板快照; 加列之前开的老会话为 null */
  template: Json | null
}

export const EXAM_SESSION_COLUMNS = assertColumns<ExamSessionSource>()(
  'id, user_id, status, total_questions, correct_count, score, question_ids, current_index, duration_ms, started_at, completed_at, template',
)

/** 只探存在性时用的最小列集 */
export const EXAM_SESSION_ID_COLUMNS = assertColumns<Pick<ExamSessionSource, 'id'>>()('id')

export type ExamTemplateSource = {
  id: string
  user_id: string
  name: string
  /** 整卷学科; 旧数据可能是单个字符串, 由 toExamTemplate 归一化成数组 */
  subject: string[] | null
  duration_min: number
  order_mode: string
  sample_mode: string
  sections: Json
  cover: Json | null
  layout: Json | null
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export const EXAM_TEMPLATE_COLUMNS = assertColumns<ExamTemplateSource>()(
  'id, user_id, name, subject, duration_min, order_mode, sample_mode, sections, cover, layout, parent_id, sort_order, created_at, updated_at',
)

export type ExamScheduleSource = {
  id: string
  user_id: string
  name: string
  days_of_week: number[]
  fire_time: number
  template: Json
  enabled: boolean
  tz: string
  last_fire_date: string | null
  last_notify_date: string | null
  email_enabled: boolean
  email_time: number | null
  email_send_date: string | null
  last_email_date: string | null
  created_at: string
  updated_at: string
}

/**
 * email_send_date 是 database.ts 里带 [patch] 标记补上的一列 —— 那份文件的生成来源是入口切换前的
 * 旧项目, 线上确有该列(见 database.ts 文件头与 scripts/check-schema-drift.mjs); 换用线上直连串
 * 重新生成后, 这个补丁与这处说明一起删掉。
 */
export const EXAM_SCHEDULE_COLUMNS = assertColumns<ExamScheduleSource>()(
  'id, user_id, name, days_of_week, fire_time, template, enabled, tz, last_fire_date, last_notify_date, email_enabled, email_time, email_send_date, last_email_date, created_at, updated_at',
)

/** 跨标签页/设备去重今天是否已开考, 只看这一个字段 */
export const EXAM_SCHEDULE_FIRE_COLUMNS = assertColumns<Pick<ExamScheduleSource, 'last_fire_date'>>()('last_fire_date')

const ORDER_MODES: ExamOrderMode[] = ['section', 'shuffle']
const SAMPLE_MODES: ExamSampleMode[] = ['random', 'wrong_first', 'unseen_first', 'seq']

/** 历史列表只展示最近 20 场 */
const EXAM_HISTORY_LIMIT = 20
/** 到点监视器一次最多检查 50 条预约 */
const ENABLED_SCHEDULE_LIMIT = 50

export interface ExamSessionInput {
  user_id: string
  /** 按小题(卡片)展开后的总题数 */
  total_questions: number
  duration_ms: number
  /** 本场题单快照, 顺序即卷面顺序 */
  question_ids: string[]
  template?: ExamTemplate | null
}

export interface ExamSessionCompletion {
  correct_count: number
  score: number
  /** 实际用时, 不是模板时长 */
  duration_ms: number
  current_index: number
  completed_at: string
}

export interface ExamTemplateInput {
  name: string
  subject: string[] | null
  duration_min: number
  order_mode: ExamOrderMode
  sample_mode: ExamSampleMode
  sections: ExamTemplateSection[]
  cover?: ExamTemplateCover | null
  layout?: ExamTemplateLayout | null
  /** 继承来源模板 id; 建完不再改 */
  parent_id?: string | null
  /** 列表顺序, 新建时取「我已有的模板数」 */
  sort_order?: number
}

/** 可改字段; 继承来源与排序只在新建时定 */
export type ExamTemplatePatch = Partial<Omit<ExamTemplateInput, 'parent_id' | 'sort_order'>>

export interface ExamScheduleInput {
  name: string
  days_of_week: number[]
  fire_time: number
  template: ExamTemplate
  enabled: boolean
  tz: string
  email_enabled?: boolean
  email_time?: number | null
  email_send_date?: string | null
}

export type ExamSchedulePatch = Partial<ExamScheduleInput>

/** 兼容数组与旧版单字符串; 空结果返回 null(=不限/跟随整卷) */
function normalizeSubjectList(raw: unknown): string[] | null {
  const arr = typeof raw === 'string' ? (raw.trim() ? [raw.trim()] : []) : Array.isArray(raw) ? raw : []
  const out = [
    ...new Set(
      arr
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim()),
    ),
  ]
  return out.length ? out : null
}

function normalizeSection(raw: unknown, index: number): ExamTemplateSection | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const type = (typeof s.type === 'string' && s.type ? s.type : null) as QuestionType | null
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `s${index}`,
    type,
    count: Math.max(0, Math.min(200, Number(s.count) || 0)),
    score: Math.max(0, Math.min(100, Number(s.score) || 0)),
    categories: Array.isArray(s.categories) ? s.categories.filter((c): c is string => typeof c === 'string') : [],
    subject: normalizeSubjectList(s.subject),
  }
}

function normalizeSections(raw: unknown): ExamTemplateSection[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSection).filter((s): s is ExamTemplateSection => s !== null)
}

function normalizeCoverBlocks(raw: unknown): ExamTemplateCoverBlock[] | null {
  if (!Array.isArray(raw)) return null
  const blocks: ExamTemplateCoverBlock[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const o = b as Record<string, unknown>
    const kind = o.kind === 'heading' || o.kind === 'paragraph' || o.kind === 'rule' ? o.kind : 'paragraph'
    const block: ExamTemplateCoverBlock = { kind }
    if (typeof o.text === 'string') block.text = o.text
    if (o.align === 'left' || o.align === 'center' || o.align === 'right') block.align = o.align
    if (typeof o.bold === 'boolean') block.bold = o.bold
    if (o.size === 'sm' || o.size === 'md' || o.size === 'lg' || o.size === 'xl') block.size = o.size
    if (o.placement === 'header' || o.placement === 'footer' || o.placement === 'cover-end') {
      block.placement = o.placement
    }
    blocks.push(block)
  }
  return blocks.length ? blocks : null
}

function normalizeCover(raw: unknown): ExamTemplateCover | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const pick = (k: string): string | null => {
    const v = c[k]
    return typeof v === 'string' ? v : null
  }
  const notices = Array.isArray(c.notices)
    ? c.notices.filter((n): n is string => typeof n === 'string')
    : null
  const infoTable = Array.isArray(c.infoTable)
    ? c.infoTable
        .map((r) => {
          if (!r || typeof r !== 'object') return null
          const row = r as Record<string, unknown>
          if (typeof row.label !== 'string') return null
          const boxes = Math.max(0, Math.min(60, Number(row.boxes) || 0))
          const widthMm = typeof row.widthMm === 'number' ? row.widthMm : undefined
          return { label: row.label, boxes, widthMm }
        })
        .filter((r): r is { label: string; boxes: number; widthMm: number | undefined } => r !== null)
    : null
  return {
    banner: pick('banner'),
    examName: pick('examName'),
    title: pick('title'),
    codeLine: pick('codeLine'),
    noticeTitle: pick('noticeTitle'),
    notices,
    infoHint: pick('infoHint'),
    infoTable: infoTable && infoTable.length ? infoTable : null,
    customBlocks: normalizeCoverBlocks(c.customBlocks),
  }
}

/**
 * 读一行 exam_templates, 也读一份模板快照 JSONB(exam_sessions.template / exam_schedules.template
 * 存的就是同一形状的整份模板), 所以入参是 unknown。
 * 整卷学科兼容旧版单字符串存储, 一律归一化成数组; 空结果(=不限学科)返回 null。
 */
export function toExamTemplate(raw: unknown): ExamTemplate {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    id: String(row.id ?? ''),
    user_id: row.user_id == null ? null : String(row.user_id),
    name: String(row.name ?? ''),
    subject: normalizeSubjectList(row.subject),
    duration_min: Math.max(1, Math.min(600, Number(row.duration_min) || 60)),
    order_mode: ORDER_MODES.includes(row.order_mode as ExamOrderMode) ? (row.order_mode as ExamOrderMode) : 'section',
    sample_mode: SAMPLE_MODES.includes(row.sample_mode as ExamSampleMode) ? (row.sample_mode as ExamSampleMode) : 'random',
    sections: normalizeSections(row.sections),
    cover: normalizeCover(row.cover),
    layout: normalizeLayout(row.layout),
    parent_id: row.parent_id == null ? null : String(row.parent_id),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

/** question_ids 是 JSONB 数组, 存的是题目 id 列表 */
function toQuestionIds(raw: Json): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

/** DB 行 → 领域对象。JSONB 列与枚举字符串在这里归一化, UI 层不再各写一遍 parse。 */
export function toExamSession(row: ExamSessionSource): ExamSession {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    total_questions: row.total_questions,
    correct_count: row.correct_count,
    score: row.score,
    question_ids: toQuestionIds(row.question_ids),
    current_index: row.current_index,
    duration_ms: row.duration_ms,
    started_at: row.started_at,
    completed_at: row.completed_at,
    template: row.template == null ? null : toExamTemplate(row.template),
  }
}

/** DB 行 → 领域对象。预约里的 template 是建约时复制的快照, 同样在这里归一化。 */
export function toExamSchedule(row: ExamScheduleSource): ExamSchedule {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    days_of_week: row.days_of_week,
    fire_time: row.fire_time,
    template: toExamTemplate(row.template),
    enabled: row.enabled,
    tz: row.tz || 'Asia/Shanghai',
    last_fire_date: row.last_fire_date,
    last_notify_date: row.last_notify_date,
    email_enabled: row.email_enabled,
    email_time: row.email_time,
    email_send_date: row.email_send_date,
    last_email_date: row.last_email_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** 开考落库: 题单与模板快照一起冻结, 之后改/删模板或题库都不影响本场 */
export async function createExamSession(input: ExamSessionInput, options: QueryOptions = {}): Promise<ExamSession | null> {
  const base = db
    .from('exam_sessions')
    .insert({
      user_id: input.user_id,
      total_questions: input.total_questions,
      duration_ms: input.duration_ms,
      question_ids: toJson(input.question_ids),
      template: input.template == null ? null : toJson(input.template),
      current_index: 0,
      status: 'in_progress',
      correct_count: 0,
    })
    .select(EXAM_SESSION_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'exam.createExamSession' },
  )
  return row ? toExamSession(row) : null
}

export async function fetchExamSession(sessionId: string, options: QueryOptions = {}): Promise<ExamSession | null> {
  const base = db.from('exam_sessions').select(EXAM_SESSION_COLUMNS).eq('id', sessionId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'exam.fetchExamSession' },
  )
  return row ? toExamSession(row) : null
}

/** 最近一场进行中的会话, 用于「继续上次考试」弹窗 */
export async function fetchRunningExamSession(userId: string, options: QueryOptions = {}): Promise<ExamSession | null> {
  const base = db
    .from('exam_sessions')
    .select(EXAM_SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'exam.fetchRunningExamSession' },
  )
  return row ? toExamSession(row) : null
}

/** 只回答「有没有在考」: 到点监视器与定时开考都用它挡掉重复开考 */
export async function hasRunningExamSession(userId: string, options: QueryOptions = {}): Promise<boolean> {
  const base = db
    .from('exam_sessions')
    .select(EXAM_SESSION_ID_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.hasRunningExamSession' },
  )
  return rows.length > 0
}

export async function fetchCompletedExamSessions(userId: string, options: QueryOptions = {}): Promise<ExamSession[]> {
  const base = db
    .from('exam_sessions')
    .select(EXAM_SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(EXAM_HISTORY_LIMIT)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.fetchCompletedExamSessions' },
  )
  return rows.map(toExamSession)
}

/** 续考游标; 按小题(卡片)计数, 不是题目记录数 */
export async function saveExamCursor(sessionId: string, currentIndex: number, options: QueryOptions = {}): Promise<void> {
  const base = db.from('exam_sessions').update({ current_index: currentIndex }).eq('id', sessionId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.saveExamCursor' },
  )
}

export async function completeExamSession(
  sessionId: string,
  result: ExamSessionCompletion,
  options: QueryOptions = {},
): Promise<void> {
  const base = db
    .from('exam_sessions')
    .update({
      status: 'completed',
      correct_count: result.correct_count,
      score: result.score,
      duration_ms: result.duration_ms,
      current_index: result.current_index,
      completed_at: result.completed_at,
    })
    .eq('id', sessionId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.completeExamSession' },
  )
}

export async function deleteExamSession(sessionId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('exam_sessions').delete().eq('id', sessionId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.deleteExamSession' },
  )
}

/** 只取用户自有模板; 内置预设只存在于前端代码, 不落库 */
export async function fetchExamTemplates(userId: string, options: QueryOptions = {}): Promise<ExamTemplate[]> {
  const base = db
    .from('exam_templates')
    .select(EXAM_TEMPLATE_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.fetchExamTemplates' },
  )
  return rows.map(toExamTemplate)
}

export async function createExamTemplate(
  userId: string,
  input: ExamTemplateInput,
  options: QueryOptions = {},
): Promise<ExamTemplate | null> {
  const base = db
    .from('exam_templates')
    .insert({
      user_id: userId,
      name: input.name,
      subject: normalizeSubjectList(input.subject),
      duration_min: input.duration_min,
      order_mode: input.order_mode,
      sample_mode: input.sample_mode,
      sections: toJson(input.sections),
      cover: input.cover == null ? null : toJson(input.cover),
      layout: input.layout == null ? null : toJson(input.layout),
      parent_id: input.parent_id ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select(EXAM_TEMPLATE_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'exam.createExamTemplate' },
  )
  return row ? toExamTemplate(row) : null
}

/** 显式 null = 清除封面/版式; 没传的字段不动 */
export async function updateExamTemplate(
  id: string,
  patch: ExamTemplatePatch,
  options: QueryOptions = {},
): Promise<ExamTemplate | null> {
  const payload: Update<'exam_templates'> = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.subject !== undefined) payload.subject = normalizeSubjectList(patch.subject)
  if (patch.duration_min !== undefined) payload.duration_min = patch.duration_min
  if (patch.order_mode !== undefined) payload.order_mode = patch.order_mode
  if (patch.sample_mode !== undefined) payload.sample_mode = patch.sample_mode
  if (patch.sections !== undefined) payload.sections = toJson(patch.sections)
  if (patch.cover !== undefined) payload.cover = patch.cover == null ? null : toJson(patch.cover)
  if (patch.layout !== undefined) payload.layout = patch.layout == null ? null : toJson(patch.layout)

  const base = db.from('exam_templates').update(payload).eq('id', id).select(EXAM_TEMPLATE_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'exam.updateExamTemplate' },
  )
  return row ? toExamTemplate(row) : null
}

export async function deleteExamTemplate(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('exam_templates').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.deleteExamTemplate' },
  )
}

export async function fetchExamSchedules(userId: string, options: QueryOptions = {}): Promise<ExamSchedule[]> {
  const base = db
    .from('exam_schedules')
    .select(EXAM_SCHEDULE_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.fetchExamSchedules' },
  )
  return rows.map(toExamSchedule)
}

/** 到点监视器只关心启用的预约 */
export async function fetchEnabledExamSchedules(userId: string, options: QueryOptions = {}): Promise<ExamSchedule[]> {
  const base = db
    .from('exam_schedules')
    .select(EXAM_SCHEDULE_COLUMNS)
    .eq('user_id', userId)
    .eq('enabled', true)
    .limit(ENABLED_SCHEDULE_LIMIT)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.fetchEnabledExamSchedules' },
  )
  return rows.map(toExamSchedule)
}

/** 其它标签页/设备可能已经开过今天这一场, 开考前再确认一次 */
export async function fetchExamScheduleLastFireDate(
  scheduleId: string,
  options: QueryOptions = {},
): Promise<string | null> {
  const base = db.from('exam_schedules').select(EXAM_SCHEDULE_FIRE_COLUMNS).eq('id', scheduleId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'exam.fetchExamScheduleLastFireDate' },
  )
  return row?.last_fire_date ?? null
}

export async function createExamSchedule(
  userId: string,
  input: ExamScheduleInput,
  options: QueryOptions = {},
): Promise<ExamSchedule | null> {
  const values: Insert<'exam_schedules'> = {
    user_id: userId,
    name: input.name,
    days_of_week: input.days_of_week,
    fire_time: input.fire_time,
    template: toJson(input.template),
    enabled: input.enabled,
    tz: input.tz,
    email_enabled: input.email_enabled ?? false,
    email_time: input.email_time ?? null,
    email_send_date: input.email_send_date ?? null,
  }
  const base = db.from('exam_schedules').insert(values).select(EXAM_SCHEDULE_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'exam.createExamSchedule' },
  )
  return row ? toExamSchedule(row) : null
}

export async function updateExamSchedule(
  id: string,
  patch: ExamSchedulePatch,
  options: QueryOptions = {},
): Promise<ExamSchedule | null> {
  const payload: Update<'exam_schedules'> = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.days_of_week !== undefined) payload.days_of_week = patch.days_of_week
  if (patch.fire_time !== undefined) payload.fire_time = patch.fire_time
  if (patch.template !== undefined) payload.template = toJson(patch.template)
  if (patch.enabled !== undefined) payload.enabled = patch.enabled
  if (patch.tz !== undefined) payload.tz = patch.tz
  if (patch.email_enabled !== undefined) payload.email_enabled = patch.email_enabled
  if (patch.email_time !== undefined) payload.email_time = patch.email_time
  if (patch.email_send_date !== undefined) payload.email_send_date = patch.email_send_date

  const base = db.from('exam_schedules').update(payload).eq('id', id).select(EXAM_SCHEDULE_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'exam.updateExamSchedule' },
  )
  return row ? toExamSchedule(row) : null
}

/** 开考成功后落「今天已处理」; 同一业务日不再重复开考 */
export async function markExamScheduleFired(
  scheduleId: string,
  userId: string,
  date: string,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('exam_schedules').update({ last_fire_date: date }).eq('id', scheduleId).eq('user_id', userId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.markExamScheduleFired' },
  )
}

export async function deleteExamSchedule(scheduleId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('exam_schedules').delete().eq('id', scheduleId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.deleteExamSchedule' },
  )
}

// ── 组卷 RPC ──

/** compose_exam 的入参。null 表示"不限"，区别于空数组（空数组会被当成"没有可选的"） */
export interface ComposeExamInput {
  subjects: string[] | null
  categories: string[] | null
  sections: unknown[]
  types: string[] | null
  sampleMode: string
  orderMode: string
  bankId: string | null
  scopeCategories: string[] | null
  keyPoints: string[] | null
}

export interface ComposeExamResult {
  questionIds: string[]
  stats: ExamComposeStat[]
}

/**
 * 组卷放在这里而不是 lib：它是数据访问（一次 SECURITY DEFINER 的 RPC），
 * 而且服务端函数是唯一的组卷实现 —— 客户端不该有第二条拼 SQL 的路。
 */
export async function composeExam(input: ComposeExamInput, options: QueryOptions = {}): Promise<ComposeExamResult> {
  const args = {
    p_subjects: input.subjects,
    p_categories: input.categories,
    p_sections: toJson(input.sections),
    p_types: input.types,
    p_sample_mode: input.sampleMode,
    p_order_mode: input.orderMode,
    p_bank_id: input.bankId,
    p_scope_categories: input.scopeCategories,
    p_key_points: input.keyPoints,
  }

  // 生成类型把 p_subjects / p_categories 标成必填且非空，但 compose_exam 的 SQL 声明允许 NULL
  // （函数不是 STRICT），传 null 就是"不限"这个语义本身。这里只放宽这两个参数的可空性，
  // 结果类型不受影响 —— 断言留在这一个边界上，不要在调用方到处写。
  const base = db.rpc('compose_exam', args as Database['public']['Functions']['compose_exam']['Args'])
  const data = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'exam.composeExam' },
  )
  return toComposeExamResult(data)
}

/** RPC 返回的是 Json，形状由服务端函数决定 —— 在这里收口成领域类型，读到的脏值当空处理 */
export function toComposeExamResult(raw: unknown): ComposeExamResult {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const ids = Array.isArray(src.question_ids) ? src.question_ids : []
  const sections = Array.isArray(src.sections) ? src.sections : []
  return {
    questionIds: ids.filter((id): id is string => typeof id === 'string'),
    stats: sections.filter((s): s is ExamComposeStat => !!s && typeof s === 'object'),
  }
}
