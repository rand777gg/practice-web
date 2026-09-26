import type { Database, Json } from '@/types/database'
import type { AnswerMode, CaseQuestion, CorrectAnswer, Question, QuestionType, Submission, SubmissionResult, UserAnswer } from '@/types'
import { parseCorrectAnswer } from '@/types'
import { chunkIds } from '@/lib/chunk-ids'
import { db, fetchAll, run, runList, toJson, type Insert, type QueryOptions, type Row, type Update } from './db'
import { assertColumns } from './columns'

/**
 * 练习域的读写: 作答记录、收藏、太简单排除、顺序会话状态、筛选偏好、判题提交、
 * 知识点/学科解读缓存。
 *
 * 列集分两种: 「整行投影」给结果页/笔记页(要渲染整道题), 「窄投影」给统计与挑题
 * (只要几个标量列)。同一个表按用途拆几个集合, 而不是到处 select('*') ——
 * 加一列不会顺手进所有查询, 每个集合都由 assertColumns 在编译期核对覆盖。
 */

// ──────────────────────────── questions(内联投影) ────────────────────────────

/**
 * 内联进作答行的题目。只覆盖作答/错题/笔记页渲染与朗读要读的字段:
 * 编程题工作台用的 test_cases / examples / runtime_config 不在这里 —— 那条路径走题目自己的投影。
 */
export type QuestionSource = Pick<
  Row<'questions'>,
  | 'id'
  | 'question_type'
  | 'question_text'
  | 'options'
  | 'correct_answer'
  | 'category'
  | 'categories'
  | 'subject'
  | 'analysis'
  | 'key_points'
  | 'answer_explanation'
  | 'seq_number'
  | 'created_at'
  | 'created_by'
  | 'verified'
  | 'import_mode'
  | 'allow_unordered'
  | 'unordered_blanks'
  | 'source_page'
  | 'case_questions'
>

export const QUESTION_COLUMNS = assertColumns<QuestionSource>()(
  'id, question_type, question_text, options, correct_answer, category, categories, subject, analysis, key_points, answer_explanation, seq_number, created_at, created_by, verified, import_mode, allow_unordered, unordered_blanks, source_page, case_questions',
)

/** 挑题与筛选只看这几列: 复习池、随机挑题、AI 复盘都拿它认题 */
export type QuestionMetaSource = Pick<Row<'questions'>, 'subject' | 'category' | 'categories' | 'question_type' | 'key_points'>

export const QUESTION_META_COLUMNS = assertColumns<QuestionMetaSource>()('subject, category, categories, question_type, key_points')

/** 内联题目的领域对象: options / categories / case_questions 在这里离开 JSONB */
export interface QuestionMeta {
  subject: string | null
  category: string | null
  categories: string[]
  question_type: QuestionType
  key_points: string | null
}

// ──────────────────────────── user_answers ────────────────────────────

/** 整行投影: 考试续答、考试结果页、我的笔记都要整行 */
export type AnswerSource = Pick<
  Row<'user_answers'>,
  'id' | 'user_id' | 'question_id' | 'selected_answer' | 'is_correct' | 'mode' | 'source' | 'exam_session_id' | 'note' | 'is_public' | 'answered_at'
>

export const ANSWER_COLUMNS = assertColumns<AnswerSource>()(
  'id, user_id, question_id, selected_answer, is_correct, mode, source, exam_session_id, note, is_public, answered_at',
)

/** 收藏页只要"每题最近一条作答"用得到的列 */
export type AnswerListSource = Pick<Row<'user_answers'>, 'id' | 'question_id' | 'selected_answer' | 'is_correct' | 'answered_at' | 'note'>

export const ANSWER_LIST_COLUMNS = assertColumns<AnswerListSource>()('id, question_id, selected_answer, is_correct, answered_at, note')

/** 进度、AI 复盘、遗忘曲线只读这三列 */
export type AnswerStatSource = Pick<Row<'user_answers'>, 'question_id' | 'is_correct' | 'answered_at'>

export const ANSWER_STAT_COLUMNS = assertColumns<AnswerStatSource>()('question_id, is_correct, answered_at')

/** 只问"这道题答过没": 首页完成度、学习路线通过判定 */
export type AnswerQuestionIdSource = Pick<Row<'user_answers'>, 'question_id'>

export const ANSWER_QUESTION_ID_COLUMNS = assertColumns<AnswerQuestionIdSource>()('question_id')

/** 练习页单题的作答统计(次数/错误数/最近笔记) */
export type AnswerQuestionStatsSource = Pick<Row<'user_answers'>, 'is_correct' | 'note' | 'is_public'>

export const ANSWER_QUESTION_STATS_COLUMNS = assertColumns<AnswerQuestionStatsSource>()('is_correct, note, is_public')

const ANSWER_ID_COLUMNS = assertColumns<Pick<Row<'user_answers'>, 'id'>>()('id')

const ANSWER_ANSWERED_AT_COLUMNS = assertColumns<Pick<Row<'user_answers'>, 'answered_at'>>()('answered_at')

/**
 * 内联题目的列集必须写成字面量, 原因有两条:
 *   · 模板字符串拼出来的类型会被 PostgREST 的类型解析器当成普通 string, 整条查询的结果退化成
 *     GenericStringError(字段级检查全失效);
 *   · embed 段带括号和逗号, 整段喂给 assertColumns 会被 SelectKeys 拆出 'questions(id' 这种假列名。
 * 所以字面量只负责包一层 embed 语法, 平铺段与子段各自过 assertColumns, 再用 satisfies 把两者钉死:
 * 任何一边漏加/多加一列, 这里立刻编译失败。
 */
export type AnswerWithQuestionSource = AnswerSource & { questions: QuestionSource | null }

export const ANSWER_WITH_QUESTION_COLUMNS = 'id, user_id, question_id, selected_answer, is_correct, mode, source, exam_session_id, note, is_public, answered_at, questions(id, question_type, question_text, options, correct_answer, category, categories, subject, analysis, key_points, answer_explanation, seq_number, created_at, created_by, verified, import_mode, allow_unordered, unordered_blanks, source_page, case_questions)' satisfies `${typeof ANSWER_COLUMNS}, questions(${typeof QUESTION_COLUMNS})`

export type AnswerWithQuestionMetaSource = AnswerStatSource & { questions: QuestionMetaSource | null }

export const ANSWER_STAT_WITH_QUESTION_COLUMNS = 'question_id, is_correct, answered_at, questions(subject, category, categories, question_type, key_points)' satisfies `${typeof ANSWER_STAT_COLUMNS}, questions(${typeof QUESTION_META_COLUMNS})`

/** 作答行 + 整道题 */
export interface AnswerWithQuestion extends UserAnswer {
  question: Question | null
}

/** 作答行 + 认题所需的题目字段 */
export interface AnswerWithQuestionMeta {
  question_id: string
  is_correct: boolean
  answered_at: string
  question: QuestionMeta | null
}

/** 收藏页的一行作答: 只要最近一条用于回显上次选择 */
export interface AnswerSummary {
  id: string
  question_id: string
  selected_answer: CorrectAnswer
  is_correct: boolean
  answered_at: string
  note: string | null
}

export interface QuestionAnswerStats {
  attempts: number
  wrongs: number
  /** 最近一条带笔记的正文; 没有 = 空串 */
  note: string
  is_public: boolean
}

/**
 * 写入用的作答行: selected_answer 收领域值, JSONB 边界由 toJson 兜。
 *
 * `client_operation_id` 是可选的幂等键（migration Section 100）：离线队列重发同一动作时带上同一个值，
 * 服务端靠 `user_answers_client_operation_id_key` 认出"这条已经写过了"。
 * 在线路径不带它（每次都是一次新的作答，不需要去重）。
 */
export type AnswerInsert = Pick<
  Insert<'user_answers'>,
  'user_id' | 'question_id' | 'is_correct' | 'mode' | 'exam_session_id' | 'source' | 'answered_at'
> & { selected_answer: unknown; client_operation_id?: string | null }

export type AnswerUpdate = Pick<Update<'user_answers'>, 'note' | 'is_public'>

function asAnswerMode(value: string): AnswerMode {
  return value === 'exam' ? 'exam' : 'practice'
}

function asAnswerSource(value: string | null): UserAnswer['source'] {
  if (value === 'sequential') return 'sequential'
  if (value === 'random') return 'random'
  return null
}

/** 枚举列在库里是 TEXT + CHECK, 读回来得收窄成联合类型 */
function asQuestionType(value: string): QuestionType {
  switch (value) {
    case 'single_choice':
    case 'multi_select':
    case 'true_false':
    case 'fill_blank':
    case 'short_answer':
    case 'analysis':
    case 'judge_correct':
    case 'coding':
    case 'case_analysis':
    case 'cloze':
    case 'reading_set':
    case 'sentence_order':
    case 'translation':
    case 'writing':
      return value
    default:
      return 'single_choice'
  }
}

const SUBMISSION_STATUSES = ['pending', 'running', 'accepted', 'wrong_answer', 'runtime_error', 'timeout', 'compile_error'] as const

function asSubmissionStatus(value: string): Submission['status'] {
  for (const status of SUBMISSION_STATUSES) {
    if (value === status) return status
  }
  return 'pending'
}

function toAnswerRow(input: AnswerInsert): Insert<'user_answers'> {
  return { ...input, selected_answer: toJson(input.selected_answer) }
}

/**
 * DB 行 → 领域对象。
 * selected_answer 是 JSONB, 具体形状由题型决定(见 parseCorrectAnswer); 只读作答行的查询
 * 拿不到题型, 只能按领域类型透传 —— 这里是 JSONB 的读边界。
 */
export function toUserAnswer(row: AnswerSource): UserAnswer {
  return {
    id: row.id,
    user_id: row.user_id,
    question_id: row.question_id,
    selected_answer: row.selected_answer as CorrectAnswer,
    is_correct: row.is_correct,
    mode: asAnswerMode(row.mode),
    source: asAnswerSource(row.source),
    exam_session_id: row.exam_session_id,
    note: row.note,
    is_public: row.is_public,
    answered_at: row.answered_at,
  }
}

export function toAnswerSummary(row: AnswerListSource): AnswerSummary {
  return {
    id: row.id,
    question_id: row.question_id,
    selected_answer: row.selected_answer as CorrectAnswer,
    is_correct: row.is_correct,
    answered_at: row.answered_at,
    note: row.note,
  }
}

export function toQuestion(row: QuestionSource): Question {
  const question_type = asQuestionType(row.question_type)
  return {
    id: row.id,
    question_type,
    question_text: row.question_text,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    correct_answer: parseCorrectAnswer(row.correct_answer, question_type),
    category: row.category,
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    subject: row.subject,
    analysis: row.analysis,
    key_points: row.key_points,
    answer_explanation: row.answer_explanation,
    seq_number: row.seq_number,
    created_at: row.created_at,
    created_by: row.created_by,
    verified: row.verified,
    import_mode: row.import_mode,
    allow_unordered: row.allow_unordered,
    unordered_blanks: row.unordered_blanks,
    source_page: row.source_page,
    case_questions: (row.case_questions ?? undefined) as CaseQuestion[] | undefined,
  }
}

export function toQuestionMeta(row: QuestionMetaSource): QuestionMeta {
  return {
    subject: row.subject,
    category: row.category,
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    question_type: asQuestionType(row.question_type),
    key_points: row.key_points,
  }
}

export function toAnswerWithQuestion(row: AnswerWithQuestionSource): AnswerWithQuestion {
  return { ...toUserAnswer(row), question: row.questions ? toQuestion(row.questions) : null }
}

export function toAnswerWithQuestionMeta(row: AnswerWithQuestionMetaSource): AnswerWithQuestionMeta {
  return {
    question_id: row.question_id,
    is_correct: row.is_correct,
    answered_at: row.answered_at,
    question: row.questions ? toQuestionMeta(row.questions) : null,
  }
}

/** 练习/考试作答落一行(追加, 不覆盖历史); 返回新行 id 供笔记等后续操作挂靠 */
export async function insertAnswer(input: AnswerInsert, options: QueryOptions = {}): Promise<string | null> {
  const base = db.from('user_answers').insert(toAnswerRow(input)).select(ANSWER_ID_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'practice.insertAnswer' },
  )
  return row?.id ?? null
}

/** 离线队列回灌: 一次写多行, 不关心返回值 */
export async function insertAnswers(rows: AnswerInsert[], options: QueryOptions = {}): Promise<void> {
  if (rows.length === 0) return
  const base = db.from('user_answers').insert(rows.map(toAnswerRow))
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.insertAnswers' },
  )
}

// ── 提交一次作答（跨表用例，Section 106）──

/**
 * 顺序模式的会话进度。带上它，作答行与进度就在**一个事务**里落库。
 *
 * `save` 只给回退分支用：服务端还没有 `submit_answer` 时（部署顺序是"先发代码、后跑迁移"），
 * 进度得由调用方自己那一次 upsertSequentialState 写 —— 也就是改造前那条路径。
 * 于是这里不需要知道会话状态的完整形状（selected_kps / question_ids 那些仍在 store 里）。
 */
export interface AnswerProgress {
  sessionKey: string
  currentIndex: number
  subjectPositions: Record<string, number>
  save: () => Promise<void>
}

export interface AnswerSubmission {
  questionId: string
  selectedAnswer: unknown
  isCorrect: boolean
  mode: AnswerMode
  source: 'sequential' | 'random' | null
  examSessionId?: string | null
  /** 幂等键：`run` 的自动重试、超时后用户再点一次，都靠它落到同一行（Section 100 的部分唯一索引） */
  clientOperationId?: string | null
  progress?: AnswerProgress | null
}

/**
 * 提交一次练习作答：作答行 + （顺序模式）会话进度，服务端一个事务（migration Section 106）。
 *
 * 为什么值得收敛：原来是前端两次写，第一次成、第二次失败就留下"答案写进去了、进度没推进"，
 * 用户下次进来还停在原来那题。窗口不大（进度在每次翻页/切会话时都会再写，会自愈），但它是
 * 同类问题里最后一个还在前端编排的。
 *
 * 顺带两件事：`user_id` 由服务端取 `auth.uid()`（没有可伪造的参数），以及在线路径终于带上了
 * 幂等键 —— 此前 `client_operation_id` 只给离线队列用，于是"请求超时但服务端其实已经写成"
 * 的时候，`run` 的重试会再插一行。
 *
 * 判分仍然在客户端：`isCorrect` 由调用方算好传进来（理由同 Section 102）。
 */
export async function submitAnswer(input: AnswerSubmission, options: QueryOptions = {}): Promise<string | null> {
  const progress = input.progress ?? null
  // 生成类型把"有 DEFAULT 的可空参数"标成 `?: string`（不接受显式 null），而这里 null 就是
  // "这个参数不参与"的语义本身（不带幂等键、不属于任何场次、不推进进度）。
  // 与 save_learning_route / compose_exam 的处理一致：只在这一个边界上放宽可空性。
  const args = {
    p_question_id: input.questionId,
    p_selected_answer: toJson(input.selectedAnswer),
    p_is_correct: input.isCorrect,
    p_mode: input.mode,
    p_source: input.source,
    p_exam_session_id: input.examSessionId ?? null,
    p_client_operation_id: input.clientOperationId ?? null,
    p_session_key: progress?.sessionKey ?? null,
    p_current_index: progress?.currentIndex ?? null,
    p_subject_positions: progress ? toJson(progress.subjectPositions) : null,
  } as unknown as Database['public']['Functions']['submit_answer']['Args']
  const base = db.rpc('submit_answer', args)
  const rows = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.submitAnswer' },
  )
  return rows?.[0]?.answer_id ?? null
}

/** 考试作答: 同一 (用户, 题目, 场次) 反复保存要覆盖而不是堆行 */
export async function upsertAnswer(input: AnswerInsert, options: QueryOptions = {}): Promise<void> {
  const base = db
    .from('user_answers')
    .upsert(toAnswerRow(input), { onConflict: 'user_id, question_id, exam_session_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.upsertAnswer' },
  )
}

/** 交卷: 一次性把整卷作答覆盖成最终判定(作答中的自动保存已经写过同键行) */
export async function upsertAnswers(rows: AnswerInsert[], options: QueryOptions = {}): Promise<void> {
  if (rows.length === 0) return
  const base = db
    .from('user_answers')
    .upsert(rows.map(toAnswerRow), { onConflict: 'user_id, question_id, exam_session_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.upsertAnswers' },
  )
}

export async function updateAnswer(answerId: string, patch: AnswerUpdate, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_answers').update(patch).eq('id', answerId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.updateAnswer' },
  )
}

export async function deleteAnswer(answerId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_answers').delete().eq('id', answerId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.deleteAnswer' },
  )
}

/**
 * 这批题的全部作答, 按时间倒序。
 * 双层分页: 外层拆 .in()(URL 长度, 见 chunk-ids), 内层翻页(同一批题反复刷很容易超过单次 1000 行),
 * 排序带上 id 做稳定键, 否则翻页会重复或漏行。
 */
export async function fetchAnswersForQuestions(
  userId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<AnswerSummary[]> {
  if (questionIds.length === 0) return []
  const parts = await Promise.all(
    chunkIds(questionIds).map((chunk) =>
      fetchAll(
        (from, to) => {
          const query = db
            .from('user_answers')
            .select(ANSWER_LIST_COLUMNS)
            .eq('user_id', userId)
            .in('question_id', chunk)
            .order('answered_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
          return options.signal ? query.abortSignal(options.signal) : query
        },
        { ...options, context: options.context ?? 'practice.fetchAnswersForQuestions' },
      ),
    ),
  )
  return parts.flat().map(toAnswerSummary)
}

/**
 * 这批题的作答足迹(题目 id / 对错 / 时刻)。和 fetchAnswersForQuestions 的区别是投影与用途:
 * 这里只给"本遍答过没、最新一次是哪天"这类判断用, 所以不取答案内容。
 * since 是各学科里最早的本遍起点: 比它还早的作答过不了本遍门槛, 不用拉。
 * 同样双层分页(URL 长度 + 单次 1000 行), 按 id 稳定翻页。
 */
export async function fetchAnsweredRows(
  userId: string,
  questionIds: string[],
  since: string | null,
  options: QueryOptions = {},
): Promise<AnswerStatSource[]> {
  if (questionIds.length === 0) return []
  const parts = await Promise.all(
    chunkIds(questionIds).map((chunk) =>
      fetchAll(
        (from, to) => {
          let query = db
            .from('user_answers')
            .select(ANSWER_STAT_COLUMNS)
            .eq('user_id', userId)
            .in('question_id', chunk)
          if (since) query = query.gte('answered_at', since)
          const paged = query.order('id').range(from, to)
          return options.signal ? paged.abortSignal(options.signal) : paged
        },
        { ...options, context: options.context ?? 'practice.fetchAnsweredRows' },
      ),
    ),
  )
  return parts.flat()
}

/** 首答时刻: 图表时间轴的第一天从这里开始 */
export async function fetchFirstAnsweredAt(userId: string, options: QueryOptions = {}): Promise<string | null> {
  const base = db.from('user_answers').select(ANSWER_ANSWERED_AT_COLUMNS).eq('user_id', userId).order('answered_at').limit(1)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'practice.fetchFirstAnsweredAt' },
  )
  return row?.answered_at ?? null
}

/** 练习页单题统计: 作答次数、错次、最近一条笔记 */
export async function fetchQuestionAnswerStats(
  userId: string,
  questionId: string,
  options: QueryOptions = {},
): Promise<QuestionAnswerStats> {
  const base = db
    .from('user_answers')
    .select(ANSWER_QUESTION_STATS_COLUMNS)
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .order('answered_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchQuestionAnswerStats' },
  )
  const withNote = rows.find((row) => row.note)
  return {
    attempts: rows.length,
    wrongs: rows.filter((row) => !row.is_correct).length,
    note: withNote?.note ?? '',
    is_public: withNote?.is_public ?? false,
  }
}

/** 复习/错题挑题的池子。limit 是故意留的采样上限(随机挑一道), 不是翻页上限。 */
export async function fetchWrongAnswers(
  userId: string,
  limit: number,
  options: QueryOptions = {},
): Promise<AnswerWithQuestionMeta[]> {
  const base = db
    .from('user_answers')
    .select(ANSWER_STAT_WITH_QUESTION_COLUMNS)
    .eq('user_id', userId)
    .eq('is_correct', false)
    .order('answered_at', { ascending: false })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchWrongAnswers' },
  )
  return rows.map(toAnswerWithQuestionMeta)
}

/**
 * 错题页: 全量错题 + 整道题。
 * 老代码写的是 .limit(1000), PostgREST 单次最多回 1000 行, 超出的静默丢掉, 所以这里翻页取全。
 */
export async function fetchWrongAnswerDetails(
  userId: string,
  mode: AnswerMode | null,
  options: QueryOptions = {},
): Promise<AnswerWithQuestion[]> {
  const rows = await fetchAll(
    (from, to) => {
      let query = db
        .from('user_answers')
        .select(ANSWER_WITH_QUESTION_COLUMNS)
        .eq('user_id', userId)
        .eq('is_correct', false)
      if (mode) query = query.eq('mode', mode)
      const paged = query.order('answered_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
      return options.signal ? paged.abortSignal(options.signal) : paged
    },
    { ...options, context: options.context ?? 'practice.fetchWrongAnswerDetails' },
  )
  return rows.map(toAnswerWithQuestion)
}

/** 我的笔记(公开与否都算), 带整道题 */
export async function fetchMyNotes(
  userId: string,
  limit: number,
  options: QueryOptions = {},
): Promise<AnswerWithQuestion[]> {
  const base = db
    .from('user_answers')
    .select(ANSWER_WITH_QUESTION_COLUMNS)
    .eq('user_id', userId)
    .not('note', 'is', null)
    .order('answered_at', { ascending: false })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchMyNotes' },
  )
  return rows.map(toAnswerWithQuestion)
}

/** 公开笔记池: 所有人的（RLS 只放行 is_public 的行） */
export async function fetchPublicNotes(limit: number, options: QueryOptions = {}): Promise<AnswerWithQuestion[]> {
  const base = db
    .from('user_answers')
    .select(ANSWER_WITH_QUESTION_COLUMNS)
    .eq('is_public', true)
    .order('answered_at', { ascending: false })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchPublicNotes' },
  )
  return rows.map(toAnswerWithQuestion)
}

/** 考试续答: 这场考试已经存过的作答 */
export async function fetchExamAnswers(sessionId: string, options: QueryOptions = {}): Promise<UserAnswer[]> {
  const base = db.from('user_answers').select(ANSWER_COLUMNS).eq('exam_session_id', sessionId).order('answered_at')
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchExamAnswers' },
  )
  return rows.map(toUserAnswer)
}

/** 考试结果页: 作答 + 整道题(未作答的题由调用方另取整卷) */
export async function fetchExamAnswersWithQuestion(
  sessionId: string,
  options: QueryOptions = {},
): Promise<AnswerWithQuestion[]> {
  const base = db
    .from('user_answers')
    .select(ANSWER_WITH_QUESTION_COLUMNS)
    .eq('exam_session_id', sessionId)
    .order('answered_at')
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchExamAnswersWithQuestion' },
  )
  return rows.map(toAnswerWithQuestion)
}

/** AI 复盘用的作答流水; since 为空 = 全部。全量扫描必须翻页, 单次只有 1000 行。 */
export async function fetchAnswerStats(
  userId: string,
  since: string | null,
  options: QueryOptions = {},
): Promise<AnswerStatSource[]> {
  return fetchAll(
    (from, to) => {
      let query = db.from('user_answers').select(ANSWER_STAT_COLUMNS).eq('user_id', userId)
      if (since) query = query.gte('answered_at', since)
      const paged = query.order('answered_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
      return options.signal ? paged.abortSignal(options.signal) : paged
    },
    { ...options, context: options.context ?? 'practice.fetchAnswerStats' },
  )
}

/**
 * 作答历史 + 认题字段: 遗忘曲线、AI 组卷建议按学科/分类/题型聚合时用。
 * 调用方要的是全部历史, 老代码的 .limit(2000) 实际只回 1000 行, 所以翻页取全。
 */
export async function fetchAnswerHistory(
  userId: string,
  options: QueryOptions = {},
): Promise<AnswerWithQuestionMeta[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('user_answers')
        .select(ANSWER_STAT_WITH_QUESTION_COLUMNS)
        .eq('user_id', userId)
        .order('answered_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchAnswerHistory' },
  )
  return rows.map(toAnswerWithQuestionMeta)
}

/** 这个人答过的全部题目 id(去重交给调用方, 它本来就要装 Set) */
export async function fetchAnsweredQuestionIds(userId: string, options: QueryOptions = {}): Promise<string[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db.from('user_answers').select(ANSWER_QUESTION_ID_COLUMNS).eq('user_id', userId).order('id').range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchAnsweredQuestionIds' },
  )
  return rows.map((row) => row.question_id)
}

/** 这批题里答过的(任何对错都算, 分析题无法自动判分) */
export async function fetchAnsweredQuestionIdsFor(
  userId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<string[]> {
  if (questionIds.length === 0) return []
  const parts = await Promise.all(
    chunkIds(questionIds).map((chunk) =>
      fetchAll(
        (from, to) => {
          const query = db
            .from('user_answers')
            .select(ANSWER_QUESTION_ID_COLUMNS)
            .eq('user_id', userId)
            .in('question_id', chunk)
            .order('id')
            .range(from, to)
          return options.signal ? query.abortSignal(options.signal) : query
        },
        { ...options, context: options.context ?? 'practice.fetchAnsweredQuestionIdsFor' },
      ),
    ),
  )
  return parts.flat().map((row) => row.question_id)
}

/** 这批题里答对过的 */
export async function fetchCorrectQuestionIdsFor(
  userId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<string[]> {
  if (questionIds.length === 0) return []
  const parts = await Promise.all(
    chunkIds(questionIds).map((chunk) =>
      fetchAll(
        (from, to) => {
          const query = db
            .from('user_answers')
            .select(ANSWER_QUESTION_ID_COLUMNS)
            .eq('user_id', userId)
            .eq('is_correct', true)
            .in('question_id', chunk)
            .order('id')
            .range(from, to)
          return options.signal ? query.abortSignal(options.signal) : query
        },
        { ...options, context: options.context ?? 'practice.fetchCorrectQuestionIdsFor' },
      ),
    ),
  )
  return parts.flat().map((row) => row.question_id)
}

// ──────────────────────────── favorites ────────────────────────────

export type FavoriteSource = Pick<Row<'favorites'>, 'question_id' | 'created_at'>

export const FAVORITE_COLUMNS = assertColumns<FavoriteSource>()('question_id, created_at')

export type FavoriteWithQuestionSource = FavoriteSource & { questions: QuestionMetaSource | null }

export const FAVORITE_WITH_QUESTION_COLUMNS = 'question_id, created_at, questions(subject, category, categories, question_type, key_points)' satisfies `${typeof FAVORITE_COLUMNS}, questions(${typeof QUESTION_META_COLUMNS})`

export interface FavoriteWithQuestion {
  question_id: string
  created_at: string
  question: QuestionMeta | null
}

export function toFavoriteWithQuestion(row: FavoriteWithQuestionSource): FavoriteWithQuestion {
  return {
    question_id: row.question_id,
    created_at: row.created_at,
    question: row.questions ? toQuestionMeta(row.questions) : null,
  }
}

/** 收藏题 id, 按收藏时间倒序。收藏可以上千条, 翻页取全。 */
export async function fetchFavoriteQuestionIds(userId: string, options: QueryOptions = {}): Promise<string[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('favorites')
        .select(FAVORITE_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchFavoriteQuestionIds' },
  )
  return rows.map((row) => row.question_id)
}

/** 收藏 + 认题字段: 按学科/分类/题型/知识点挑一道收藏题 */
export async function fetchFavoritesWithQuestion(
  userId: string,
  limit: number,
  options: QueryOptions = {},
): Promise<FavoriteWithQuestion[]> {
  const base = db
    .from('favorites')
    .select(FAVORITE_WITH_QUESTION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchFavoritesWithQuestion' },
  )
  return rows.map(toFavoriteWithQuestion)
}

/** 收藏是切换语义: 再点一次不该因为唯一键冲突报错 */
export async function addFavorite(userId: string, questionId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('favorites').upsert({ user_id: userId, question_id: questionId }, { onConflict: 'user_id, question_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.addFavorite' },
  )
}

/** 取消收藏: 没有这一行也算成功 */
export async function removeFavorite(userId: string, questionId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('favorites').delete().eq('user_id', userId).eq('question_id', questionId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.removeFavorite' },
  )
}

// ──────────────────────────── user_excluded_questions ────────────────────────────

export type ExcludedSource = Pick<Row<'user_excluded_questions'>, 'question_id'>

export const EXCLUDED_QUESTION_ID_COLUMNS = assertColumns<ExcludedSource>()('question_id')

/** 这个用户标成"太简单"的全部题 id */
export async function fetchExcludedQuestionIds(userId: string, options: QueryOptions = {}): Promise<string[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('user_excluded_questions')
        .select(EXCLUDED_QUESTION_ID_COLUMNS)
        .eq('user_id', userId)
        .order('question_id')
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchExcludedQuestionIds' },
  )
  return rows.map((row) => row.question_id)
}

/**
 * 这批题里有几道被排除。
 * 老代码用 `.select(count: 'exact', head: true)`, 但 run 只回 data(行数据), 计数拿不到 ——
 * 所以这里读 question_id 自己数, 也顺便按 chunkIds 拆开避免 URL 过长。
 */
export async function countExcludedQuestions(
  userId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<number> {
  if (questionIds.length === 0) return 0
  const parts = await Promise.all(
    chunkIds(questionIds).map((chunk) =>
      fetchAll(
        (from, to) => {
          const query = db
            .from('user_excluded_questions')
            .select(EXCLUDED_QUESTION_ID_COLUMNS)
            .eq('user_id', userId)
            .in('question_id', chunk)
            .order('question_id')
            .range(from, to)
          return options.signal ? query.abortSignal(options.signal) : query
        },
        { ...options, context: options.context ?? 'practice.countExcludedQuestions' },
      ),
    ),
  )
  return parts.reduce((sum, rows) => sum + rows.length, 0)
}

/** 标记"太简单": 重复标记是幂等的 */
export async function excludeQuestion(userId: string, questionId: string, options: QueryOptions = {}): Promise<void> {
  const base = db
    .from('user_excluded_questions')
    .upsert({ user_id: userId, question_id: questionId }, { onConflict: 'user_id, question_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.excludeQuestion' },
  )
}

/** 恢复这批题(单个恢复也走这里) */
export async function removeExcludedQuestions(
  userId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<void> {
  for (const chunk of chunkIds(questionIds)) {
    const base = db.from('user_excluded_questions').delete().eq('user_id', userId).in('question_id', chunk)
    await run(
      () => (options.signal ? base.abortSignal(options.signal) : base),
      { ...options, context: options.context ?? 'practice.removeExcludedQuestions' },
    )
  }
}

export async function removeExcludedQuestion(userId: string, questionId: string, options: QueryOptions = {}): Promise<void> {
  await removeExcludedQuestions(userId, [questionId], { ...options, context: options.context ?? 'practice.removeExcludedQuestion' })
}

// ──────────────────────────── practice_sequential_state ────────────────────────────

/** 顺序学习会话: 主键 (user_id, session_key), 一台设备一套进度, 靠 realtime 同步 */
export type SequentialStateSource = Pick<
  Row<'practice_sequential_state'>,
  'session_key' | 'selected_kps' | 'plan_subjects' | 'question_ids' | 'current_index' | 'subject_positions' | 'short_id' | 'updated_at' | 'created_at'
>

export const SEQUENTIAL_STATE_COLUMNS = assertColumns<SequentialStateSource>()(
  'session_key, selected_kps, plan_subjects, question_ids, current_index, subject_positions, short_id, updated_at, created_at',
)

const SEQUENTIAL_SHORT_ID_COLUMNS = assertColumns<Pick<SequentialStateSource, 'short_id'>>()('short_id')

const SEQUENTIAL_SESSION_KEY_COLUMNS = assertColumns<Pick<SequentialStateSource, 'session_key'>>()('session_key')

export interface SequentialState {
  session_key: string
  selected_kps: string[]
  plan_subjects: string[]
  question_ids: string[]
  current_index: number
  subject_positions: Record<string, number>
  short_id: string | null
  updated_at: string
  created_at: string
}

/** 写侧: 省略 plan_subjects 等字段 = 不动数据库里已有的值 */
export type SequentialStateInput = Pick<
  Insert<'practice_sequential_state'>,
  'user_id' | 'session_key' | 'selected_kps' | 'plan_subjects' | 'question_ids' | 'current_index'
> & { subject_positions: Record<string, number> }

/** subject_positions 是 JSONB: 只留数字, 坏数据不该把整条会话状态带塌 */
function toSubjectPositions(raw: Json | null): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [subject, position] of Object.entries(raw)) {
    if (typeof position === 'number') out[subject] = position
  }
  return out
}

export function toSequentialState(row: SequentialStateSource): SequentialState {
  return {
    session_key: row.session_key,
    selected_kps: row.selected_kps ?? [],
    plan_subjects: row.plan_subjects ?? [],
    question_ids: row.question_ids ?? [],
    current_index: row.current_index,
    subject_positions: toSubjectPositions(row.subject_positions),
    short_id: row.short_id,
    updated_at: row.updated_at,
    created_at: row.created_at,
  }
}

/**
 * 保存会话进度。updated_at 由这里写: 会话列表按它排序、realtime 也按它判新旧,
 * 漏写会让跨设备的进度看起来一直没变(表上没有 set_updated_at 触发器)。
 */
export async function upsertSequentialState(input: SequentialStateInput, options: QueryOptions = {}): Promise<void> {
  const base = db.from('practice_sequential_state').upsert({
    ...input,
    subject_positions: toJson(input.subject_positions),
    updated_at: new Date().toISOString(),
  })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.upsertSequentialState' },
  )
}

/** 会话列表(按最近更新倒序) */
export async function fetchSequentialStates(userId: string, options: QueryOptions = {}): Promise<SequentialState[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('practice_sequential_state')
        .select(SEQUENTIAL_STATE_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('session_key')
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchSequentialStates' },
  )
  return rows.map(toSequentialState)
}

/** 取某个会话的分享短 id */
export async function fetchSequentialShortId(userId: string, sessionKey: string, options: QueryOptions = {}): Promise<string | null> {
  const base = db
    .from('practice_sequential_state')
    .select(SEQUENTIAL_SHORT_ID_COLUMNS)
    .eq('user_id', userId)
    .eq('session_key', sessionKey)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'practice.fetchSequentialShortId' },
  )
  return row?.short_id ?? null
}

/** 深链 ?session=<shortId> 还原: 短 id → 会话 key */
export async function fetchSequentialSessionKeyByShortId(userId: string, shortId: string, options: QueryOptions = {}): Promise<string | null> {
  const base = db
    .from('practice_sequential_state')
    .select(SEQUENTIAL_SESSION_KEY_COLUMNS)
    .eq('user_id', userId)
    .eq('short_id', shortId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'practice.fetchSequentialSessionKeyByShortId' },
  )
  return row?.session_key ?? null
}

export async function deleteSequentialState(userId: string, sessionKey: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('practice_sequential_state').delete().eq('user_id', userId).eq('session_key', sessionKey)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.deleteSequentialState' },
  )
}

// ──────────────────────────── practice_daily_assignments ────────────────────────────

/** 每日任务分配行。写侧在服务端, 客户端目前只有这一条读路径。 */
export type DailyAssignmentSource = Pick<
  Row<'practice_daily_assignments'>,
  'id' | 'assign_date' | 'subject' | 'kp_plan' | 'qids' | 'goal_count' | 'carry_count' | 'review_count' | 'completed_at' | 'created_at' | 'updated_at'
>

export const DAILY_ASSIGNMENT_COLUMNS = assertColumns<DailyAssignmentSource>()(
  'id, assign_date, subject, kp_plan, qids, goal_count, carry_count, review_count, completed_at, created_at, updated_at',
)

export interface DailyAssignment {
  id: string
  assign_date: string
  subject: string
  /** 知识点分配计划(JSONB 数组)。元素形状还没有读写方, 原样透出。 */
  kp_plan: Json[]
  qids: string[]
  goal_count: number
  carry_count: number
  review_count: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export function toDailyAssignment(row: DailyAssignmentSource): DailyAssignment {
  return {
    id: row.id,
    assign_date: row.assign_date,
    subject: row.subject,
    kp_plan: Array.isArray(row.kp_plan) ? row.kp_plan : [],
    qids: row.qids ?? [],
    goal_count: row.goal_count,
    carry_count: row.carry_count,
    review_count: row.review_count,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** 每日任务分配, 新的在前 */
export async function fetchDailyAssignments(userId: string, options: QueryOptions = {}): Promise<DailyAssignment[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('practice_daily_assignments')
        .select(DAILY_ASSIGNMENT_COLUMNS)
        .eq('user_id', userId)
        .order('assign_date', { ascending: false })
        .order('subject')
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchDailyAssignments' },
  )
  return rows.map(toDailyAssignment)
}

// ──────────────────────────── user_preferences ────────────────────────────

export type UserPreferencesSource = Pick<Row<'user_preferences'>, 'practice_filters'>

export const USER_PREFERENCES_COLUMNS = assertColumns<UserPreferencesSource>()('practice_filters')

/**
 * 练习筛选器。返回的是原样的 JSONB: 这份结构由练习页自己定义和演进,
 * 服务层没有权威形状可以照着窄化, 硬写一份镜像类型只会在两边漂移。
 */
export async function fetchPracticeFilters(userId: string, options: QueryOptions = {}): Promise<Json | null> {
  const base = db.from('user_preferences').select(USER_PREFERENCES_COLUMNS).eq('user_id', userId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'practice.fetchPracticeFilters' },
  )
  return row?.practice_filters ?? null
}

/** 写筛选器: 表上有 set_updated_at 触发器, 这里不用自己写 updated_at */
export async function savePracticeFilters(userId: string, filters: unknown, options: QueryOptions = {}): Promise<void> {
  const base = db
    .from('user_preferences')
    .upsert({ user_id: userId, practice_filters: toJson(filters) }, { onConflict: 'user_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.savePracticeFilters' },
  )
}

// ──────────────────────────── submissions ────────────────────────────

/** 判题记录列表项(工作台的历史记录面板) */
export type SubmissionRecordSource = Pick<Row<'submissions'>, 'id' | 'status' | 'language' | 'execution_time_ms' | 'created_at'>

export const SUBMISSION_RECORD_COLUMNS = assertColumns<SubmissionRecordSource>()('id, status, language, execution_time_ms, created_at')

export interface SubmissionRecord {
  id: string
  status: Submission['status']
  language: string
  execution_time_ms: number | null
  created_at: string
}

/** 写入用的判题记录: results 收领域数组, JSONB 边界由 toJson 兜 */
export type SubmissionInsert = Pick<
  Insert<'submissions'>,
  'user_id' | 'question_id' | 'code' | 'language' | 'status' | 'error' | 'execution_time_ms' | 'judge_source'
> & { results: SubmissionResult[] | null }

export function toSubmissionRecord(row: SubmissionRecordSource): SubmissionRecord {
  return {
    id: row.id,
    status: asSubmissionStatus(row.status),
    language: row.language,
    execution_time_ms: row.execution_time_ms,
    created_at: row.created_at,
  }
}

export async function insertSubmission(input: SubmissionInsert, options: QueryOptions = {}): Promise<void> {
  const base = db.from('submissions').insert({ ...input, results: toJson(input.results) })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.insertSubmission' },
  )
}

/** 某道题最近的几次判题记录 */
export async function fetchQuestionSubmissions(
  userId: string,
  questionId: string,
  limit: number,
  options: QueryOptions = {},
): Promise<SubmissionRecord[]> {
  const base = db
    .from('submissions')
    .select(SUBMISSION_RECORD_COLUMNS)
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.fetchQuestionSubmissions' },
  )
  return rows.map(toSubmissionRecord)
}

// ──────────────────────────── 解读缓存 ────────────────────────────

export type KpExplanationSource = Pick<Row<'kp_explanations'>, 'subject' | 'kp' | 'content' | 'updated_at'>

export const KP_EXPLANATION_COLUMNS = assertColumns<KpExplanationSource>()('subject, kp, content, updated_at')

const KP_EXPLANATION_CONTENT_COLUMNS = assertColumns<Pick<KpExplanationSource, 'content'>>()('content')

export interface KpExplanation {
  subject: string
  kp: string
  content: string
  updated_at: string
}

export function toKpExplanation(row: KpExplanationSource): KpExplanation {
  return { subject: row.subject, kp: row.kp, content: row.content, updated_at: row.updated_at }
}

/** 全表解读(内容缓存, 一次拉完供前端按 (学科, 知识点) 建索引) */
export async function fetchKpExplanations(options: QueryOptions = {}): Promise<KpExplanation[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db
        .from('kp_explanations')
        .select(KP_EXPLANATION_COLUMNS)
        .order('subject')
        .order('kp')
        .range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchKpExplanations' },
  )
  return rows.map(toKpExplanation)
}

/** 单条解读正文; 没有这条解读返回空串(调用方只用它决定要不要显示正文块) */
export async function fetchKpExplanationContent(subject: string, kp: string, options: QueryOptions = {}): Promise<string> {
  const base = db.from('kp_explanations').select(KP_EXPLANATION_CONTENT_COLUMNS).eq('subject', subject).eq('kp', kp)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'practice.fetchKpExplanationContent' },
  )
  return row?.content ?? ''
}

export async function saveKpExplanation(subject: string, kp: string, content: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('kp_explanations').upsert(
    { subject, kp, content, updated_at: new Date().toISOString() },
    { onConflict: 'subject, kp' },
  )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.saveKpExplanation' },
  )
}

/** 清空正文 = 删掉解读, 依据与真题由外键级联删除 */
export async function deleteKpExplanation(subject: string, kp: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('kp_explanations').delete().eq('subject', subject).eq('kp', kp)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.deleteKpExplanation' },
  )
}

export type SubjectExplanationSource = Pick<Row<'subject_explanations'>, 'subject' | 'content' | 'updated_at'>

export const SUBJECT_EXPLANATION_COLUMNS = assertColumns<SubjectExplanationSource>()('subject, content, updated_at')

export interface SubjectExplanation {
  subject: string
  content: string
  updated_at: string
}

export function toSubjectExplanation(row: SubjectExplanationSource): SubjectExplanation {
  return { subject: row.subject, content: row.content, updated_at: row.updated_at }
}

/** 全表学科解读(内容缓存) */
export async function fetchSubjectExplanations(options: QueryOptions = {}): Promise<SubjectExplanation[]> {
  const rows = await fetchAll(
    (from, to) => {
      const query = db.from('subject_explanations').select(SUBJECT_EXPLANATION_COLUMNS).order('subject').range(from, to)
      return options.signal ? query.abortSignal(options.signal) : query
    },
    { ...options, context: options.context ?? 'practice.fetchSubjectExplanations' },
  )
  return rows.map(toSubjectExplanation)
}

export async function saveSubjectExplanation(subject: string, content: string, options: QueryOptions = {}): Promise<void> {
  const base = db
    .from('subject_explanations')
    .upsert({ subject, content, updated_at: new Date().toISOString() }, { onConflict: 'subject' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.saveSubjectExplanation' },
  )
}

export async function deleteSubjectExplanation(subject: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('subject_explanations').delete().eq('subject', subject)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'practice.deleteSubjectExplanation' },
  )
}
