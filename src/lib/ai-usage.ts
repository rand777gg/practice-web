/**
 * AI 用量数据层 —— 「AI 接入管理」看板读的东西。
 *
 * 数据来自服务端埋点(见 supabase/migrations Section 72): 每次走平台代理的模型调用都会落一行,
 * 这里只负责把它取回来、把字段名翻译成前端习惯的驼峰。所有聚合都在 SQL 里算完
 * (ai_usage_overview), 前端不再二次统计 —— 免得"卡片上的总数"和"图表里的柱子"对不上。
 */
import { supabase } from '@/lib/supabase'

export interface AiUsageTotals {
  calls: number
  failed: number
  promptTokens: number
  completionTokens: number
  tokens: number
  cost: number
  avgLatencyMs: number
  /** 没有单价记录的调用数: 这部分算不进成本, 页面上要如实说明 */
  unpricedCalls: number
}

export interface AiUsageDay {
  day: string
  calls: number
  failed: number
  tokens: number
  cost: number
  /** 当天各模型的调用次数, 趋势图按它拆多条线 */
  byModel: Record<string, number>
}

export interface AiUsageModelRow {
  model: string
  calls: number
  tokens: number
  cost: number
  avgLatencyMs: number
  priced: boolean
  share: number
}

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

export interface AiUsageOverview {
  days: number
  totals: AiUsageTotals
  /** 上一个等长窗口的合计, 用来算"较上一周期" */
  prev: { calls: number; tokens: number; cost: number }
  daily: AiUsageDay[]
  models: AiUsageModelRow[]
  recent: AiUsageLog[]
}

export interface AiModelPrice {
  model: string
  inputPer1m: number
  outputPer1m: number
  currency: string
}

interface RawOverview {
  days?: number
  totals?: Partial<Record<string, number>>
  prev?: Partial<Record<string, number>>
  daily?: { day: string; calls: number; failed: number; tokens: number; cost: number; by_model: Record<string, number> }[]
  models?: {
    model: string; calls: number; tokens: number; cost: number
    avg_latency_ms: number; priced: boolean; share: number
  }[]
  recent?: {
    id: number; model: string; source: string | null; ok: boolean
    status_code: number | null; latency_ms: number | null; tokens: number; created_at: string
  }[]
}

export async function loadAiUsage(days = 7): Promise<AiUsageOverview> {
  const { data, error } = await supabase.rpc('ai_usage_overview', { p_days: days }) as {
    data: RawOverview | null
    error: { message: string } | null
  }
  if (error) throw new Error(`读取用量失败: ${error.message}`)

  const raw = data ?? {}
  const totals = raw.totals ?? {}
  const prev = raw.prev ?? {}
  return {
    days: raw.days ?? days,
    totals: {
      calls: totals.calls ?? 0,
      failed: totals.failed ?? 0,
      promptTokens: totals.prompt_tokens ?? 0,
      completionTokens: totals.completion_tokens ?? 0,
      tokens: totals.tokens ?? 0,
      cost: totals.cost ?? 0,
      avgLatencyMs: totals.avg_latency_ms ?? 0,
      unpricedCalls: totals.unpriced_calls ?? 0,
    },
    prev: { calls: prev.calls ?? 0, tokens: prev.tokens ?? 0, cost: prev.cost ?? 0 },
    daily: (raw.daily ?? []).map((d) => ({
      day: d.day,
      calls: d.calls,
      failed: d.failed,
      tokens: d.tokens,
      cost: d.cost,
      byModel: d.by_model ?? {},
    })),
    models: (raw.models ?? []).map((m) => ({
      model: m.model,
      calls: m.calls,
      tokens: m.tokens,
      cost: m.cost,
      avgLatencyMs: m.avg_latency_ms,
      priced: m.priced,
      share: m.share,
    })),
    recent: (raw.recent ?? []).map(toLog),
  }
}

function toLog(r: NonNullable<RawOverview['recent']>[number]): AiUsageLog {
  return {
    id: r.id,
    model: r.model,
    source: r.source,
    ok: r.ok,
    statusCode: r.status_code,
    latencyMs: r.latency_ms,
    tokens: r.tokens,
    createdAt: r.created_at,
  }
}

/** 「查看更多」用: 直接翻明细表, 比把 overview 撑大更省 */
export async function loadAiUsageLogs(limit = 50): Promise<AiUsageLog[]> {
  const { data, error } = await supabase
    .from('ai_usage')
    .select('id, model, source, ok, status_code, latency_ms, prompt_tokens, completion_tokens, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`读取调用日志失败: ${error.message}`)
  return (data ?? []).map((r) => toLog({
    id: r.id,
    model: r.model,
    source: r.source,
    ok: r.ok,
    status_code: r.status_code,
    latency_ms: r.latency_ms,
    tokens: (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
    created_at: r.created_at,
  }))
}

export async function loadAiPrices(): Promise<AiModelPrice[]> {
  const { data, error } = await supabase
    .from('ai_model_prices')
    .select('model, input_per_1m, output_per_1m, currency')
    .order('model')
  if (error) throw new Error(`读取单价失败: ${error.message}`)
  return (data ?? []).map((r) => ({
    model: r.model,
    inputPer1m: Number(r.input_per_1m),
    outputPer1m: Number(r.output_per_1m),
    currency: r.currency,
  }))
}

/**
 * 场景标签。值来自各调用点传给 getAiConfig() 的 source(见 src/lib/ai/config.ts),
 * 认不出来的照原样显示 —— 新加场景时这里漏了也能看出是哪个, 不会显示成"未知"。
 */
export const AI_SOURCE_LABELS: Record<string, string> = {
  assistant: '小Q 对话',
  'assistant-create': '小Q 出题',
  grade: '简答批改',
  summary: '学习总结',
  chart: '图表解读',
  markdown: 'Markdown 换行',
  question: '题干识别',
  import: 'AI 导题',
  prompt: '提示词测试',
  profile: '昵称生成',
  probe: '连接测试',
}

export function aiSourceLabel(source: string | null): string {
  if (!source) return '未标注'
  return AI_SOURCE_LABELS[source] ?? source
}

export function formatCount(n: number): string {
  return n.toLocaleString('zh-CN')
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function formatCost(n: number): string {
  if (n === 0) return '¥0'
  if (n < 0.01) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(2)}`
}

export function formatLatency(ms: number | null): string {
  if (ms === null || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatLogTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 与上一周期相比的变化率; 上一周期为 0 时给不出百分比(返回 null, 由页面显示"新增") */
export function deltaRatio(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return (current - previous) / previous
}
