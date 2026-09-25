import { db, fetchAll, runList, type QueryOptions } from './db'
import { assertColumns } from './columns'

/**
 * user_daily_stats 的字段集。
 *
 * 仪表盘的曲线、热力图、时段分布全部由这张预聚合表算出来(表由 user_answers 的触发器维护)，
 * 前端只读不写。列集写死在这里，新增列必须显式加进来，并被 assertColumns 在编译期核对。
 */
export type DailyStatSource = {
  date: string
  subject: string
  question_type: string
  total: number
  correct: number
  hourly: number[]
}

export const DAILY_STAT_COLUMNS = assertColumns<DailyStatSource>()(
  'date, subject, question_type, total, correct, hourly',
)

/** hourly 是当天 24 个整点的答题数，图表按它画时段分布 */
export interface DailyStat {
  date: string
  subject: string
  question_type: string
  total: number
  correct: number
  hourly: number[]
}

export function toDailyStat(row: DailyStatSource): DailyStat {
  return {
    date: row.date,
    subject: row.subject,
    question_type: row.question_type,
    total: row.total,
    correct: row.correct,
    hourly: row.hourly,
  }
}

/**
 * 取某用户 sinceDate(含) 起的每日统计。
 *
 * 行数是 天数 × 学科 × 题型，长期用户会过千行，正好撞上 PostgREST 单次最多回 1000 行的上限
 * (见 db.fetchAll)：不翻页就会静默少一截数据，图表看不出少了，只是数字偏小。
 * 排序给出 (date, subject, question_type) 全序，否则同一天的多行在翻页边界上会重复或漏掉。
 */
export async function fetchDailyStats(
  userId: string,
  sinceDate: string,
  options: QueryOptions = {},
): Promise<DailyStat[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('user_daily_stats')
        .select(DAILY_STAT_COLUMNS)
        .eq('user_id', userId)
        .gte('date', sinceDate)
        .order('date')
        .order('subject')
        .order('question_type')
        .range(from, to)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'stats.fetchDaily' },
  )
  return rows.map(toDailyStat)
}

/**
 * ai_usage 的明细字段集。
 *
 * 两列 token 都可空：请求失败或上游没回 usage 时，后台只落了一行「调过但没用量」的记录，
 * 所以总 tokens 由 mapper 相加，库里没有也不该有总量列。
 */
export type AiUsageLogSource = {
  id: number
  model: string
  source: string | null
  ok: boolean
  status_code: number | null
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  created_at: string
}

export const AI_USAGE_LOG_COLUMNS = assertColumns<AiUsageLogSource>()(
  'id, model, source, ok, status_code, latency_ms, prompt_tokens, completion_tokens, created_at',
)

export interface AiUsageLog {
  id: number
  model: string
  source: string | null
  ok: boolean
  statusCode: number | null
  latencyMs: number | null
  tokens: number
  createdAt: string
}

export function toAiUsageLog(row: AiUsageLogSource): AiUsageLog {
  return {
    id: row.id,
    model: row.model,
    source: row.source,
    ok: row.ok,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    tokens: (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0),
    createdAt: row.created_at,
  }
}

/** 最近 limit 条调用明细(「查看更多」用)。谁能看见谁的记录由 RLS 决定：本人 + 管理员。 */
export async function fetchAiUsageLogs(limit = 50, options: QueryOptions = {}): Promise<AiUsageLog[]> {
  const base = db.from('ai_usage').select(AI_USAGE_LOG_COLUMNS).order('created_at', { ascending: false }).limit(limit)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'stats.fetchAiUsageLogs' },
  )
  return rows.map(toAiUsageLog)
}

/** ai_model_prices 的字段集：每百万 tokens 的价(元)，currency 默认 CNY，由管理员维护 */
export type AiModelPriceSource = {
  model: string
  input_per_1m: number
  output_per_1m: number
  currency: string
}

export const AI_MODEL_PRICE_COLUMNS = assertColumns<AiModelPriceSource>()(
  'model, input_per_1m, output_per_1m, currency',
)

export interface AiModelPrice {
  model: string
  inputPer1m: number
  outputPer1m: number
  currency: string
}

export function toAiModelPrice(row: AiModelPriceSource): AiModelPrice {
  return {
    model: row.model,
    inputPer1m: Number(row.input_per_1m),
    outputPer1m: Number(row.output_per_1m),
    currency: row.currency,
  }
}

/** 全量单价表(模型名是主键，键集由管理员维护)。要不要缓存交给调用方，服务层不做会话级记忆。 */
export async function fetchAiModelPrices(options: QueryOptions = {}): Promise<AiModelPrice[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db.from('ai_model_prices').select(AI_MODEL_PRICE_COLUMNS).order('model').range(from, to)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'stats.fetchAiModelPrices' },
  )
  return rows.map(toAiModelPrice)
}
