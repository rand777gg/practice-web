import { z } from 'zod'
import { getPrompt } from '@/stores/prompt-store'
import { getAiConfig } from './config'
import type { AssistantMode, AssistantReply, LittleQEmotion } from '@/lib/assistant-demo'

export interface AssistantTurn {
  role: 'user' | 'assistant'
  text: string
}

const replySchema = z.object({
  text: z.string(),
  sub: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  sources: z
    .array(z.object({ label: z.string(), type: z.enum(['题库', '专题', '文献', '真题']) }))
    .nullish(),
  followups: z.array(z.string()).nullish(),
  emotion: z.enum(['neutral', 'happy', 'concerned', 'thinking']),
})

const MODE_HINT: Record<AssistantMode, string> = {
  auto: '自动判断（心理陪伴还是专业课答疑，由你按用户这句话判断）',
  psych: '备考心理陪伴',
  study: '专业课答疑',
}

/**
 * 小Q 的一次回复。结构化输出的字段与内置剧本同形（见 assistant-demo.ts），
 * 所以接上模型后页面不用区分数据来自模型还是剧本。
 */
export async function chatWithLittleQ(
  input: string,
  history: AssistantTurn[],
  mode: AssistantMode,
): Promise<{ reply: AssistantReply; emotion: LittleQEmotion }> {
  const config = getAiConfig()
  if (!config.apiKey) throw new Error('AI_NOT_CONFIGURED')

  const transcript = history
    .slice(-8)
    .map((turn) => `${turn.role === 'user' ? '用户' : '小Q'}：${turn.text}`)
    .join('\n')

  const prompt = [
    `【当前模式】${MODE_HINT[mode]}`,
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

  const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
  const { object } = await generateObject({
    model: client(config.model || 'deepseek-chat'),
    schema: replySchema,
    system: getPrompt('assistant_persona'),
    prompt,
    temperature: 0.8,
    maxOutputTokens: 900,
  })

  return {
    reply: {
      text: object.text.trim(),
      sub: object.sub?.trim() || undefined,
      tags: object.tags?.length ? object.tags : undefined,
      sources: object.sources?.length ? object.sources : undefined,
      followups: object.followups?.length ? object.followups : undefined,
    },
    emotion: object.emotion,
  }
}
