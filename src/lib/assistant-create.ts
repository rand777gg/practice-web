/**
 * /create 的"先对齐需求，再出题"。
 *
 * 三步:
 *   1. parseCreateRequest —— 模型把用户那句话解析成一份参数提案(它理解成什么, 用人话复述一遍)
 *   2. 卡片让用户改 / 补齐 —— 表单保证字段不漏, 模型只负责"听懂"
 *   3. generateFromSpec —— 按确认后的参数出题
 *
 * 为什么不让模型用自然语言一题一题问: 它不保证问全(漏 count / category 是常态), 一轮一次
 * 调用也白花钱; 而"该判给哪个学科"这种字段本身就是从已有选项里选, 让用户点两下最准。
 */
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { autoIndex } from '@/lib/rag'
import { searchKnowledge, type RagHit } from '@/lib/rag'
import { hasAiConfig, getAiConfig } from '@/lib/ai/config'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import {
  DEFAULT_CREATE_SPEC, DIFFICULTY_LABEL, normalizeSpec, type CreateSource, type CreateSpec,
} from '@/lib/create-spec'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { CorrectAnswer, QuestionType } from '@/types'

export type {
  CreateDifficulty, CreateSource, CreateSpec, CreateSpread,
} from '@/lib/create-spec'
export {
  COUNT_DEFAULT, COUNT_MAX, DEFAULT_CREATE_SPEC, DIFFICULTY_LABEL, SOURCE_LABEL, SPREAD_LABEL,
  describeSpec, normalizeSpec,
} from '@/lib/create-spec'

const TYPE_VALUES = new Set(QUESTION_TYPE_OPTIONS.map((o) => o.value as string))

// ── 1. 让模型把一句话解析成参数提案 ──

const specSchema = z.object({
  /** 用人话复述一遍"我理解你要的是…", 让用户一眼看出有没有理解偏 */
  understanding: z.string(),
  prompt: z.string(),
  count: z.number().nullish(),
  questionTypes: z.array(z.string()).nullish(),
  subject: z.string().nullish(),
  categories: z.array(z.string()).nullish(),
  /** 用户提到的资料名, 用来在已发布文献里找对应那一篇 */
  documentTitle: z.string().nullish(),
  scope: z.string().nullish(),
  source: z.enum(['resource', 'platform', 'model']).nullish(),
  spread: z.enum(['spread', 'focus']).nullish(),
  difficulty: z.enum(['easy', 'normal', 'hard']).nullish(),
  avoidDuplicates: z.boolean().nullish(),
  markVerified: z.boolean().nullish(),
})

export interface ParsedCreateRequest {
  spec: CreateSpec
  understanding: string
}

/**
 * 解析用户那句话。解析失败不该让 /create 不能用 —— 退回"只把原话当主题"的空提案,
 * 用户在卡片上补字段照样能出题。
 */
export async function parseCreateRequest(
  text: string,
  options: { subjects: string[]; categories: string[]; documents: { id: string; title: string }[] },
): Promise<ParsedCreateRequest> {
  const fallback: ParsedCreateRequest = {
    spec: { ...DEFAULT_CREATE_SPEC, prompt: text.trim() },
    understanding: text.trim()
      ? `按你说的「${text.trim()}」出题。下面几项我拿不准，你确认一下。`
      : '这次没给要求，先选好参数再出题。',
  }
  if (!hasAiConfig() || !text.trim()) return fallback

  try {
    const [{ createDeepSeek }, { generateObject }] = await Promise.all([
      import('@ai-sdk/deepseek'),
      import('ai'),
    ])
    const config = getAiConfig()
    const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })

    const prompt = [
      '用户在刷题平台的小Q 对话框里输入了下面这句话，想生成练习题。把它解析成参数。',
      '',
      `平台已有学科（subject 只能从这里选，选不到就留空）：${options.subjects.join('、') || '（暂无）'}`,
      `平台已有分类（categories 只能从这里选，选不到就留空）：${options.categories.join('、') || '（暂无）'}`,
      `可选题型：${QUESTION_TYPE_OPTIONS.map((o) => `${o.value}(${o.label})`).join('、')}`,
      `资料库里已发布的文献（用户提到某一篇时，把资料名原样填进 documentTitle）：${
        options.documents.map((d) => d.title).join('、') || '（暂无）'}`,
      '',
      '字段说明：',
      '- prompt：出题的主题或题干要求（保留用户的原始说法，不要自己加料）',
      '- count：要几道。用户没说就留空，不要瞎猜一个数',
      '- questionTypes：题型。用户没指定就留空',
      '- subject / categories：只有当用户明说了、而且能在上面的清单里对上时才填',
      '- documentTitle：用户指定了从某篇文献出题时填（原样，不要改写）',
      '- scope：用户限定了章节或页码范围时填（例如"第 3 章"、"40-60 页"）',
      '- source：用户要在指定文献里出题填 resource；说"用平台资料/文献/题库"填 platform；',
      '  说"不用查资料/你直接出"填 model；没说就填 platform',
      '- spread：用户要求题目分布在多个知识点填 spread；要求围绕同一个知识点填 focus',
      '- avoidDuplicates：用户提到"别跟题库重复"填 true；说"不用管重复"填 false；没说留空',
      '- markVerified：不要填，入库状态由用户在界面上决定',
      '',
      `用户输入：${text.trim()}`,
    ].join('\n')

    const { object } = await generateObject({
      model: client(config.model || 'deepseek-chat'),
      schema: specSchema,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 700,
    })

    // 文献名 → id: 模型只回名字, 由前端在真实的已发布列表里对齐, 免得它编一个 id 出来
    let documentId: string | null = null
    const wanted = object.documentTitle?.trim()
    if (wanted) {
      const hit = options.documents.find((d) => d.title === wanted)
        ?? options.documents.find((d) => d.title.includes(wanted) || wanted.includes(d.title))
      documentId = hit?.id ?? null
    }
    const source: CreateSource = documentId ? 'resource' : (object.source ?? 'platform')

    const spec = normalizeSpec({
      source,
      documentId,
      scope: object.scope ?? '',
      prompt: object.prompt || text,
      count: object.count ?? undefined,
      questionTypes: (object.questionTypes ?? []).filter((t): t is QuestionType => TYPE_VALUES.has(t)),
      subject: options.subjects.includes(object.subject ?? '') ? object.subject! : null,
      categories: (object.categories ?? []).filter((c) => options.categories.includes(c)),
      avoidDuplicates: object.avoidDuplicates ?? DEFAULT_CREATE_SPEC.avoidDuplicates,
      spread: object.spread ?? DEFAULT_CREATE_SPEC.spread,
      difficulty: object.difficulty ?? DEFAULT_CREATE_SPEC.difficulty,
      markVerified: false,
    })

    // 用户说了从某篇出题, 但名字对不上库里的任何一篇 → 明说, 不要静默改成跨来源
    const understanding = object.documentTitle && !documentId
      ? `${object.understanding}\n（没找到叫「${object.documentTitle}」的已发布文献，资料库那一项我留成了跨来源，你改一下）`
      : object.understanding

    return { spec, understanding }
  } catch (err) {
    console.warn('[create] 参数解析失败, 退回手动确认:', err)
    return fallback
  }
}

// ── 2. 按确认后的参数出题 ──

export interface CreateResult {
  questions: ParsedQuestion[]
  /** 材料是否来自平台资料 */
  grounded: boolean
  /** 出题依据了哪几处, 卡片上列出来供核对 */
  sources: { label: string; pageNo: number | null; anchor: string | null }[]
  /** 用户填的范围一条都没匹配上时, 回填说明 */
  scopeMissed: boolean
}

function materialFrom(hits: RagHit[]): string {
  return hits
    .map((h, i) => {
      const where = [h.label, h.pageNo ? `第 ${h.pageNo} 页` : '', h.subLabel && h.subLabel !== h.label ? h.subLabel : '']
        .filter(Boolean).join(' · ')
      return `[${i + 1}]（${where}）\n${h.content.replace(/\s+/g, ' ').trim()}`
    })
    .join('\n\n')
}

/** 出题时要塞进 system prompt 的额外要求 —— 两个生成入口都接受 systemPrompt 覆盖 */
function extraInstructions(spec: CreateSpec, existing: string[]): string {
  const lines = [
    '补充要求（优先级高于上面的默认设定）：',
    `- 出题数量：正好 ${spec.count} 道。`,
    `- 题型只能是：${spec.questionTypes.map((t) => QUESTION_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t).join('、')}。`,
    `- 每题都必须填写 key_points（3-5 个核心知识点，逗号分隔，每项不超过 10 个字）—— 平台的练习进度按知识点统计，这一项为空这道题就不进任何知识点统计。`,
    `- 难度：${DIFFICULTY_LABEL[spec.difficulty]}。`,
    spec.spread === 'focus'
      ? '- 这几道题全部围绕同一个知识点，从不同角度反复考它。'
      : `- 这几道题必须分散在 ${spec.count} 个不同的知识点上，不要出成同一道题的换皮。`,
  ]

  if (existing.length > 0) {
    lines.push(
      '',
      '以下是平台题库里已经存在的、与本主题最接近的题目。绝不能出与它们相同或高度相似的题：',
      ...existing.map((e, i) => `${i + 1}. ${e}`),
    )
  }

  return lines.join('\n')
}

/**
 * 按参数出题。
 *
 * 材料 → generateFromText（有料就走"识别知识点后以考官视角出题"那条路）
 * 无料 → generateQuestions（按学科/题型/主题描述出题）
 * 两条都复用 DeepSeekParser 里已有的结构化输出与 normalize, 不另起一套 —— 那边的
 * correct_answer 题型纠偏(判断题选项、填空题答案数组等)是踩过坑的, 重写等于重新踩一遍。
 */
export async function generateFromSpec(spec: CreateSpec): Promise<CreateResult> {
  if (!hasAiConfig()) throw new Error('当前没有配置可用的模型，没法出题')
  const s = normalizeSpec(spec)
  const { getPrompt } = await import('@/stores/prompt-store')
  const { generateFromText, generateQuestions } = await import('@/lib/ai')

  // 材料检索
  let hits: RagHit[] = []
  let scopeMissed = false
  if (s.source !== 'model') {
    const query = [s.prompt, s.scope].filter(Boolean).join(' ')
    const result = await searchKnowledge(query || '核心知识点', {
      sources: s.source === 'resource' ? ['resource'] : ['resource', 'question', 'kp', 'subject', 'note'],
      sourceIds: s.source === 'resource' && s.documentId ? [s.documentId] : undefined,
      limit: 10,
    })
    hits = result.hits
    // 范围限定是拿"块所属的标题路径"做包含匹配的: 匹配不上就如实说, 而不是假装限定住了
    if (s.scope) {
      const scoped = hits.filter((h) => (h.subLabel ?? '').includes(s.scope) || String(h.pageNo ?? '') === s.scope)
      if (scoped.length > 0) hits = scoped
      else scopeMissed = hits.length > 0
    }
  }

  const grounded = hits.length > 0

  // 避重清单: 从题库里捞最相似的几道, 让模型知道"这些已经出过"
  const existing: string[] = []
  if (s.avoidDuplicates) {
    try {
      const dup = await searchKnowledge(s.prompt || '知识点', { sources: ['question'], limit: 8 })
      for (const h of dup.hits) if (h.label) existing.push(h.label)
    } catch (err) {
      console.warn('[create] 避重清单取失败, 这轮不做避重:', err)
    }
  }

  const suffix = extraInstructions(s, existing)
  const system = `${getPrompt(s.source === 'resource' || grounded ? 'generate_doc' : 'generate_questions')}\n\n${suffix}`

  // 材料里带页码, 模型才有依据往 source_page 里填
  const questions = grounded
    ? (await generateFromText({
      documentText: materialFrom(hits),
      subject: s.subject ?? undefined,
      questionTypes: s.questionTypes,
      count: s.count,
    }, system)).questions
    : (await generateQuestions({
      subject: s.subject ?? '综合',
      questionTypes: s.questionTypes,
      count: s.count,
      topicDescription: s.prompt,
    }, system)).questions

  // 页码回填只认我们真的给出去过的页码, 模型自己编的一律清掉
  const allowedPages = new Set(hits.map((h) => h.pageNo).filter((n): n is number => typeof n === 'number'))
  const cleaned = questions.slice(0, s.count).map((q) => {
    if (!grounded || !q.source_page) return q
    const hit = /\d+/.exec(q.source_page)
    if (!hit) return { ...q, source_page: undefined }
    const page = Number(hit[0])
    return allowedPages.has(page) ? q : { ...q, source_page: undefined }
  })

  return {
    questions: cleaned,
    grounded,
    scopeMissed,
    sources: hits.slice(0, 6).map((h) => ({ label: h.label, pageNo: h.pageNo, anchor: h.anchor })),
  }
}

// ── 3. 入库 ──

export interface QuestionRowMeta {
  subject: string | null
  /** 多个分类时第一个同时写进 category 列(有触发器同步, 这里只是显式给出) */
  categories: string[]
  importMode: string
  /** 解析出来的 source_page 为空时的兜底, 导入页用来记页码范围 */
  sourcePageFallback?: string | null
  verified?: boolean
}

export function questionRowFromParsed(q: ParsedQuestion, meta: QuestionRowMeta): Record<string, unknown> {
  return {
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options,
    correct_answer: (q.correct_answer ?? '') as CorrectAnswer,
    category: meta.categories[0] ?? null,
    categories: meta.categories,
    subject: meta.subject,
    analysis: q.analysis?.trim() || null,
    key_points: q.key_points?.trim() || null,
    answer_explanation: q.answer_explanation?.trim() || null,
    seq_number: null,
    import_mode: meta.importMode,
    source_page: q.source_page || meta.sourcePageFallback || null,
    verified: meta.verified ?? q.verified ?? false,
    allow_unordered: q.allow_unordered ?? false,
  }
}

/**
 * 确认入库。写完立刻补索引 —— 不补的话这几道新题在重建索引之前搜不到,
 * 而"刚出的题在对话里搜不到"看起来就像出题失败了。
 */
export async function insertCreatedQuestions(
  questions: ParsedQuestion[],
  meta: QuestionRowMeta,
): Promise<number> {
  if (questions.length === 0) return 0
  const { data, error } = await supabase
    .from('questions')
    .insert(questions.map((q) => questionRowFromParsed(q, meta)))
    .select('id')
  if (error) throw new Error(`入库失败: ${error.message}`)
  autoIndex('question')
  return (data ?? []).length
}
