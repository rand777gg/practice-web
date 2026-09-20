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
import type { AssistantTurn } from '@/lib/ai/assistant'

export interface ReplyOutcome {
  reply: AssistantReply
  emotion: LittleQEmotion
  /** true = 这次是内置剧本答的(没配模型, 或模型调用失败) */
  scripted: boolean
}

/** 剧本回复给一点打字延迟: 秒回的长回答看起来像"根本没读我说的话" */
function scriptDelay(text: string): number {
  return 700 + Math.min(text.length * 4, 1100)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function produceReply(
  input: string,
  history: AssistantTurn[],
  mode: AssistantMode,
): Promise<ReplyOutcome> {
  if (hasAiConfig()) {
    try {
      const { chatWithLittleQ } = await import('@/lib/ai/assistant')
      const { reply, emotion } = await chatWithLittleQ(input, history, mode)
      return { reply, emotion, scripted: false }
    } catch (err) {
      // 模型挂了不该让整个对话不可用 —— 退回剧本, 并让调用方标出来是降级回答
      console.warn('[assistant] 模型回复失败, 退回内置剧本:', err)
    }
  }

  const script = matchScript(input, mode)
  const reply = script?.reply ?? FALLBACK_REPLY
  await sleep(scriptDelay(reply.text))
  return { reply, emotion: script?.emotion ?? FALLBACK_EMOTION, scripted: true }
}
