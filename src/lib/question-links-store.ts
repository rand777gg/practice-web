/**
 * 题目 ↔ 信源软链接的读写 —— 拆出来是为了让 question-links.ts 保持纯函数。
 *
 * 反查("这条信源上挂了哪些题")要连着题目一起取回: 关联表里只有 question_id, 而题面才是
 * 用户要认的东西。两道查询而不是 PostgREST 内嵌 —— 和内嵌关联的形状绑在一起, 一次外键改名
 * 就得跟着改这里(kp-question-refs-store 踩过同一个坑, 用同一套写法)。
 */
import { supabase } from '@/lib/supabase'
import { logError, userMessage } from '@/services/errors'
import {
  addQuestionSourceLinks,
  deleteQuestionSourceLink,
  listLinkedQuestions as listLinkedQuestionRefs,
  listQuestionSourceLinks,
} from '@/services/questions'
import type { LinkedQuestion } from '@/lib/kp-question-refs'
import type { RagSource } from '@/lib/rag'
import type { QuestionLinkDraft, QuestionSourceLink } from '@/lib/question-links'

/** 这道题挂着的全部信源(按挂的时间升序 —— 清单的顺序就是用户挂的顺序) */
export async function listQuestionLinks(questionId: string): Promise<QuestionSourceLink[]> {
  if (!questionId) return []
  try {
    return await listQuestionSourceLinks(questionId)
  } catch (e) {
    logError('question-links.listQuestionLinks', e)
    throw new Error(`加载关联信源失败: ${userMessage(e)}`, { cause: e })
  }
}

/**
 * 挂若干条。
 *
 * ignoreDuplicates: 唯一键上重复(同一段挂第二遍)时静默跳过而不是整批失败 ——
 * 一次提交里混着一条重复的, 不该把另外几条好的也退回去。
 */
export async function addQuestionLinks(questionId: string, drafts: QuestionLinkDraft[]): Promise<number> {
  if (!questionId || drafts.length === 0) return 0
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('未登录')

  try {
    return await addQuestionSourceLinks(userId, questionId, drafts)
  } catch (e) {
    logError('question-links.addQuestionLinks', e)
    throw new Error(`挂到本题失败: ${userMessage(e)}`, { cause: e })
  }
}

export async function removeQuestionLink(id: string): Promise<void> {
  try {
    await deleteQuestionSourceLink(id)
  } catch (e) {
    logError('question-links.removeQuestionLink', e)
    throw new Error(`取消关联失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 反查回来的一道题: 关联本身(备注/时间) + 那道题 */
export interface LinkedQuestionRef {
  linkId: string
  note: string
  origin: QuestionSourceLink['origin']
  createdAt: string
  /** 题被删掉时外键会级联删掉整行, 所以正常情况下不会是 null */
  question: LinkedQuestion | null
}

/**
 * 这条信源上挂过哪些题。
 *
 * 只查得到自己挂的(RLS 就是按 user_id 收的) —— 反查的语义是「我在这一段上挂过哪几道题」,
 * 不是全平台的题图。
 */
export async function listLinkedQuestions(source: RagSource, sourceId: string): Promise<LinkedQuestionRef[]> {
  if (!sourceId) return []
  try {
    return await listLinkedQuestionRefs(source, sourceId)
  } catch (e) {
    logError('question-links.listLinkedQuestions', e)
    throw new Error(`加载关联题目失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 这道题被哪些别的题挂过(相关题那一类反查) */
export async function listQuestionsLinkedTo(questionId: string): Promise<LinkedQuestionRef[]> {
  return listLinkedQuestions('question', questionId)
}
