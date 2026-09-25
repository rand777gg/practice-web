/**
 * 「相关真题」的读写 —— 拆出来是为了让 kp-question-refs.ts 保持纯函数, 能被 Node 直接跑验证。
 *
 * 关联只存 question_id + 备注: 题干、选项、答案、解析**不存快照**, 读的时候现查题目 ——
 * 题库里的题随时会被改(甚至被合并重复题), 存了快照反而会显示一道已经不存在的题。
 * 只有文献依据那边才需要快照(原文献下线后"当初引的是这段"仍然成立)。
 */
import { logError, userMessage } from '@/services/errors'
import {
  listKpQuestions as listKpQuestionRefs,
  saveKpQuestions as saveKpQuestionRefs,
  searchLinkedQuestions,
} from '@/services/questions'
import type { KpQuestionDraft, KpQuestionLink, LinkedQuestion } from '@/lib/kp-question-refs'

/** 某条解读挂的全部真题(按管理员排的顺序) */
export async function listKpQuestions(subject: string, kp: string): Promise<KpQuestionLink[]> {
  if (!subject || !kp) return []
  try {
    return await listKpQuestionRefs(subject, kp)
  } catch (e) {
    logError('kp-question-refs.listKpQuestions', e)
    throw new Error(`加载真题失败: ${userMessage(e)}`, { cause: e })
  }
}

/**
 * 整条解读的真题一次性覆盖保存(删旧插新), 与依据那边同一个口径。
 *
 * 题被删掉了就不该再出现在保存结果里 —— 那些题在界面上会显示成"已不在题库", 由管理员决定去留,
 * 传进来的一般已经把它们剔掉了。
 */
export async function saveKpQuestions(
  subject: string,
  kp: string,
  items: Pick<KpQuestionDraft, 'questionId' | 'note'>[],
): Promise<number> {
  try {
    return await saveKpQuestionRefs(subject, kp, items)
  } catch (e) {
    logError('kp-question-refs.saveKpQuestions', e)
    throw new Error(`保存真题失败: ${userMessage(e)}`, { cause: e })
  }
}

/**
 * 选题用的检索。
 *
 * 年份走的是题库的分类约定(`2024年真题`), 用 `.or(category.eq, categories.cs)` 命中 ——
 * 和题库页的筛选是同一套写法, 免得"题库里看得到、这里搜不到"。
 */
export async function searchQuestions(options: {
  keyword?: string
  year?: string | null
  subject?: string | null
  limit?: number
} = {}): Promise<LinkedQuestion[]> {
  try {
    return await searchLinkedQuestions(options)
  } catch (e) {
    logError('kp-question-refs.searchQuestions', e)
    throw new Error(`检索题目失败: ${userMessage(e)}`, { cause: e })
  }
}
