/**
 * 一次回复是怎么产生的 —— 模型优先, 拿不到就退回内置剧本。
 *
 * 从 AssistantPage 里抽出来的原因: 悬浮面板和 /assistant 页共用同一份对话,
 * 生成逻辑只能有一处, 否则两个入口的降级行为迟早会不一样。
 */
import { hasAiConfig } from '@/lib/ai/config'
import {
  FALLBACK_EMOTION, FALLBACK_REPLY, matchScript,
  type AssistantMode, type AssistantReply, type LittleQEmotion,
} from '@/lib/assistant-demo'
import type { QuestionContext } from '@/lib/ai/question-context'
import type { AiRoundUsage } from '@/lib/ai-usage'
import type { AssistantTurn } from '@/lib/ai/assistant'

export interface ReplyOptions {
  skill?: { title: string; markdown: string }
  /** 会话 id: 服务端据此把这一轮的用量归到该会话(见 Section 76) */
  conversationId?: string
  /** 练习模式"解释当前题目"带进来的题干上下文 */
  question?: QuestionContext
}

export interface ReplyOutcome {
  reply: AssistantReply
  emotion: LittleQEmotion
  /** true = 这次是内置剧本答的(没配模型, 或模型调用失败) */
  scripted: boolean
  /** 这一轮真实花掉的 tokens; 剧本回答没有(没调模型, 也就没花钱) */
  usage: AiRoundUsage | null
}

/** 剧本回复给一点打字延迟: 秒回的长回答看起来像"根本没读我说的话" */
function scriptDelay(text: string): number {
  return 700 + Math.min(text.length * 4, 1100)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 没配模型时的"解释这道题"。
 *
 * 退回剧本(见下)在这里是不合适的: 用户手里正拿着一道题, 回一句通用关怀等于没回答。
 * 平台自己的解析就在上下文里, 直接念出来 —— 顺手说明这是本地解析、不是模型答的。
 */
function scriptedQuestionReply(ctx: QuestionContext): AssistantReply {
  const lines = [
    ctx.answer ? `这道题的答案是：${ctx.answer}` : '这道题没有标准答案，按解析里的要点人工判分。',
  ]
  return {
    text: lines.join('\n'),
    sub: ctx.explanation || '平台还没有给这道题写解析。配上模型之后我就能就着题干讲一遍。',
    tags: ['当前题目', '平台解析'],
  }
}

export async function produceReply(
  input: string,
  history: AssistantTurn[],
  mode: AssistantMode,
  options: ReplyOptions = {},
): Promise<ReplyOutcome> {
  if (hasAiConfig()) {
    try {
      const { chatWithLittleQ } = await import('@/lib/ai/assistant')
      const { reply, emotion, usage } = await chatWithLittleQ(input, history, mode, options)
      return { reply, emotion, scripted: false, usage }
    } catch (err) {
      // 模型挂了不该让整个对话不可用 —— 退回剧本, 并让调用方标出来是降级回答
      console.warn('[assistant] 模型回复失败, 退回内置剧本:', err)
    }
  }

  // 问到具体某道题时, 剧本答不了 —— 用平台解析兜底(仍然是"降级回答", 由调用方标出来)
  if (options.question) {
    const reply = scriptedQuestionReply(options.question)
    await sleep(scriptDelay(reply.text))
    return { reply, emotion: 'neutral', scripted: true, usage: null }
  }

  const script = matchScript(input, mode)
  const reply = script?.reply ?? FALLBACK_REPLY
  await sleep(scriptDelay(reply.text))
  return { reply, emotion: script?.emotion ?? FALLBACK_EMOTION, scripted: true, usage: null }
}
