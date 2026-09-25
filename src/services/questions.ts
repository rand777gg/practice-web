/**
 * 题库域的数据访问层（questions / question_meta_cache / question_drafts / question_source_links /
 * kp_question_map / kp_question_refs / question_banks / question_bank_items / question_bank_papers，
 * 以及查重的 question_dup_cache / question_dup_reviews / question_merge_log）。
 *
 * 三种东西：列集常量（由 assertColumns 在编译期核对 mapper 要读的字段）、行 → 领域对象的 mapper、
 * 一层薄薄的查询函数。JSONB 全部在这里归一化 —— 同一列在两个页面各解析一遍，漂移只会表现为
 * 某个页面上字段变成 undefined，而且往往只在特定题型分支里出现。
 *
 * question_dup_cache / question_dup_reviews / question_merge_log 三张表开了 RLS 却没有任何策略，
 * 客户端连 SELECT 都做不到：它们只由 SECURITY DEFINER 的 RPC（scan_question_duplicates /
 * merge_dup_group / merge_dup_questions / keep_dup_group / save_dup_review）读写。
 * 所以这一域唯一的访问口子就是文件末尾那几个 RPC 包装 —— 别在这里加 .from('question_dup_*')。
 */
import type { Json } from '@/types/database'
import { parseCorrectAnswer } from '@/types'
import type {
  BankPaperKind,
  BankPaperScopeType,
  CaseQuestion,
  CorrectAnswer,
  ExamTemplate,
  ExampleCase,
  Question,
  QuestionBankPaper,
  QuestionDraft,
  QuestionInput,
  QuestionType,
  RuntimeConfig,
  TestCase,
} from '@/types'
import type { WritingChart } from '@/lib/english-paper-layout'
import type { QuestionPaper } from '@/lib/exam-paper'
import type { TriageRow } from '@/lib/experience-parse'
import type { KpQuestionDraft, KpQuestionLink, LinkedQuestion } from '@/lib/kp-question-refs'
import type { QuestionLinkDraft, QuestionSourceLink } from '@/lib/question-links'
import type { RagSource } from '@/lib/rag'
import { naturalSort } from '@/lib/utils'
import { normalizeTemplate } from '@/stores/exam-template-store'
import { assertColumns } from './columns'
import { AppError } from './errors'
import { db, fetchAll, fetchInChunks, run, runList, toJson, type Insert, type QueryOptions, type Row, type Update } from './db'

/** .single() 的类型是 T | null（真的没行时 PostgREST 回 PGRST116, run 已经抛错），这里只是把类型收窄回 T */
function requiredRow<T>(row: T | null, context: string): T {
  if (!row) throw new AppError({ kind: 'not_found', message: context })
  return row
}

// ── JSONB 归一化 ──

function jsonRecord(raw: Json | null | undefined): Record<string, Json> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, Json>) : null
}

function jsonString(raw: Json | null | undefined): string | null {
  return typeof raw === 'string' ? raw : null
}

function jsonNumber(raw: Json | null | undefined, fallback: number): number {
  return typeof raw === 'number' ? raw : fallback
}

function jsonBoolean(raw: Json | null | undefined): boolean {
  return raw === true
}

/** 库里 question_type 是 TEXT，这里只做窄化，不做白名单校验（取值由库里的 CHECK 约束保证） */
function asQuestionType(value: string): QuestionType {
  return value as QuestionType
}

function asIssueFlag(value: string): 'none' | 'suspected' | 'confirmed' {
  return value === 'suspected' || value === 'confirmed' ? value : 'none'
}

function asExecutionMode(value: Json | null | undefined): 'stdio' | 'function' | undefined {
  return value === 'stdio' || value === 'function' ? value : undefined
}

function toStringArray(raw: Json | null | undefined): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string')
}

function toNumberArray(raw: Json | null | undefined): number[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.filter((v): v is number => typeof v === 'number')
  return out.length > 0 ? out : null
}

function toTestCases(raw: Json | null): TestCase[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: TestCase[] = []
  for (const item of raw) {
    const c = jsonRecord(item)
    if (!c) continue
    out.push({ input: String(c.input ?? ''), expected: String(c.expected ?? '') })
  }
  return out.length > 0 ? out : undefined
}

function toExamples(raw: Json | null): ExampleCase[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ExampleCase[] = []
  for (const item of raw) {
    const c = jsonRecord(item)
    if (!c) continue
    out.push({
      input: String(c.input ?? ''),
      expected: String(c.expected ?? ''),
      explanation: jsonString(c.explanation) ?? undefined,
    })
  }
  return out.length > 0 ? out : undefined
}

function toRuntimeConfig(raw: Json | null): RuntimeConfig | undefined {
  const c = jsonRecord(raw)
  if (!c) return undefined
  const config: RuntimeConfig = {}
  if (typeof c.timeout_ms === 'number') config.timeout_ms = c.timeout_ms
  if (typeof c.memory_mb === 'number') config.memory_mb = c.memory_mb
  return Object.keys(config).length > 0 ? config : undefined
}

/** 小题 id 就是卷面题号，缺 id 的小题等于没法上答题卡，所以宁可丢掉也不留半条 */
function toCaseQuestions(raw: Json | null, fallbackType: QuestionType): CaseQuestion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: CaseQuestion[] = []
  for (const item of raw) {
    const q = jsonRecord(item)
    if (!q) continue
    const type = jsonString(q.type) ? asQuestionType(jsonString(q.type)!) : fallbackType
    out.push({
      id: jsonString(q.id) ?? '',
      type,
      text: jsonString(q.text) ?? '',
      options: toStringArray(q.options),
      answer: parseCorrectAnswer(q.answer, type),
    })
  }
  return out.length > 0 ? out : undefined
}

function toWritingCharts(raw: Json | null | undefined): WritingChart[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: WritingChart[] = []
  for (const item of raw) {
    const c = jsonRecord(item)
    if (!c) continue
    const items: { label: string; value: number }[] = []
    if (Array.isArray(c.items)) {
      for (const point of c.items) {
        const p = jsonRecord(point)
        if (!p || typeof p.label !== 'string') continue
        items.push({ label: p.label, value: jsonNumber(p.value, 0) })
      }
    }
    out.push({ kind: c.kind === 'bar' ? 'bar' : 'pie', title: jsonString(c.title) ?? undefined, items })
  }
  return out.length > 0 ? out : undefined
}

function toPaperParagraphs(raw: Json | null | undefined): { letter: string; text: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: { letter: string; text: string }[] = []
  for (const item of raw) {
    const p = jsonRecord(item)
    if (!p) continue
    out.push({ letter: jsonString(p.letter) ?? '', text: jsonString(p.text) ?? '' })
  }
  return out.length > 0 ? out : undefined
}

/** paper 是卷面素材，四个标题字段是渲染时的必需项，缺了会渲染出 undefined */
function toQuestionPaper(raw: Json | null): QuestionPaper | null {
  const p = jsonRecord(raw)
  if (!p) return null
  const skeleton = Array.isArray(p.skeleton)
    ? p.skeleton.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    : undefined
  return {
    paperTitle: jsonString(p.paperTitle) ?? '',
    ordinal: jsonString(p.ordinal) ?? '',
    sectionTitle: jsonString(p.sectionTitle) ?? '',
    directions: jsonString(p.directions) ?? '',
    passage: jsonString(p.passage) ?? undefined,
    heading: jsonString(p.heading) ?? undefined,
    paragraphs: toPaperParagraphs(p.paragraphs),
    placed: Array.isArray(p.placed) ? p.placed.filter((v): v is string => typeof v === 'string') : undefined,
    skeleton: skeleton && skeleton.length > 0 ? skeleton : undefined,
    letterBox: jsonString(p.letterBox) ?? undefined,
    charts: toWritingCharts(p.charts),
    chartCaption: jsonString(p.chartCaption) ?? undefined,
  }
}

// ── questions ──

/** 题目详情要读的字段；字段名与可空性照抄 questions 的生成类型 */
export type QuestionSource = {
  id: string
  question_type: string
  question_text: string
  options: Json
  correct_answer: Json | null
  category: string | null
  categories: Json | null
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
  test_cases: Json | null
  runtime_config: Json | null
  execution_mode: string | null
  examples: Json | null
  case_questions: Json | null
  paper: Json | null
  issue_flag: string
  issue_note: string | null
  flagged_at: string | null
  updated_at: string
}

/** 题目详情字段集：练习 / 考试 / 编排 / 收藏 / 编辑页都按这一份读 */
export const QUESTION_COLUMNS = assertColumns<QuestionSource>()(
  'id, question_type, question_text, options, correct_answer, category, categories, subject, analysis, key_points, answer_explanation, seq_number, created_at, created_by, verified, import_mode, allow_unordered, unordered_blanks, source_page, test_cases, runtime_config, execution_mode, examples, case_questions, paper, issue_flag, issue_note, flagged_at, updated_at',
)

/** 列表/挑题只要这几列：详情里的 analysis / answer_explanation / correct_answer 一条都不下发 */
export type QuestionListSource = Pick<
  QuestionSource,
  'id' | 'question_type' | 'question_text' | 'subject' | 'category' | 'categories' | 'key_points' | 'import_mode' | 'source_page' | 'issue_flag' | 'issue_note' | 'verified'
>

export const QUESTION_LIST_COLUMNS = assertColumns<QuestionListSource>()(
  'id, question_type, question_text, subject, category, categories, key_points, import_mode, source_page, issue_flag, issue_note, verified',
)

export const QUESTION_ID_COLUMNS = assertColumns<Pick<QuestionSource, 'id'>>()('id')

/** 整库扫一遍用的元数据列：筛选选项、学科分布、分类/知识点统计都从这一份算 */
export type QuestionMetaSource = Pick<
  Row<'questions'>,
  'id' | 'subject' | 'question_type' | 'category' | 'categories' | 'key_points' | 'item_count'
>

export const QUESTION_META_COLUMNS = assertColumns<QuestionMetaSource>()(
  'id, subject, question_type, category, categories, key_points, item_count',
)

/** 离线练习缓存：不含 analysis / key_points / answer_explanation，省掉约 60% 流量 */
export type QuestionOfflineSource = Pick<
  QuestionSource,
  'id' | 'question_type' | 'question_text' | 'options' | 'correct_answer' | 'category' | 'categories' | 'subject' | 'seq_number' | 'created_at' | 'updated_at' | 'created_by' | 'verified' | 'import_mode' | 'allow_unordered'
>

export const QUESTION_OFFLINE_COLUMNS = assertColumns<QuestionOfflineSource>()(
  'id, question_type, question_text, options, correct_answer, category, categories, subject, seq_number, created_at, updated_at, created_by, verified, import_mode, allow_unordered',
)

export const QUESTION_KEY_POINT_COLUMNS = assertColumns<Pick<QuestionSource, 'key_points'>>()('key_points')

/** 按学科取分类清单：分类既可能写在 category 也可能在 categories 里，两列都得读 */
export type QuestionCategorySource = Pick<QuestionSource, 'category' | 'categories'>

export const QUESTION_CATEGORY_COLUMNS = assertColumns<QuestionCategorySource>()('category, categories')

/** 按知识点捞题（顺序练习按 KP 增量拉题）要的四列 */
export type QuestionKpLookupSource = Pick<QuestionSource, 'id' | 'subject' | 'key_points' | 'seq_number'>

export const QUESTION_KP_LOOKUP_COLUMNS = assertColumns<QuestionKpLookupSource>()('id, subject, key_points, seq_number')

/** 信源/知识点解读里的「相关真题」只带这几列（对应 lib/kp-question-refs 的 LinkedQuestion） */
export type QuestionLinkedSource = Pick<
  QuestionSource,
  'id' | 'question_type' | 'question_text' | 'options' | 'correct_answer' | 'subject' | 'category' | 'categories' | 'analysis' | 'answer_explanation'
>

export const QUESTION_LINKED_COLUMNS = assertColumns<QuestionLinkedSource>()(
  'id, question_type, question_text, options, correct_answer, subject, category, categories, analysis, answer_explanation',
)

/** DB 行 → 领域对象。JSONB 与 string-instead-of-enum 都在这里收口，UI 层不再各自 parse。 */
export function toQuestion(row: QuestionSource): Question {
  const questionType = asQuestionType(row.question_type)
  return {
    id: row.id,
    question_type: questionType,
    question_text: row.question_text,
    options: toStringArray(row.options),
    correct_answer: parseCorrectAnswer(row.correct_answer, questionType),
    category: row.category,
    categories: toStringArray(row.categories),
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
    test_cases: toTestCases(row.test_cases),
    runtime_config: toRuntimeConfig(row.runtime_config),
    execution_mode: asExecutionMode(row.execution_mode),
    examples: toExamples(row.examples),
    case_questions: toCaseQuestions(row.case_questions, questionType),
    paper: toQuestionPaper(row.paper),
    issue_flag: asIssueFlag(row.issue_flag),
    issue_note: row.issue_note,
    flagged_at: row.flagged_at,
  }
}

/** 列表行 → 精简领域对象；分类列在库里可能只有 category 有值，这里合成一份 */
export type QuestionListItem = Pick<
  Question,
  'id' | 'question_type' | 'question_text' | 'subject' | 'category' | 'categories' | 'key_points' | 'import_mode' | 'source_page' | 'issue_flag' | 'issue_note' | 'verified'
>

export function toQuestionListItem(row: QuestionListSource): QuestionListItem {
  return {
    id: row.id,
    question_type: asQuestionType(row.question_type),
    question_text: row.question_text,
    subject: row.subject,
    category: row.category,
    categories: toStringArray(row.categories),
    key_points: row.key_points,
    import_mode: row.import_mode,
    source_page: row.source_page,
    issue_flag: asIssueFlag(row.issue_flag),
    issue_note: row.issue_note,
    verified: row.verified,
  }
}

export interface QuestionMetaRow {
  id: string
  subject: string | null
  questionType: QuestionType
  category: string | null
  categories: string[]
  keyPoints: string | null
  /** 库里按小题口径算好的生成列（完形整篇 = 20 空）；缺省按 1 计 */
  itemCount: number
}

export function toQuestionMetaRow(row: QuestionMetaSource): QuestionMetaRow {
  const categories = toStringArray(row.categories)
  return {
    id: row.id,
    subject: row.subject,
    questionType: asQuestionType(row.question_type),
    category: row.category,
    // 分类可能只写在 category 上（旧数据），两个都空的题就是「未分类」
    categories: categories.length > 0 ? categories : row.category ? [row.category] : [],
    keyPoints: row.key_points,
    itemCount: row.item_count ?? 1,
  }
}

export function toLinkedQuestion(row: QuestionLinkedSource): LinkedQuestion {
  const questionType = asQuestionType(row.question_type)
  return {
    id: row.id,
    questionType,
    questionText: row.question_text,
    options: toStringArray(row.options),
    correctAnswer: parseCorrectAnswer(row.correct_answer, questionType),
    subject: row.subject,
    category: row.category,
    categories: toStringArray(row.categories),
    analysis: row.analysis,
    answerExplanation: row.answer_explanation,
  }
}

/**
 * 领域字段 → 落库字段。只在入参出现过的字段才写进去（undefined = 不改），
 * JSONB 一律过 toJson —— 这是全应用唯一的领域对象 → Json 的转换点。
 */
export function toQuestionWrite(patch: Partial<QuestionInput>): Update<'questions'> {
  const row: Update<'questions'> = {}
  if (patch.question_type !== undefined) row.question_type = patch.question_type
  if (patch.question_text !== undefined) row.question_text = patch.question_text
  if (patch.options !== undefined) row.options = toJson(patch.options)
  if (patch.correct_answer !== undefined) row.correct_answer = toJson(patch.correct_answer)
  if (patch.category !== undefined) row.category = patch.category
  if (patch.categories !== undefined) row.categories = toJson(patch.categories)
  if (patch.subject !== undefined) row.subject = patch.subject
  if (patch.analysis !== undefined) row.analysis = patch.analysis
  if (patch.key_points !== undefined) row.key_points = patch.key_points
  if (patch.answer_explanation !== undefined) row.answer_explanation = patch.answer_explanation
  if (patch.seq_number !== undefined) row.seq_number = patch.seq_number
  if (patch.verified !== undefined) row.verified = patch.verified
  if (patch.import_mode !== undefined) row.import_mode = patch.import_mode
  if (patch.allow_unordered !== undefined) row.allow_unordered = patch.allow_unordered
  if (patch.unordered_blanks !== undefined) row.unordered_blanks = patch.unordered_blanks
  if (patch.source_page !== undefined) row.source_page = patch.source_page
  if (patch.test_cases !== undefined) row.test_cases = toJson(patch.test_cases)
  if (patch.runtime_config !== undefined) row.runtime_config = toJson(patch.runtime_config)
  if (patch.execution_mode !== undefined) row.execution_mode = patch.execution_mode
  if (patch.examples !== undefined) row.examples = toJson(patch.examples)
  if (patch.case_questions !== undefined) row.case_questions = toJson(patch.case_questions)
  if (patch.paper !== undefined) row.paper = patch.paper === null ? null : toJson(patch.paper)
  if (patch.issue_flag !== undefined) row.issue_flag = patch.issue_flag
  if (patch.issue_note !== undefined) row.issue_note = patch.issue_note
  if (patch.flagged_at !== undefined) row.flagged_at = patch.flagged_at
  return row
}

/** 新建题目用的落库行；question_text / options 是 NOT NULL，缺省补空值而不是让整批插入失败 */
export function toQuestionInsert(input: Partial<QuestionInput>): Insert<'questions'> {
  return {
    ...toQuestionWrite(input),
    question_type: input.question_type ?? 'single_choice',
    question_text: input.question_text ?? '',
    options: toJson(input.options ?? []),
  }
}

/** 列表与筛选项共用的一套条件（与 count_question_items 的参数一一对应） */
export interface QuestionFilter {
  search?: string
  subject?: string
  /** '__unset__' = 只看没有分类的题（库里认这个哨兵值） */
  category?: string
  questionType?: QuestionType | ''
  importMode?: string
  verified?: '' | 'true' | 'false'
  /** '__none__' = 只看没有知识点的题 */
  keyPoints?: string
  issueFlag?: '' | 'suspected' | 'confirmed'
}

export interface QuestionPageQuery extends QuestionFilter {
  page?: number
  pageSize?: number
}

export interface QuestionItemCounts {
  /** 记录数（分页用） */
  rows: number
  /** 小题数：卷面题型一条记录含多个小题（完形 20 空），只报记录数会让人以为题少了 */
  items: number
}

const questionListQuery = () => db.from('questions').select(QUESTION_LIST_COLUMNS)

type QuestionListQuery = ReturnType<typeof questionListQuery>

function applyQuestionFilters(query: QuestionListQuery, filter: QuestionFilter): QuestionListQuery {
  let q = query
  if (filter.search) q = q.ilike('question_text', `%${filter.search}%`)
  if (filter.subject) q = q.eq('subject', filter.subject)
  if (filter.category === '__unset__') q = q.is('category', null)
  else if (filter.category) q = q.or(`category.eq."${filter.category}",categories.cs.["${filter.category}"]`)
  if (filter.questionType) q = q.eq('question_type', filter.questionType)
  if (filter.importMode) q = q.eq('import_mode', filter.importMode)
  if (filter.verified === 'true') q = q.eq('verified', true)
  else if (filter.verified === 'false') q = q.eq('verified', false)
  if (filter.issueFlag) q = q.eq('issue_flag', filter.issueFlag)
  if (filter.keyPoints === '__none__') q = q.or('key_points.is.null,key_points.eq.""')
  else if (filter.keyPoints) q = q.ilike('key_points', `%${filter.keyPoints}%`)
  return q
}

export async function fetchQuestionPage(query: QuestionPageQuery = {}, options: QueryOptions = {}): Promise<QuestionListItem[]> {
  const page = Math.max(1, query.page ?? 1)
  // PostgREST 单次最多回 1000 行，这里再收一道口子，免得调用方传个离谱的 pageSize 就悄悄只拿到 1000 行
  const pageSize = Math.max(1, Math.min(200, query.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const base = applyQuestionFilters(questionListQuery(), query)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.fetchQuestionPage' },
  )
  return rows.map(toQuestionListItem)
}

/** 测试页的检索：题型/学科/分类筛选 + 题干关键词，命中即整题下发（要直接拿去试做） */
export async function searchQuestions(
  query: QuestionFilter & { limit?: number } = {},
  options: QueryOptions = {},
): Promise<Question[]> {
  const limit = Math.max(1, Math.min(200, query.limit ?? 20))
  let base = db.from('questions').select(QUESTION_COLUMNS)
  const trimmed = query.search?.trim()
  if (trimmed) {
    if (/^[0-9a-f-]+$/i.test(trimmed)) base = base.eq('id', trimmed)
    else base = base.or(`question_text.ilike.%${trimmed.replace(/%/g, '\\%')}%,id.eq.${trimmed}`)
  }
  if (query.subject) base = base.eq('subject', query.subject)
  if (query.category === '__unset__') base = base.is('category', null)
  else if (query.category) base = base.eq('category', query.category)
  if (query.questionType) base = base.eq('question_type', query.questionType)
  const paged = base.order('created_at', { ascending: false }).limit(limit)
  const rows = await runList(
    () => (options.signal ? paged.abortSignal(options.signal) : paged),
    { ...options, context: options.context ?? 'questions.searchQuestions' },
  )
  return rows.map(toQuestion)
}

export async function fetchQuestionById(id: string, options: QueryOptions = {}): Promise<Question | null> {
  const base = db.from('questions').select(QUESTION_COLUMNS).eq('id', id)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'questions.fetchQuestionById' },
  )
  return row ? toQuestion(row) : null
}

/** 按 id 批量取整题；一条试卷可能几百题，所以走 fetchInChunks 而不是一次性 .in() */
export async function fetchQuestionsByIds(ids: string[], options: QueryOptions = {}): Promise<Question[]> {
  if (ids.length === 0) return []
  const rows = await fetchInChunks(
    ids,
    (chunk) => {
      const q = db.from('questions').select(QUESTION_COLUMNS).in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionsByIds' },
  )
  return rows.map(toQuestion)
}

export async function fetchLinkedQuestionsByIds(ids: string[], options: QueryOptions = {}): Promise<LinkedQuestion[]> {
  if (ids.length === 0) return []
  const rows = await fetchInChunks(
    ids,
    (chunk) => {
      const q = db.from('questions').select(QUESTION_LINKED_COLUMNS).in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchLinkedQuestionsByIds' },
  )
  return rows.map(toLinkedQuestion)
}

/** 解读/信源侧检索真题：年份走题库的分类约定（`2024年真题`），与题库页筛选同一套写法 */
export async function searchLinkedQuestions(
  query: { keyword?: string; year?: string | null; subject?: string | null; limit?: number } = {},
  options: QueryOptions = {},
): Promise<LinkedQuestion[]> {
  let base = db.from('questions').select(QUESTION_LINKED_COLUMNS)
  const keyword = query.keyword?.trim()
  if (keyword) base = base.ilike('question_text', `%${keyword}%`)
  if (query.subject) base = base.eq('subject', query.subject)
  if (query.year) base = base.or(`category.eq."${query.year}",categories.cs.["${query.year}"]`)
  const paged = base.order('created_at', { ascending: false }).limit(Math.min(200, Math.max(1, query.limit ?? 60)))
  const rows = await runList(
    () => (options.signal ? paged.abortSignal(options.signal) : paged),
    { ...options, context: options.context ?? 'questions.searchLinkedQuestions' },
  )
  return rows.map(toLinkedQuestion)
}

/**
 * 整库扫一遍元数据（筛选选项、学科分布、分类/知识点统计）。
 * 分批翻页要求排序键唯一，所以按 id 排 —— 按 created_at 排会漏行或重复。
 */
export async function fetchQuestionMetaRows(options: QueryOptions = {}): Promise<QuestionMetaRow[]> {
  const rows = await fetchAll(
    (from, to) => {
      // fetchAll 只把 options 交给 run()，不会替你绑 signal，翻页查询要自己在回调里绑
      const q = db.from('questions').select(QUESTION_META_COLUMNS).order('id', { ascending: true }).range(from, to)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionMetaRows' },
  )
  return rows.map(toQuestionMetaRow)
}

/** 离线练习缓存的增量取数；since 为空表示首次全量 */
export async function fetchQuestionOfflineRows(since: string | null, options: QueryOptions = {}): Promise<QuestionOfflineSource[]> {
  return fetchAll(
    (from, to) => {
      let q = db.from('questions').select(QUESTION_OFFLINE_COLUMNS)
      if (since) q = q.gte('updated_at', since)
      const paged = q.order('id', { ascending: true }).range(from, to)
      return options.signal ? paged.abortSignal(options.signal) : paged
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionOfflineRows' },
  )
}

/**
 * 某个学科（不给就是全库）下出现过的分类。分类标签既可能写在 category 上,
 * 也可能在 categories 数组里 —— 筛选下拉必须两边都收，否则「题库里看得到、列表筛不到」。
 */
export async function fetchQuestionCategories(subjects: string[] = [], options: QueryOptions = {}): Promise<string[]> {
  const rows = await fetchAll(
    (from, to) => {
      let q = db.from('questions').select(QUESTION_CATEGORY_COLUMNS)
      if (subjects.length > 0) q = q.in('subject', subjects)
      const paged = q.order('id', { ascending: true }).range(from, to)
      return options.signal ? paged.abortSignal(options.signal) : paged
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionCategories' },
  )
  const categories = new Set<string>()
  for (const row of rows) {
    if (row.category) categories.add(row.category)
    for (const c of toStringArray(row.categories)) if (c) categories.add(c)
  }
  return [...categories].sort()
}

/** 某几个学科下出现过的知识点原文；怎么拆（`[,，;；]`）由调用方按自己的口径决定 */
export async function fetchQuestionKeyPoints(subjects: string[], options: QueryOptions = {}): Promise<string[]> {
  if (subjects.length === 0) return []
  const rows = await fetchInChunks(
    subjects,
    (chunk) => {
      const q = db.from('questions').select(QUESTION_KEY_POINT_COLUMNS).in('subject', chunk).not('key_points', 'is', null)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionKeyPoints' },
  )
  const out: string[] = []
  for (const row of rows) if (row.key_points) out.push(row.key_points)
  return out
}

export const QUESTION_TRIAGE_COLUMNS = assertColumns<TriageRow>()(
  'id, subject, question_type, question_text, options, correct_answer, analysis, answer_explanation, key_points, categories, category, source_page, seq_number',
)

/**
 * 经验解析页的待归类扫描：整表分页取回，筛选条件在本地判（「除年份标签外还有没有别的分类」
 * 在 PostgREST 里表达不出来）。行 → TriageQuestion 的 mapper 在 lib/experience-parse 里。
 */
export async function fetchQuestionTriagePage(
  query: { subject: string | null; year: string | null; from: number; to: number },
  options: QueryOptions = {},
): Promise<TriageRow[]> {
  let base = db.from('questions').select(QUESTION_TRIAGE_COLUMNS)
  if (query.subject) base = base.eq('subject', query.subject)
  // categories 是 jsonb 列：contains() 发的是数组字面量 `cs.{...}`，jsonb 解析不了会 400，必须发 JSON 数组
  if (query.year) base = base.filter('categories', 'cs', JSON.stringify([query.year]))
  const paged = base.order('id', { ascending: true }).range(query.from, query.to)
  return runList(
    () => (options.signal ? paged.abortSignal(options.signal) : paged),
    { ...options, context: options.context ?? 'questions.fetchQuestionTriagePage' },
  )
}

/** 某几个学科下所有题的 id（重置「太简单」标记时按学科清空） */
export async function fetchQuestionIdsBySubjects(subjects: string[], options: QueryOptions = {}): Promise<string[]> {
  if (subjects.length === 0) return []
  const rows = await fetchAll(
    (from, to) => {
      const q = db.from('questions').select(QUESTION_ID_COLUMNS).in('subject', subjects).order('id', { ascending: true }).range(from, to)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionIdsBySubjects' },
  )
  return rows.map((r) => r.id)
}

/** 这批 id 里属于某个题型的那些：analysis 题没有对错，判定通关要单独放行 */
export async function fetchQuestionIdsOfType(
  questionType: QuestionType,
  ids: string[],
  options: QueryOptions = {},
): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await fetchInChunks(
    ids,
    (chunk) => {
      const q = db.from('questions').select(QUESTION_ID_COLUMNS).eq('question_type', questionType).in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionIdsOfType' },
  )
  return rows.map((r) => r.id)
}

/** 按知识点捞题：kps 拼进 .or() 会撑长 URL，所以分批查，再按 id 去重（一题命中多个知识点会重复出现） */
export async function fetchQuestionsByKeyPoints(
  query: { keyPoints: string[]; subjects?: string[]; questionType?: string },
  options: QueryOptions = {},
): Promise<QuestionKpLookupSource[]> {
  if (query.keyPoints.length === 0) return []
  const rows = await fetchInChunks(
    query.keyPoints,
    (chunk) => {
      let q = db.from('questions').select(QUESTION_KP_LOOKUP_COLUMNS)
        .or(chunk.map((kp) => `key_points.ilike.%${kp}%`).join(','))
      if (query.subjects?.length) q = q.in('subject', query.subjects)
      if (query.questionType) q = q.eq('question_type', query.questionType)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionsByKeyPoints' },
  )
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

/**
 * 分页用的两套计数。
 *
 * 为什么不直接 select(..., { count: 'exact' })：PostgREST 把总数放在响应头里，
 * 而 run() 只下发 data，count 拿不到。count_question_items 用的是同一套筛选口径
 * （连 '__unset__' / '__none__' 两个哨兵值都一致），顺带把小题数一起算了。
 */
export async function countQuestionItems(query: QuestionFilter = {}, options: QueryOptions = {}): Promise<QuestionItemCounts> {
  const data = await run(
    () => db.rpc('count_question_items', {
      p_search: query.search || undefined,
      p_subject: query.subject || undefined,
      p_category: query.category || undefined,
      p_question_type: query.questionType || undefined,
      p_import_mode: query.importMode || undefined,
      p_verified: query.verified === 'true' ? true : query.verified === 'false' ? false : undefined,
      p_key_points: query.keyPoints || undefined,
      p_issue_flag: query.issueFlag || undefined,
    }),
    { ...options, context: options.context ?? 'questions.countQuestionItems' },
  )
  const counts = (data ?? {}) as { rows?: number; items?: number }
  return { rows: Number(counts.rows ?? 0), items: Number(counts.items ?? 0) }
}

/** 批量改分类前的确认：这个分类下总共有多少条（比已选的多就说明有漏网的） */
export async function countQuestionsByCategory(category: string, options: QueryOptions = {}): Promise<number> {
  const rows = await fetchAll(
    (from, to) => {
      const q = db.from('questions').select(QUESTION_ID_COLUMNS).eq('category', category).order('id', { ascending: true }).range(from, to)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.countQuestionsByCategory' },
  )
  return rows.length
}

export async function countQuestionsByKeyPoints(keyPoints: string, options: QueryOptions = {}): Promise<number> {
  const rows = await fetchAll(
    (from, to) => {
      const q = db.from('questions').select(QUESTION_ID_COLUMNS).eq('key_points', keyPoints).order('id', { ascending: true }).range(from, to)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.countQuestionsByKeyPoints' },
  )
  return rows.length
}

/** 批量入库，返回落库后的 id（补索引、回填题单都要） */
export async function insertQuestions(rows: Insert<'questions'>[], options: QueryOptions = {}): Promise<string[]> {
  if (rows.length === 0) return []
  const base = db.from('questions').insert(rows).select(QUESTION_ID_COLUMNS)
  const inserted = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.insertQuestions' },
  )
  return inserted.map((r) => r.id)
}

export async function updateQuestion(id: string, patch: Partial<QuestionInput>, options: QueryOptions = {}): Promise<void> {
  const base = db.from('questions').update(toQuestionWrite(patch)).eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.updateQuestion' },
  )
}

/** 批量改一批选中题：学科/分类/知识点都是 Bulk 改的，一次改几十条 */
export async function updateQuestions(ids: string[], patch: Partial<QuestionInput>, options: QueryOptions = {}): Promise<void> {
  if (ids.length === 0) return
  const row = toQuestionWrite(patch)
  await fetchInChunks(
    ids,
    (chunk) => {
      const q = db.from('questions').update(row).in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.updateQuestions' },
  )
}

/** 改整个分类（选中数少于该分类总数时的兜底：连没选中的一起改） */
export async function updateQuestionsByCategory(category: string, patch: Partial<QuestionInput>, options: QueryOptions = {}): Promise<void> {
  const base = db.from('questions').update(toQuestionWrite(patch)).eq('category', category)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.updateQuestionsByCategory' },
  )
}

export async function updateQuestionsByKeyPoints(keyPoints: string, patch: Partial<QuestionInput>, options: QueryOptions = {}): Promise<void> {
  const base = db.from('questions').update(toQuestionWrite(patch)).eq('key_points', keyPoints)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.updateQuestionsByKeyPoints' },
  )
}

export async function deleteQuestion(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('questions').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestion' },
  )
}

export async function deleteQuestions(ids: string[], options: QueryOptions = {}): Promise<void> {
  if (ids.length === 0) return
  await fetchInChunks(
    ids,
    (chunk) => {
      const q = db.from('questions').delete().in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.deleteQuestions' },
  )
}

// ── question_meta_cache（单行聚合缓存，只读） ──

/** 聚合缓存的字段集；subjects / categories / key_points_by_subject 都是 JSONB 数组 */
export type QuestionMetaCacheSource = {
  subjects: Json
  categories: Json
  key_points_by_subject: Json
}

export const QUESTION_META_CACHE_COLUMNS = assertColumns<QuestionMetaCacheSource>()(
  'subjects, categories, key_points_by_subject',
)

export interface KpBySubject {
  subject: string
  keyPoints: string[]
}

export interface QuestionMetaCache {
  subjects: string[]
  categories: string[]
  keyPointsBySubject: KpBySubject[]
}

/** 三个消费方都在做同一件事：按学科归拢知识点 + 自然序排。排在这里，页面直接渲染。 */
export function toQuestionMetaCache(row: QuestionMetaCacheSource): QuestionMetaCache {
  const keyPointsBySubject: KpBySubject[] = []
  if (Array.isArray(row.key_points_by_subject)) {
    for (const item of row.key_points_by_subject) {
      const entry = jsonRecord(item)
      if (!entry) continue
      keyPointsBySubject.push({
        subject: jsonString(entry.subject) || '其他',
        keyPoints: toStringArray(entry.key_points).sort(naturalSort),
      })
    }
  }
  keyPointsBySubject.sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN'))
  return {
    subjects: toStringArray(row.subjects).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    categories: toStringArray(row.categories).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    keyPointsBySubject,
  }
}

/** 单行缓存，永远只有一条；触发器/迁移重建，客户端没有写入口（refresh 函数对 authenticated 已 REVOKE） */
export async function fetchQuestionMetaCache(options: QueryOptions = {}): Promise<QuestionMetaCache> {
  const base = db.from('question_meta_cache').select(QUESTION_META_CACHE_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'questions.fetchQuestionMetaCache' },
  )
  return row ? toQuestionMetaCache(row) : { subjects: [], categories: [], keyPointsBySubject: [] }
}

// ── question_drafts ──

export type QuestionDraftSource = Row<'question_drafts'>

export const QUESTION_DRAFT_COLUMNS = assertColumns<QuestionDraftSource>()(
  'id, question_id, question_type, question_text, payload, created_at, updated_at',
)

export const QUESTION_DRAFT_ID_COLUMNS = assertColumns<Pick<QuestionDraftSource, 'id'>>()('id')

/** 草稿 payload 里的 QuestionInput：表单可能只存了一半，每个字段都要兜底 */
function toQuestionInput(raw: Json | null, fallbackType: QuestionType): QuestionInput {
  const input = jsonRecord(raw) ?? {}
  const questionType = jsonString(input.question_type) ? asQuestionType(jsonString(input.question_type)!) : fallbackType
  return {
    question_type: questionType,
    question_text: jsonString(input.question_text) ?? '',
    options: toStringArray(input.options),
    correct_answer: parseCorrectAnswer(input.correct_answer, questionType),
    category: jsonString(input.category),
    categories: toStringArray(input.categories),
    subject: jsonString(input.subject),
    analysis: jsonString(input.analysis),
    key_points: jsonString(input.key_points),
    answer_explanation: jsonString(input.answer_explanation),
    seq_number: typeof input.seq_number === 'number' ? input.seq_number : null,
    verified: jsonBoolean(input.verified),
    import_mode: jsonString(input.import_mode),
    allow_unordered: jsonBoolean(input.allow_unordered),
    unordered_blanks: toNumberArray(input.unordered_blanks),
    source_page: jsonString(input.source_page),
    test_cases: toTestCases(input.test_cases ?? null),
    runtime_config: toRuntimeConfig(input.runtime_config ?? null),
    execution_mode: asExecutionMode(input.execution_mode),
    examples: toExamples(input.examples ?? null),
    case_questions: toCaseQuestions(input.case_questions ?? null, questionType),
    paper: toQuestionPaper(input.paper ?? null),
    issue_flag: asIssueFlag(jsonString(input.issue_flag) ?? 'none'),
    issue_note: jsonString(input.issue_note),
    flagged_at: jsonString(input.flagged_at),
  }
}

export function toQuestionDraft(row: QuestionDraftSource): QuestionDraft {
  const questionType = asQuestionType(row.question_type)
  return {
    id: row.id,
    question_id: row.question_id,
    question_type: questionType,
    question_text: row.question_text,
    payload: toQuestionInput(row.payload, questionType),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listQuestionDrafts(options: QueryOptions = {}): Promise<QuestionDraft[]> {
  const base = db.from('question_drafts').select(QUESTION_DRAFT_COLUMNS).order('updated_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listQuestionDrafts' },
  )
  return rows.map(toQuestionDraft)
}

/** 草稿箱角标只要个数：翻页数 id，草稿量本来就小 */
export async function countQuestionDrafts(options: QueryOptions = {}): Promise<number> {
  const rows = await fetchAll(
    (from, to) => {
      const q = db.from('question_drafts').select(QUESTION_DRAFT_ID_COLUMNS).order('id', { ascending: true }).range(from, to)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.countQuestionDrafts' },
  )
  return rows.length
}

export async function fetchQuestionDraft(id: string, options: QueryOptions = {}): Promise<QuestionDraft | null> {
  const base = db.from('question_drafts').select(QUESTION_DRAFT_COLUMNS).eq('id', id)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'questions.fetchQuestionDraft' },
  )
  return row ? toQuestionDraft(row) : null
}

/** 存草稿：有 draftId 就覆盖，没有就新开一条；返回草稿 id */
export async function saveQuestionDraft(
  payload: QuestionInput,
  opts: { draftId?: string | null; questionId?: string | null } = {},
  options: QueryOptions = {},
): Promise<string> {
  const row = {
    question_id: opts.questionId ?? null,
    question_type: payload.question_type,
    question_text: String(payload.question_text ?? ''),
    payload: toJson(payload),
  }
  if (opts.draftId) {
    const base = db.from('question_drafts').update(row).eq('id', opts.draftId)
    await run(
      () => (options.signal ? base.abortSignal(options.signal) : base),
      { ...options, context: options.context ?? 'questions.saveQuestionDraft.update' },
    )
    return opts.draftId
  }
  const base = db.from('question_drafts').insert(row).select(QUESTION_DRAFT_ID_COLUMNS)
  const created = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'questions.saveQuestionDraft.insert' },
  )
  return requiredRow(created, 'questions.saveQuestionDraft.insert').id
}

export async function deleteQuestionDraft(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('question_drafts').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestionDraft' },
  )
}

// ── question_source_links ──

export type QuestionSourceLinkSource = Pick<
  Row<'question_source_links'>,
  'id' | 'source' | 'source_id' | 'block_index' | 'page_no' | 'label' | 'sub_label' | 'anchor' | 'snippet' | 'note' | 'origin' | 'created_at'
>

export const QUESTION_SOURCE_LINK_COLUMNS = assertColumns<QuestionSourceLinkSource>()(
  'id, source, source_id, block_index, page_no, label, sub_label, anchor, snippet, note, origin, created_at',
)

/** 反查（这条信源上挂过哪些题）只需要这几列，题本身另查 */
export type QuestionSourceLinkRefSource = Pick<Row<'question_source_links'>, 'id' | 'question_id' | 'note' | 'origin' | 'created_at'>

export const QUESTION_SOURCE_LINK_REF_COLUMNS = assertColumns<QuestionSourceLinkRefSource>()(
  'id, question_id, note, origin, created_at',
)

export function toQuestionSourceLink(row: QuestionSourceLinkSource): QuestionSourceLink {
  return {
    id: row.id,
    source: row.source as RagSource,
    sourceId: row.source_id,
    blockIndex: row.block_index,
    pageNo: row.page_no,
    label: row.label,
    subLabel: row.sub_label,
    anchor: row.anchor,
    snippet: row.snippet,
    note: row.note,
    origin: row.origin === 'littleq' ? 'littleq' : 'manual',
    createdAt: row.created_at,
  }
}

/** 反查回来的一条：关联本身（备注/时间）+ 那道题 */
export interface LinkedQuestionRef {
  linkId: string
  note: string
  origin: QuestionSourceLink['origin']
  createdAt: string
  /** 题被删掉时外键会级联删掉整行，所以正常情况下不会是 null */
  question: LinkedQuestion | null
}

/** 这道题挂着的全部信源（按挂的时间升序 —— 清单顺序就是用户挂的顺序） */
export async function listQuestionSourceLinks(questionId: string, options: QueryOptions = {}): Promise<QuestionSourceLink[]> {
  if (!questionId) return []
  const base = db.from('question_source_links')
    .select(QUESTION_SOURCE_LINK_COLUMNS)
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listQuestionSourceLinks' },
  )
  return rows.map(toQuestionSourceLink)
}

/**
 * 挂若干条。
 *
 * ignoreDuplicates：唯一键上重复（同一段挂第二遍）时静默跳过而不是整批失败 ——
 * 一次提交里混着一条重复的，不该把另外几条好的也退回去。
 */
export async function addQuestionSourceLinks(
  userId: string,
  questionId: string,
  drafts: QuestionLinkDraft[],
  options: QueryOptions = {},
): Promise<number> {
  if (!questionId || drafts.length === 0) return 0
  const rows = drafts.map((d) => ({
    user_id: userId,
    question_id: questionId,
    source: d.source,
    source_id: d.sourceId,
    block_index: d.blockIndex,
    page_no: d.pageNo,
    label: d.label,
    sub_label: d.subLabel,
    anchor: d.anchor,
    snippet: d.snippet,
    note: d.note,
    origin: d.origin,
  }))
  const base = db.from('question_source_links').upsert(rows, {
    onConflict: 'user_id,question_id,source,source_id,block_index',
    ignoreDuplicates: true,
  })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.addQuestionSourceLinks' },
  )
  return rows.length
}

export async function deleteQuestionSourceLink(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('question_source_links').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestionSourceLink' },
  )
}

/**
 * 这条信源上挂过哪些题。
 *
 * 两道查询而不是 PostgREST 内嵌：内嵌形状和外键的暴露方式绑在一起，一次外键改名就得跟着改这里。
 * 只查得到自己挂的（RLS 按 user_id 收），语义是「我在这一段上挂过哪几道题」，不是全平台的题图。
 */
export async function listLinkedQuestions(source: RagSource, sourceId: string, options: QueryOptions = {}): Promise<LinkedQuestionRef[]> {
  if (!sourceId) return []
  const base = db.from('question_source_links')
    .select(QUESTION_SOURCE_LINK_REF_COLUMNS)
    .eq('source', source)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listLinkedQuestions' },
  )
  if (rows.length === 0) return []
  const questions = await fetchLinkedQuestionsByIds(rows.map((r) => r.question_id), options)
  const byId = new Map(questions.map((q) => [q.id, q]))
  return rows.map((r) => ({
    linkId: r.id,
    note: r.note,
    origin: r.origin === 'littleq' ? 'littleq' : 'manual',
    createdAt: r.created_at,
    question: byId.get(r.question_id) ?? null,
  }))
}

// ── kp_question_refs ──

export type KpQuestionRefSource = Pick<Row<'kp_question_refs'>, 'id' | 'question_id' | 'note' | 'sort_order'>

export const KP_QUESTION_REF_COLUMNS = assertColumns<KpQuestionRefSource>()('id, question_id, note, sort_order')

/** 某条解读挂的全部真题（按管理员排的顺序） */
export async function listKpQuestions(subject: string, kp: string, options: QueryOptions = {}): Promise<KpQuestionLink[]> {
  if (!subject || !kp) return []
  const base = db.from('kp_question_refs')
    .select(KP_QUESTION_REF_COLUMNS)
    .eq('subject', subject)
    .eq('kp', kp)
    .order('sort_order', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listKpQuestions' },
  )
  if (rows.length === 0) return []
  const questions = await fetchLinkedQuestionsByIds(rows.map((r) => r.question_id), options)
  const byId = new Map(questions.map((q) => [q.id, q]))
  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    sortOrder: r.sort_order,
    question: byId.get(r.question_id) ?? null,
  }))
}

/**
 * 整条解读的真题一次性覆盖保存（删旧插新）。
 * 走 RPC 而不是「delete + insert」两句：两句之间失败会留下一条空的解读，
 * 而 RPC 里是一个事务，顺带把 sort_order 重排好。
 */
export async function saveKpQuestions(
  subject: string,
  kp: string,
  items: Pick<KpQuestionDraft, 'questionId' | 'note'>[],
  options: QueryOptions = {},
): Promise<number> {
  const data = await run(
    () => db.rpc('save_kp_question_refs', {
      p_subject: subject,
      p_kp: kp,
      p_refs: toJson(items.map((i) => ({ question_id: i.questionId, note: i.note }))),
    }),
    { ...options, context: options.context ?? 'questions.saveKpQuestions' },
  )
  return Number(data ?? 0)
}

// ── kp_question_map ──

/** 预计算的知识点 → 题目映射（触发器维护），顺序练习选 KP 后靠它拿题单 */
export type KpQuestionMapSource = Pick<Row<'kp_question_map'>, 'kp' | 'question_id'>

export const KP_QUESTION_MAP_COLUMNS = assertColumns<KpQuestionMapSource>()('kp, question_id')

export async function fetchQuestionIdsByKeyPoints(keyPoints: string[], options: QueryOptions = {}): Promise<string[]> {
  if (keyPoints.length === 0) return []
  const rows = await fetchInChunks(
    keyPoints,
    (chunk) => {
      const q = db.from('kp_question_map').select(KP_QUESTION_MAP_COLUMNS).in('kp', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.fetchQuestionIdsByKeyPoints' },
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    if (seen.has(row.question_id)) continue
    seen.add(row.question_id)
    out.push(row.question_id)
  }
  return out
}

// ── question_banks ──

export type QuestionBankSource = Row<'question_banks'>

export const QUESTION_BANK_COLUMNS = assertColumns<QuestionBankSource>()(
  'id, name, description, logo_url, is_public, created_by, created_at',
)

/** 试题库；question_count 是列表页现算的，不落库 */
export interface QuestionBank {
  id: string
  name: string
  description: string | null
  logo_url: string | null
  is_public: boolean
  created_by: string
  created_at: string
}

export function toQuestionBank(row: QuestionBankSource): QuestionBank {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logo_url: row.logo_url,
    is_public: row.is_public,
    created_by: row.created_by,
    created_at: row.created_at,
  }
}

export async function listQuestionBanks(options: QueryOptions = {}): Promise<QuestionBank[]> {
  const base = db.from('question_banks').select(QUESTION_BANK_COLUMNS).order('name', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listQuestionBanks' },
  )
  return rows.map(toQuestionBank)
}

export async function createQuestionBank(
  input: { name: string; createdBy: string; description?: string; logoUrl?: string; isPublic?: boolean },
  options: QueryOptions = {},
): Promise<QuestionBank> {
  const base = db.from('question_banks').insert({
    name: input.name,
    created_by: input.createdBy,
    description: input.description || null,
    logo_url: input.logoUrl || null,
    is_public: input.isPublic ?? false,
  }).select(QUESTION_BANK_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'questions.createQuestionBank' },
  )
  return toQuestionBank(requiredRow(row, 'questions.createQuestionBank'))
}

export async function updateQuestionBank(
  id: string,
  patch: { name?: string; description?: string; logoUrl?: string; isPublic?: boolean },
  options: QueryOptions = {},
): Promise<void> {
  const row: Update<'question_banks'> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description || null
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl || null
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic
  const base = db.from('question_banks').update(row).eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.updateQuestionBank' },
  )
}

export async function deleteQuestionBank(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('question_banks').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestionBank' },
  )
}

// ── question_bank_items ──

export type QuestionBankItemSource = Row<'question_bank_items'>

export const QUESTION_BANK_ITEM_COLUMNS = assertColumns<QuestionBankItemSource>()('id, bank_id, question_id, added_at')

export const QUESTION_BANK_ITEM_BANK_COLUMNS = assertColumns<Pick<QuestionBankItemSource, 'bank_id'>>()('bank_id')

/** 题库里的一条记录（含内联的题目）；字段名沿用管理页与页面里那套 */
export interface QuestionBankItem {
  id: string
  bank_id: string
  question_id: string
  added_at: string
  questions: Question
}

/** 列表要按加入时间升序，题本身另查一次（不依赖 PostgREST 内嵌关联的形状） */
export async function listQuestionBankItems(bankId: string, options: QueryOptions = {}): Promise<QuestionBankItem[]> {
  if (!bankId) return []
  const base = db.from('question_bank_items')
    .select(QUESTION_BANK_ITEM_COLUMNS)
    .eq('bank_id', bankId)
    .order('added_at', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listQuestionBankItems' },
  )
  if (rows.length === 0) return []
  const questions = await fetchQuestionsByIds(rows.map((r) => r.question_id), options)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const out: QuestionBankItem[] = []
  for (const row of rows) {
    // 外键是 ON DELETE CASCADE，正常查不到题说明题已被删且 item 还没清掉，跳过而不是渲染半条
    const question = byId.get(row.question_id)
    if (!question) continue
    out.push({ id: row.id, bank_id: row.bank_id, question_id: row.question_id, added_at: row.added_at, questions: question })
  }
  return out
}

/** 各题库的题量：只取 bank_id 聚合，不把 item 全列拉回来 */
export async function countQuestionBankItems(bankIds: string[], options: QueryOptions = {}): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (bankIds.length === 0) return counts
  const rows = await fetchInChunks(
    bankIds,
    (chunk) => {
      const q = db.from('question_bank_items').select(QUESTION_BANK_ITEM_BANK_COLUMNS).in('bank_id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.countQuestionBankItems' },
  )
  for (const row of rows) counts.set(row.bank_id, (counts.get(row.bank_id) ?? 0) + 1)
  return counts
}

export async function addQuestionBankItems(bankId: string, questionIds: string[], options: QueryOptions = {}): Promise<void> {
  if (questionIds.length === 0) return
  const base = db.from('question_bank_items').insert(questionIds.map((questionId) => ({ bank_id: bankId, question_id: questionId })))
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.addQuestionBankItems' },
  )
}

export async function deleteQuestionBankItem(itemId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('question_bank_items').delete().eq('id', itemId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestionBankItem' },
  )
}

export async function deleteQuestionBankItems(itemIds: string[], options: QueryOptions = {}): Promise<void> {
  if (itemIds.length === 0) return
  await fetchInChunks(
    itemIds,
    (chunk) => {
      const q = db.from('question_bank_items').delete().in('id', chunk)
      return options.signal ? q.abortSignal(options.signal) : q
    },
    { ...options, context: options.context ?? 'questions.deleteQuestionBankItems' },
  )
}

// ── question_bank_papers ──

export type QuestionBankPaperSource = Row<'question_bank_papers'>

export const QUESTION_BANK_PAPER_COLUMNS = assertColumns<QuestionBankPaperSource>()(
  'id, bank_id, created_by, name, kind, scope_type, year, scope_values, subject, duration_min, template, question_ids, generated_at, created_at, updated_at',
)

function asBankPaperKind(value: string): BankPaperKind {
  return value === 'real' ? 'real' : 'mock'
}

function asBankPaperScopeType(value: string): BankPaperScopeType {
  return value === 'year' || value === 'chapter' || value === 'key_point' ? value : 'comprehensive'
}

export function toQuestionBankPaper(row: QuestionBankPaperSource): QuestionBankPaper {
  return {
    id: row.id,
    bank_id: row.bank_id,
    created_by: row.created_by,
    name: row.name,
    kind: asBankPaperKind(row.kind),
    scope_type: asBankPaperScopeType(row.scope_type),
    year: row.year,
    scope_values: toStringArray(row.scope_values),
    subject: Array.isArray(row.subject) ? row.subject.filter((s): s is string => typeof s === 'string') : null,
    duration_min: Math.max(1, Math.min(600, row.duration_min || 60)),
    template: normalizeTemplate((row.template ?? {}) as Record<string, unknown>),
    question_ids: Array.isArray(row.question_ids) ? row.question_ids.filter((id): id is string => typeof id === 'string') : [],
    generated_at: row.generated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listQuestionBankPapers(bankId: string, options: QueryOptions = {}): Promise<QuestionBankPaper[]> {
  if (!bankId) return []
  const base = db.from('question_bank_papers')
    .select(QUESTION_BANK_PAPER_COLUMNS)
    .eq('bank_id', bankId)
    .order('kind', { ascending: true })
    .order('year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.listQuestionBankPapers' },
  )
  return rows.map(toQuestionBankPaper)
}

/** 组一份新卷并落库：题单在生成时冻结（同一套卷反复练，分数才可比） */
export async function createQuestionBankPaper(
  input: {
    bankId: string
    createdBy: string
    name: string
    kind: BankPaperKind
    scopeType: BankPaperScopeType
    year: number | null
    scopeValues: string[]
    subject: string[] | null
    durationMin: number
    template: ExamTemplate
    questionIds: string[]
  },
  options: QueryOptions = {},
): Promise<QuestionBankPaper> {
  const base = db.from('question_bank_papers').insert({
    bank_id: input.bankId,
    created_by: input.createdBy,
    name: input.name,
    kind: input.kind,
    scope_type: input.scopeType,
    year: input.scopeType === 'year' ? input.year : null,
    scope_values: toJson(input.scopeValues),
    subject: input.subject,
    duration_min: input.durationMin,
    template: toJson(input.template),
    question_ids: input.questionIds,
    generated_at: new Date().toISOString(),
  }).select(QUESTION_BANK_PAPER_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'questions.createQuestionBankPaper' },
  )
  return toQuestionBankPaper(requiredRow(row, 'questions.createQuestionBankPaper'))
}

/** 重新组卷：同范围同模板重抽一次，覆盖题单 —— 分数要跟上一遍比就只能是同一批题 */
export async function regenerateQuestionBankPaper(
  paperId: string,
  questionIds: string[],
  options: QueryOptions = {},
): Promise<QuestionBankPaper> {
  const base = db.from('question_bank_papers')
    .update({ question_ids: questionIds, generated_at: new Date().toISOString() })
    .eq('id', paperId)
    .select(QUESTION_BANK_PAPER_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'questions.regenerateQuestionBankPaper' },
  )
  return toQuestionBankPaper(requiredRow(row, 'questions.regenerateQuestionBankPaper'))
}

export async function deleteQuestionBankPaper(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('question_bank_papers').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'questions.deleteQuestionBankPaper' },
  )
}

// ── 查重（question_dup_cache / question_dup_reviews / question_merge_log） ──
//
// 这三张表 RLS 开着却没有策略，客户端读不到也写不了，唯一的入口是下面这几个
// SECURITY DEFINER 的 RPC（扫描会重建 question_dup_cache，合并写 question_merge_log，
// 裁决写 question_dup_reviews）。RPC 返回的是已经拼好的 JSON，所以这里做的是
// JSON → 领域对象的归一化，而不是行 → 领域对象。

export interface DupQuestion {
  id: string
  subject: string | null
  category: string | null
  categories: string[]
  questionType: QuestionType
  questionText: string
  options: string[]
  correctAnswer: CorrectAnswer
  keyPoints: string | null
  verified: boolean
  importMode: string | null
  sourcePage: string | null
  seqNumber: number | null
  createdAt: string | null
  analysis: string | null
  answerExplanation: string | null
}

export interface DupGroup {
  key: string
  size: number
  members: DupQuestion[]
}

export interface DupCandidate {
  kind: 'exact' | 'fuzzy'
  score: number
  prob: number
  level: 'high' | 'mid' | 'low'
  signals: { sText: number; oOverlap: number; aSame: number }
  /** 完全一致的重复按指纹成组；相似重复没有组 */
  group: DupGroup | null
  a: DupQuestion
  b: DupQuestion
}

export interface DupScanResult {
  subject: string | null
  total: number
  limit: number
  truncated: boolean
  candidates: DupCandidate[]
}

export function toDupQuestion(raw: Json | null): DupQuestion {
  const q = jsonRecord(raw) ?? {}
  const questionType = asQuestionType(jsonString(q.questionType) ?? 'single_choice')
  return {
    id: jsonString(q.id) ?? '',
    subject: jsonString(q.subject),
    category: jsonString(q.category),
    categories: toStringArray(q.categories),
    questionType,
    questionText: jsonString(q.questionText) ?? '',
    options: toStringArray(q.options),
    correctAnswer: parseCorrectAnswer(q.correctAnswer, questionType),
    keyPoints: jsonString(q.keyPoints),
    verified: jsonBoolean(q.verified),
    importMode: jsonString(q.importMode),
    sourcePage: jsonString(q.sourcePage),
    seqNumber: typeof q.seqNumber === 'number' ? q.seqNumber : null,
    createdAt: jsonString(q.createdAt),
    analysis: jsonString(q.analysis),
    answerExplanation: jsonString(q.answerExplanation),
  }
}

function toDupCandidate(raw: Json): DupCandidate {
  const c = jsonRecord(raw) ?? {}
  const signals = jsonRecord(c.signals) ?? {}
  const group = jsonRecord(c.group)
  const members = group && Array.isArray(group.members) ? group.members.map(toDupQuestion) : []
  return {
    kind: c.kind === 'exact' ? 'exact' : 'fuzzy',
    score: jsonNumber(c.score, 0),
    prob: jsonNumber(c.prob, 0),
    level: c.level === 'high' || c.level === 'mid' ? c.level : 'low',
    signals: {
      sText: jsonNumber(signals.sText, 0),
      oOverlap: jsonNumber(signals.oOverlap, 0),
      aSame: jsonNumber(signals.aSame, 0),
    },
    group: group
      ? { key: jsonString(group.key) ?? '', size: jsonNumber(group.size, members.length), members }
      : null,
    a: toDupQuestion(c.a ?? null),
    b: toDupQuestion(c.b ?? null),
  }
}

export function toDupScanResult(raw: Json | null): DupScanResult {
  const result = jsonRecord(raw) ?? {}
  const candidates = Array.isArray(result.candidates) ? result.candidates : []
  return {
    subject: jsonString(result.subject),
    total: jsonNumber(result.total, 0),
    limit: jsonNumber(result.limit, 0),
    truncated: jsonBoolean(result.truncated),
    candidates: candidates.map(toDupCandidate),
  }
}

export async function scanQuestionDuplicates(
  subject: string,
  minSim: number,
  limit: number,
  options: QueryOptions = {},
): Promise<DupScanResult> {
  const data = await run(
    () => db.rpc('scan_question_duplicates', { p_subject: subject, p_min_sim: minSim, p_limit: limit }),
    { ...options, context: options.context ?? 'questions.scanQuestionDuplicates' },
  )
  return toDupScanResult(data)
}

/** 同一指纹的一组重复题：留一条，删其余（被删的题连同分类并进保留的那条） */
export async function mergeDupGroup(keepId: string, removeIds: string[], reason: string, options: QueryOptions = {}): Promise<void> {
  await run(
    () => db.rpc('merge_dup_group', { p_keep: keepId, p_removes: removeIds, p_reason: reason }),
    { ...options, context: options.context ?? 'questions.mergeDupGroup' },
  )
}

export async function mergeDupQuestions(keepId: string, removeId: string, reason: string, options: QueryOptions = {}): Promise<void> {
  await run(
    () => db.rpc('merge_dup_questions', { p_keep: keepId, p_remove: removeId, p_reason: reason }),
    { ...options, context: options.context ?? 'questions.mergeDupQuestions' },
  )
}

/** 「有意保留全部」：写进 question_dup_reviews，这组下次扫描就不再提示 */
export async function keepDupGroup(ids: string[], note: string | null, options: QueryOptions = {}): Promise<void> {
  await run(
    () => db.rpc('keep_dup_group', { p_ids: ids, p_note: note ?? undefined }),
    { ...options, context: options.context ?? 'questions.keepDupGroup' },
  )
}

export async function saveDupReview(
  q1Id: string,
  q2Id: string,
  status: 'keep' | 'not_dup',
  note: string | null = null,
  options: QueryOptions = {},
): Promise<void> {
  await run(
    () => db.rpc('save_dup_review', { p_q1: q1Id, p_q2: q2Id, p_status: status, p_note: note ?? undefined }),
    { ...options, context: options.context ?? 'questions.saveDupReview' },
  )
}
