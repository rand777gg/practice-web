/**
 * 题目草稿箱的读写。
 *
 * 草稿单独一张 question_drafts 表, 不是 questions 加 status —— 练习/考试/组卷/图谱
 * 十几处查询都得记得排掉草稿, 漏一处草稿就漏进练习。分表之后那些查询一行都不用改。
 */
import { logError, userMessage } from '@/services/errors'
import {
  countQuestionDrafts,
  deleteQuestionDraft,
  fetchQuestionDraft,
  insertQuestions,
  listQuestionDrafts,
  saveQuestionDraft,
  toQuestionInsert,
  updateQuestion,
} from '@/services/questions'
import { autoIndex } from '@/lib/rag'
import type { QuestionDraft, QuestionInput } from '@/types'

/** payload 里必填的部分; 草稿可以先缺着, 发布时才有底线 */
export function publishBlocker(payload: QuestionInput): string | null {
  if (!String(payload.question_text ?? '').trim()) return '还缺题目内容'
  const type = payload.question_type
  if (type === 'single_choice' || type === 'multi_select') {
    if ((payload.options ?? []).filter((o) => String(o ?? '').trim()).length < 2) return '选择题还缺选项'
  }
  if (type === 'case_analysis' && !(payload.case_questions ?? []).length) return '案例分析题还缺小题'
  return null
}

export async function listDrafts(): Promise<QuestionDraft[]> {
  try {
    return await listQuestionDrafts()
  } catch (e) {
    logError('question-drafts.listDrafts', e)
    throw new Error(`加载草稿失败: ${userMessage(e)}`, { cause: e })
  }
}

export async function countDrafts(): Promise<number> {
  try {
    return await countQuestionDrafts()
  } catch (e) {
    // 草稿箱角标: 读不到就当 0, 不值得把页面弄成报错
    logError('question-drafts.countDrafts', e)
    return 0
  }
}

export async function getDraft(id: string): Promise<QuestionDraft | null> {
  try {
    return await fetchQuestionDraft(id)
  } catch (e) {
    logError('question-drafts.getDraft', e)
    throw new Error(`加载草稿失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 存草稿 —— 有 draftId 就覆盖, 没有就新开一条; 返回草稿 id */
export async function saveDraft(
  payload: QuestionInput,
  opts: { draftId?: string | null; questionId?: string | null } = {},
): Promise<string> {
  try {
    return await saveQuestionDraft(payload, opts)
  } catch (e) {
    logError('question-drafts.saveDraft', e)
    throw new Error(`存草稿失败: ${userMessage(e)}`, { cause: e })
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await deleteQuestionDraft(id)
  } catch (e) {
    logError('question-drafts.deleteDraft', e)
    throw new Error(`删除草稿失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 草稿落进正式题库: 改的是老题就 update, 新题就 insert; 落成后草稿自己消失 */
export async function publishDraft(draft: QuestionDraft): Promise<string> {
  try {
    if (draft.question_id) {
      await updateQuestion(draft.question_id, draft.payload)
      await deleteQuestionDraft(draft.id)
      autoIndex('question', draft.question_id)
      return draft.question_id
    }
    const [id] = await insertQuestions([toQuestionInsert(draft.payload)])
    await deleteQuestionDraft(draft.id)
    autoIndex('question', id)
    return id
  } catch (e) {
    logError('question-drafts.publishDraft', e)
    throw new Error(`发布草稿失败: ${userMessage(e)}`, { cause: e })
  }
}
