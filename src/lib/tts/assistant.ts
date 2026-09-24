/**
 * 小Q 一条回答的朗读稿。
 *
 * 只读正文与那句补充说明 —— 引用角标 [2] 是给眼睛看的(它指向下面那张依据清单),
 * 念出来只剩"中括号二"; 依据清单、标签、追问按钮都不是回答本身。
 *
 * 全部塞进 answer 而不是 prompt: 「先问后答」是给题目用的(读完题干停下来等回忆),
 * 小Q 的回答没有"答案"这一说, 走 prompt 只会让它在半途刹住。
 *
 * 朗读走平台自己的 edge-tts worker(见 lib/tts/config 的 VITE_TTS_BASE_URL), 不经过
 * /functions/v1/ai —— 所以它既没有 token 也不在 AI 用量看板上, 别去那儿找。
 */
import { markdownToSpeech, splitForSpeech } from './speech'

export function assistantSpeech(text: string, sub?: string | null): string[] {
  const read = (md: string | null | undefined): string[] => {
    const spoken = markdownToSpeech(md).replace(/\[\d{1,2}\]/g, '')
    return splitForSpeech(spoken)
  }
  return [...read(text), ...read(sub)]
}
