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
 * 选中的资料内容 —— 出题的唯一材料来源。
 *
 * 为什么存 blockIndex 而不是"章节名"或"页码"就完事: 用户要能在弹窗里勾到**具体段落**,
 * 而段落是唯一的锚点。blocks 为空表示"整个 [from,to] 页码区间", 这样"整节"这种粗选
 * 不必把几百个 blockIndex 塞进 JSONB, 老数据(只有页码区间)也能直接升上来。
 */
export interface CreateSelection {
  documentId: string
  documentTitle: string
  /** 展示用: "第一章 绪论 · 第 1-7 页 · 23 段" */
  label: string
  from: number
  to: number
  /** 精确到段的选中(已排序去重); 空数组 = [from,to] 全部 */
  blocks: number[]
}

export interface CreateSpec {
  /** 从哪儿取材料: 指定某一篇文献 / 跨来源检索 / 不查资料纯模型出 */
  source: CreateSource
  /** source === 'resource' 时选中的文献 */
  documentId: string | null
  /** source === 'platform' 时只查这几类来源 */
  sources: PlatformSource[]
  /** 选中的资料内容(指定文献时才有) */
  selection: CreateSelection | null
  /**
   * 用户那句自然语言的原文。
   * 卡片上**不再有输入框**(要出什么题由"选中的内容"决定), 但它仍有两个用处:
   * 跨来源检索的查询词, 以及"打开弹窗时该预勾选哪里"的依据。
   */
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
  selection: null,
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

/** 平台的真实题型集合里有没有这个值 —— 从库里/模型手里拿到的字符串一律先过这里 */
export function asQuestionType(value: unknown): QuestionType | null {
  return typeof value === 'string' && TYPE_VALUES.has(value) ? (value as QuestionType) : null
}

/**
 * 选中内容的收口。
 *
 * 老数据(只有 { label, from, to } 的 scope)会以 blocks: [] 升上来 —— 也就是"整个页码区间",
 * 和它当年的语义一致, 所以旧卡片不会因为这次改结构而丢东西。
 */
export function normalizeSelection(input: unknown): CreateSelection | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<CreateSelection>
  const documentId = typeof raw.documentId === 'string' && raw.documentId ? raw.documentId : null
  const from = Math.round(Number(raw.from))
  const to = Math.round(Number(raw.to))
  if (!documentId || !Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) return null

  // 只用**真正的数字**: 不能拿 Number() 去转, 因为 Number(null) 是 0, 一个 null 会变成"第 0 段"
  const blocks = Array.isArray(raw.blocks)
    ? [...new Set(
      raw.blocks
        .filter((b): b is number => typeof b === 'number' && Number.isFinite(b))
        .map((b) => Math.round(b)),
    )].sort((a, b) => a - b)
    : []

  const low = Math.min(from, to)
  const high = Math.max(from, to)
  return {
    documentId,
    documentTitle: typeof raw.documentTitle === 'string' ? raw.documentTitle : '',
    label: (typeof raw.label === 'string' ? raw.label : '').trim()
      || (low === high ? `第 ${low} 页` : `第 ${low}-${high} 页`),
    from: low,
    to: high,
    blocks,
  }
}

/** 卡片/按钮上那行说明。段落数只有真的勾过才知道, 所以按有无 blocks 两套说法 */
export function selectionSummary(selection: CreateSelection): string {
  const pages = selection.to > selection.from ? `第 ${selection.from}-${selection.to} 页` : `第 ${selection.from} 页`
  return selection.blocks.length > 0
    ? `${selection.label} · ${pages} · ${selection.blocks.length} 段`
    : `${selection.label} · ${pages}`
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
    selection: source === 'resource' ? normalizeSelection(input.selection) : null,
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
  const where = spec.source === 'resource'
    ? (spec.selection ? selectionSummary(spec.selection) : '指定文献（还没选内容）')
    : SOURCE_LABEL[spec.source]
  const types = spec.questionTypes.length > 1 ? `${spec.questionTypes.length} 种题型` : '单一题型'
  return `${where} · ${spec.count} 道 · ${types}`
}
