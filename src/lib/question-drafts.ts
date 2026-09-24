/**
 * 题目草稿箱的读写。
 *
 * 草稿单独一张 question_drafts 表, 不是 questions 加 status —— 练习/考试/组卷/图谱
 * 十几处查询都得记得排掉草稿, 漏一处草稿就漏进练习。分表之后那些查询一行都不用改。
 */
import { supabase } from '@/lib/supabase'
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
  const { data, error } = await supabase
    .from('question_drafts')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`加载草稿失败: ${error.message}`)
  return (data ?? []) as unknown as QuestionDraft[]
}

export async function countDrafts(): Promise<number> {
  const { count, error } = await supabase
    .from('question_drafts')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

export async function getDraft(id: string): Promise<QuestionDraft | null> {
  const { data, error } = await supabase.from('question_drafts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`加载草稿失败: ${error.message}`)
  return (data as unknown as QuestionDraft | null) ?? null
}

/** 存草稿 —— 有 draftId 就覆盖, 没有就新开一条; 返回草稿 id */
export async function saveDraft(
  payload: QuestionInput,
  opts: { draftId?: string | null; questionId?: string | null } = {},
): Promise<string> {
  const row = {
    question_id: opts.questionId ?? null,
    question_type: payload.question_type,
    question_text: String(payload.question_text ?? ''),
    payload: payload as unknown as Record<string, unknown>,
  }
  if (opts.draftId) {
    const { error } = await supabase.from('question_drafts').update(row).eq('id', opts.draftId)
    if (error) throw new Error(`存草稿失败: ${error.message}`)
    return opts.draftId
  }
  const { data, error } = await supabase.from('question_drafts').insert(row).select('id').single()
  if (error) throw new Error(`存草稿失败: ${error.message}`)
  return (data as { id: string }).id
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from('question_drafts').delete().eq('id', id)
  if (error) throw new Error(`删除草稿失败: ${error.message}`)
}

/** 草稿落进正式题库: 改的是老题就 update, 新题就 insert; 落成后草稿自己消失 */
export async function publishDraft(draft: QuestionDraft): Promise<string> {
  const payload = draft.payload as unknown as Record<string, unknown>
  if (draft.question_id) {
    const { error } = await supabase.from('questions').update(payload).eq('id', draft.question_id)
    if (error) throw new Error(`发布草稿失败: ${error.message}`)
    await deleteDraft(draft.id)
    autoIndex('question', draft.question_id)
    return draft.question_id
  }
  const { data, error } = await supabase.from('questions').insert(payload).select('id').single()
  if (error) throw new Error(`发布草稿失败: ${error.message}`)
  const id = (data as { id: string }).id
  await deleteDraft(draft.id)
  autoIndex('question', id)
  return id
}
