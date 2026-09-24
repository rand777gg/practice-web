import { z } from 'zod'
import { getPrompt } from '@/stores/prompt-store'
import { getAiConfig } from './config'
import { searchKnowledge, RAG_SOURCE_LABEL, type RagHit } from '@/lib/rag'
import type { AiRoundUsage } from '@/lib/ai-usage'
import type { AssistantMode, AssistantReply, LittleQEmotion, AssistantSource } from '@/lib/assistant-demo'

export interface AssistantTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface LittleQOptions {
  /** 当前会话挂着的平台技能: SKILL.md 作为固定上下文注入 */
  skill?: { title: string; markdown: string }
  /** 落库用的会话 id —— 服务端据此把这次调用的用量归到该会话上(见 Section 76) */
  conversationId?: string
}

/**
 * 技能文档超长时截断。
 * 这两份 SKILL.md 各 6-7KB, 每轮都全量注入是能接受的成本; 但技能库以后会长,
 * 所以还是设个上限 —— 宁可让模型说"文档没看全", 也不要把上下文挤爆。
 */
const SKILL_MAX_CHARS = 9000

function skillSection(skill: LittleQOptions['skill']): string | null {
  if (!skill?.markdown.trim()) return null
  const body = skill.markdown.length > SKILL_MAX_CHARS
    ? `${skill.markdown.slice(0, SKILL_MAX_CHARS)}\n……（技能文档过长，此处已截断）`
    : skill.markdown
  return [
    `【当前技能：${skill.title}】用户用 /skill 指定了这个技能，本次及后续对话都按它来。`,
    '要求：按文档里的步骤顺序带用户做，不要跳步；引用某一步时说明是第几步；',
    '文档里没写的内容不要当成技能的一部分来承诺；文档要求"未验证就说未验证"时照办。',
    '',
    body,
  ].join('\n')
}

const replySchema = z.object({
  text: z.string(),
  sub: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  followups: z.array(z.string()).nullish(),
  emotion: z.enum(['neutral', 'happy', 'concerned', 'thinking']),
  /**
   * 用到了资料里的哪几条 —— 只让模型回序号, 不让它写文献名/页码。
   * 模型编造出处是 RAG 最典型的失信方式, 而序号它编不出来: 序号超出范围就直接丢弃。
   */
  used: z.array(z.number()).nullish(),
})

const MODE_HINT: Record<AssistantMode, string> = {
  auto: '自动判断（心理陪伴还是专业课答疑，由你按用户这句话判断）',
  psych: '备考心理陪伴',
  study: '专业课答疑',
}

const RAG_TYPE: Record<string, AssistantSource['type']> = {
  resource: '文献',
  question: '题库',
  kp: '专题',
  subject: '专题',
  note: '笔记',
}

function buildContext(hits: RagHit[]): string {
  return hits
    .map((h, i) => {
      const where = [
        RAG_SOURCE_LABEL[h.source],
        h.label && `《${h.label}》`,
        h.pageNo ? `第 ${h.pageNo} 页` : '',
        h.subLabel && h.subLabel !== h.label ? h.subLabel : '',
      ].filter(Boolean).join(' · ')
      return `[${i + 1}] (${where}) ${h.content.replace(/\s+/g, ' ').trim()}`
    })
    .join('\n')
}

function toSources(hits: RagHit[], used: number[] | null | undefined): AssistantSource[] | undefined {
  if (!used?.length) return undefined
  // 去重 + 按编号升序: 正文里标的是 [1]、[7], 下面这张清单也得按 1、7 排。
  // 按模型报的顺序排会变成"第一条其实是 [7]", 用户拿正文的编号来对就对不上了。
  const picked = [...new Set(used.map((n) => Math.round(Number(n))))]
    // 越界的序号直接丢: 模型偶尔会编号错位, 宁可少给一条引用也不要给错的
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= hits.length)
    .sort((a, b) => a - b)
    .slice(0, 5)
  if (picked.length === 0) return undefined

  return picked.map((n) => {
    const h = hits[n - 1]
    return {
      // 正文里那个 [n] —— 清单要靠它才能和正文互相指认
      index: n,
      label: h.pageNo ? `${h.label} · 第 ${h.pageNo} 页` : h.label,
      type: RAG_TYPE[h.source] ?? '专题',
      anchor: h.anchor ?? undefined,
      snippet: h.content.replace(/\s+/g, ' ').trim().slice(0, 400),
      pageNo: h.pageNo ?? undefined,
    }
  })
}

/**
 * 小Q 的一次回复。结构化输出的字段与内置剧本同形（见 assistant-demo.ts），
 * 所以接上模型后页面不用区分数据来自模型还是剧本。
 *
 * 与最初版本的差别: 回答前先跨来源检索一次(文献/题库/知识点解读/公开笔记), 把命中的
 * 内容编号后作为资料喂给模型, 并要求它只用序号声明引用 —— 引用条目的名称、页码、
 * 跳转地址全部由前端用序号映射回真实检索结果, 模型无从编造。
 */
export async function chatWithLittleQ(
  input: string,
  history: AssistantTurn[],
  mode: AssistantMode,
  options: LittleQOptions = {},
): Promise<{ reply: AssistantReply; emotion: LittleQEmotion; usage: AiRoundUsage | null }> {
  const config = getAiConfig('assistant', options.conversationId)
  if (!config.apiKey) throw new Error('AI_NOT_CONFIGURED')

  // 检索失败不能让小Q 整个用不了: 拿不到资料就当普通对话回答
  let hits: RagHit[] = []
  try {
    const result = await searchKnowledge(input, { limit: 8 })
    hits = result.hits
  } catch (err) {
    console.warn('[assistant] 检索失败, 以无资料模式回答:', err)
  }

  const transcript = history
    .slice(-8)
    .map((turn) => `${turn.role === 'user' ? '用户' : '小Q'}：${turn.text}`)
    .join('\n')

  const prompt = [
    `【当前模式】${MODE_HINT[mode]}`,
    skillSection(options.skill),
    hits.length > 0
      ? [
        '【可引用资料】以下是从平台资料库检索到的内容，按编号引用：',
        buildContext(hits),
        '',
        '引用规则：',
        '1. 用到资料里的内容时，**每一处**都要在句末跟上编号，例如「……[2]」；连续两处就写「[2][5]」；text 与 sub 里都算，哪一段用了资料就在那一段末尾标；',
        '2. used 只填正文里标过的编号，且要和正文完全一致（正文写「[3][7]」就只填 3、7，不要多报）；',
        '3. 正文里一个编号都没标，就等于没有引用 —— 那种情况下 used 必须留空，不要只在 used 里报编号；',
        '4. 资料里没有的内容就不要写成有依据的结论，可以说资料没覆盖、并给出你自己的判断；',
        '5. 不要凭空写出文献名或页码 —— 这些由前端根据编号补全。',
      ].join('\n')
      : '【可引用资料】本次没有检索到相关资料。如果用户问的是专业课问题，请在回答里说明平台资料暂未覆盖，不要编造出处。',
    transcript && `【最近对话】\n${transcript}`,
    `【本轮用户消息】\n${input}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  // SDK 只在真正要发请求时才加载, 免得进搭子页的首屏包
  const [{ createDeepSeek }, { generateObject }] = await Promise.all([
    import('@ai-sdk/deepseek'),
    import('ai'),
  ])

  const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: config.fetch })
  const modelId = config.model || 'deepseek-chat'
  const { object, usage } = await generateObject({
    model: client(modelId),
    schema: replySchema,
    system: getPrompt('assistant_persona'),
    prompt,
    temperature: 0.8,
    maxOutputTokens: 900,
  })

  // 模型名取**配置里那个**而不是 response 里回的: 服务端埋点记的也是请求体里的 model,
  // 两边用同一个名字, 单价表和用量页才对得上(见 src/lib/ai-usage 的 costOfRound)。
  const promptTokens = usage?.inputTokens ?? 0
  const completionTokens = usage?.outputTokens ?? 0
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens

  // 正文里的编号是**唯一可信的引用声明**。
  //
  // 为什么不再优先信 used: 实测同一轮里正文标了 [3][7][2][5], 而 used 填了五个(多一个 4) ——
  // 照着 used 出清单就会出现一条正文里根本不存在的号, 用户拿着去正文里找必然找不到,
  // 那正是"引用没有标号"要修的东西。正文没标任何编号时才退回 used(那种情况页面上会写明),
  // 宁可这样, 也不要把"模型说它用过"当作"正文里引用了"。
  //
  // sub 也要一起扫: 模型常把编号标在"具体做法"那几行里(实测 text 一句没标、sub 标了两个),
  // 而读者看到的是两段, 只扫 text 会把真正的引用当成没标。
  const fromText = [...new Set(
    [...`${object.text}\n${object.sub ?? ''}`.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])),
  )]
  const used = fromText.length > 0 ? fromText : object.used ?? []

  return {
    reply: {
      text: object.text.trim(),
      sub: object.sub?.trim() || undefined,
      tags: object.tags?.length ? object.tags : undefined,
      sources: toSources(hits, used),
      followups: object.followups?.length ? object.followups : undefined,
    },
    emotion: object.emotion,
    // 上游没回 usage 就是"这一轮没记到用量", 不是"只花了 0 个 tokens" ——
    // 宁可不显示这一行(以及不计入会话累计), 也不要给一个看着像真的零。
    usage: totalTokens > 0 ? { model: modelId, promptTokens, completionTokens, totalTokens } : null,
  }
}
