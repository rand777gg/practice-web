/**
 * /create 的"需求"这一半 —— 纯数据与收口逻辑, 不含任何网络调用。
 *
 * 拆出来是为了能直接跑单元测试(见 scripts/assistant-commands-smoke.mjs): 参数收口是
 * 出题跑偏的第一道闸门, 而 assistant-create.ts 那边连着 supabase 与模型 SDK, 在 Node 里
 * 根本 import 不动。
 */
// 相对路径带扩展名: 这个模块要能被 Node 直接跑单元测试, 而 Node 不认 Vite 的 @/ 别名,
// 也不做无扩展名补全
import { QUESTION_TYPE_OPTIONS } from './constants.ts'
import type { RagSource } from '@/lib/rag'
import type { QuestionType } from '@/types'

export type CreateSource = 'resource' | 'platform' | 'model'
export type CreateSpread = 'spread' | 'focus'

/** 跨来源检索时可选的范围 */
export const PLATFORM_SOURCES = ['resource', 'question', 'kp', 'subject', 'note'] as const
export type PlatformSource = typeof PLATFORM_SOURCES[number]

export const PLATFORM_SOURCE_LABEL: Record<PlatformSource, string> = {
  resource: '文献',
  question: '题库',
  kp: '知识点解读',
  subject: '学科解读',
  note: '公开笔记',
}

/**
 * 范围限定 —— 最终落到一个**页码区间**。
 *
 * 不用标题字符串匹配: 同一本书里「小结」「思考题」每章都有, 拿字符串去匹配块所属的标题路径,
 * 选一次「小结」会把全书所有章的小结都圈进来。页码区间是互不重叠的, 与标题重名无关。
 */
export interface CreateScope {
  label: string
  from: number
  to: number
  /** 目录条目的 blockIndex, 只用于让下拉框恢复选中; 手填的范围为 null */
  tocKey: number | null
}

export interface CreateSpec {
  /** 从哪儿取材料: 指定某一篇文献 / 跨来源检索 / 不查资料纯模型出 */
  source: CreateSource
  /** source === 'resource' 时选中的文献 */
  documentId: string | null
  /** source === 'platform' 时只查这几类来源 */
  sources: PlatformSource[]
  /** null = 整篇/全部 */
  scope: CreateScope | null
  /** 主题或题干要求 */
  prompt: string
  count: number
  questionTypes: QuestionType[]
  subject: string | null
  categories: string[]
  /** 出题前先捞出题库里最相似的几道喂给模型, 让它避开已经出过的 */
  avoidDuplicates: boolean
  spread: CreateSpread
  /** 入库时直接标 verified —— 默认关: AI 出的题直接标"已核对"是拿自己的信用背书 */
  markVerified: boolean
}

export const COUNT_MAX = 20
export const COUNT_DEFAULT = 3

export const DEFAULT_CREATE_SPEC: CreateSpec = {
  source: 'platform',
  documentId: null,
  sources: [...PLATFORM_SOURCES],
  scope: null,
  prompt: '',
  count: COUNT_DEFAULT,
  questionTypes: ['single_choice'],
  subject: null,
  categories: [],
  avoidDuplicates: true,
  spread: 'spread',
  markVerified: false,
}

export const SOURCE_LABEL: Record<CreateSource, string> = {
  resource: '指定某一篇文献',
  platform: '跨来源检索',
  model: '不查资料，模型自己出',
}

export const SPREAD_LABEL: Record<CreateSpread, string> = {
  spread: '考点分散到多个知识点',
  focus: '考点集中在同一个知识点',
}

const TYPE_VALUES = new Set(QUESTION_TYPE_OPTIONS.map((o) => o.value as string))

function normalizeScope(input: unknown): CreateScope | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<CreateScope>
  const from = Math.round(Number(raw.from))
  const to = Math.round(Number(raw.to))
  // 只有一端有数字的范围没有意义(既不知道从哪开始, 也不知道到哪结束) → 当成不限
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) return null
  return {
    label: String(raw.label ?? '').trim() || `第 ${Math.min(from, to)}-${Math.max(from, to)} 页`,
    from: Math.min(from, to),
    to: Math.max(from, to),
    tocKey: Number.isFinite(Number(raw.tocKey)) ? Math.round(Number(raw.tocKey)) : null,
  }
}

/**
 * 收口。模型给的、用户填的、老数据反序列化出来的, 一律先过这里:
 * 数量夹到 1..20(一次出 50 道既没人看也一次确认不完)、题型剔掉平台不支持的、
 * 空的题型退回单选, 来源列表空了退回全选 —— 否则会在入库那一步才因为约束炸掉,
 * 那时题已经生成完, 白花钱。
 */
export function normalizeSpec(input: Partial<CreateSpec>): CreateSpec {
  const types = (input.questionTypes ?? []).filter((t): t is QuestionType => TYPE_VALUES.has(t))
  // 只有"正数"才算真的指定了数量: 0 / 负数 / NaN 都当成没说, 退回默认, 而不是夹成 1 ——
  // 夹成 1 的话"模型瞎给了一个 0"会变成"只出一道题", 用户以为出题坏了
  const raw = Math.round(Number(input.count))
  const count = Number.isFinite(raw) && raw > 0 ? Math.min(COUNT_MAX, raw) : COUNT_DEFAULT
  const source = input.source && input.source in SOURCE_LABEL ? input.source : DEFAULT_CREATE_SPEC.source
  const sources = (input.sources ?? []).filter((s): s is PlatformSource =>
    (PLATFORM_SOURCES as readonly string[]).includes(s))
  return {
    ...DEFAULT_CREATE_SPEC,
    ...input,
    source,
    // 选了"跨来源/不用资料"就不该再留着一个 documentId, 否则下次切回"指定文献"会莫名其妙
    documentId: source === 'resource' ? (input.documentId ?? null) : null,
    sources: sources.length > 0 ? sources : [...PLATFORM_SOURCES],
    // 页码区间只对"指定某一篇文献"有意义: 跨来源时几篇文献的页码是各算各的, 拿一个区间去筛
    // 只会莫名其妙地筛掉别的篇目
    scope: source === 'resource' ? normalizeScope(input.scope) : null,
    count,
    questionTypes: types.length > 0 ? types : DEFAULT_CREATE_SPEC.questionTypes,
    categories: (input.categories ?? []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 3),
    prompt: (input.prompt ?? '').trim(),
  }
}

/** 检索时用的来源清单: 只有跨来源那一档才需要传 */
export function retrievalSources(spec: CreateSpec): RagSource[] {
  if (spec.source === 'model') return []
  if (spec.source === 'resource') return ['resource']
  return spec.sources
}

/** 一句话概括这份参数, 给按钮旁边那行小字用 */
export function describeSpec(spec: CreateSpec): string {
  const where = spec.source === 'resource' && spec.documentId
    ? `指定文献${spec.scope ? ` · ${spec.scope.label}` : ''}`
    : SOURCE_LABEL[spec.source]
  const types = spec.questionTypes.length > 1 ? `${spec.questionTypes.length} 种题型` : '单一题型'
  return `${where} · ${spec.count} 道 · ${types}`
}
