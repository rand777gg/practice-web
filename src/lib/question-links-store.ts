/**
 * 题目 ↔ 信源软链接的读写 —— 拆出来是为了让 question-links.ts 保持纯函数。
 *
 * 反查("这条信源上挂了哪些题")要连着题目一起取回: 关联表里只有 question_id, 而题面才是
 * 用户要认的东西。两道查询而不是 PostgREST 内嵌 —— 和内嵌关联的形状绑在一起, 一次外键改名
 * 就得跟着改这里(kp-question-refs-store 踩过同一个坑, 用同一套写法)。
 */
import { supabase } from '@/lib/supabase'
import { questionFromRow, type LinkedQuestion } from '@/lib/kp-question-refs'
import type { RagSource } from '@/lib/rag'
import type { QuestionLinkDraft, QuestionSourceLink } from '@/lib/question-links'

const LINK_COLUMNS = [
  'id', 'source', 'source_id', 'block_index', 'page_no', 'label', 'sub_label',
  'anchor', 'snippet', 'note', 'origin', 'created_at',
].join(', ')

const QUESTION_COLUMNS = [
  'id', 'question_type', 'question_text', 'options', 'correct_answer',
  'subject', 'category', 'categories', 'analysis', 'answer_explanation',
].join(', ')

interface RawLinkRow {
  id: string
  source: string
  source_id: string
  block_index: number
  page_no: number | null
  label: string
  sub_label: string | null
  anchor: string | null
  snippet: string
  note: string
  origin: string
  created_at: string
}

function toLink(row: RawLinkRow): QuestionSourceLink {
  return {
    id: row.id,
    source: row.source as RagSource,
    sourceId: row.source_id,
    blockIndex: row.block_index,
    pageNo: row.page_no,
    label: row.label,
    subLabel: row.sub_label,
    anchor: row.anchor,
    snippet: row.snippet,
    note: row.note,
    origin: row.origin === 'littleq' ? 'littleq' : 'manual',
    createdAt: row.created_at,
  }
}

/** 这道题挂着的全部信源(按挂的时间升序 —— 清单的顺序就是用户挂的顺序) */
export async function listQuestionLinks(questionId: string): Promise<QuestionSourceLink[]> {
  if (!questionId) return []
  const { data, error } = await supabase
    .from('question_source_links')
    .select(LINK_COLUMNS)
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`加载关联信源失败: ${error.message}`)
  return ((data ?? []) as unknown as RawLinkRow[]).map(toLink)
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

  const rows = drafts.map((d) => ({
    user_id: userId,
    question_id: questionId,
    source: d.source,
    source_id: d.sourceId,
    block_index: d.blockIndex,
    page_no: d.pageNo,
    label: d.label,
    sub_label: d.subLabel,
    anchor: d.anchor,
    snippet: d.snippet,
    note: d.note,
    origin: d.origin,
  }))

  const { error } = await supabase
    .from('question_source_links')
    .upsert(rows, {
      onConflict: 'user_id,question_id,source,source_id,block_index',
      ignoreDuplicates: true,
    })
  if (error) throw new Error(`挂到本题失败: ${error.message}`)
  return rows.length
}

export async function removeQuestionLink(id: string): Promise<void> {
  const { error } = await supabase.from('question_source_links').delete().eq('id', id)
  if (error) throw new Error(`取消关联失败: ${error.message}`)
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
  const { data, error } = await supabase
    .from('question_source_links')
    .select('id, question_id, note, origin, created_at')
    .eq('source', source)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`加载关联题目失败: ${error.message}`)

  const rows = (data ?? []) as unknown as {
    id: string; question_id: string; note: string; origin: string; created_at: string
  }[]
  if (rows.length === 0) return []

  const { data: qs, error: qErr } = await supabase
    .from('questions')
    .select(QUESTION_COLUMNS)
    .in('id', rows.map((r) => r.question_id))
  if (qErr) throw new Error(`加载关联题目内容失败: ${qErr.message}`)

  const byId = new Map<string, LinkedQuestion>(
    ((qs ?? []) as unknown as Parameters<typeof questionFromRow>[0][]).map((q) => [q.id, questionFromRow(q)]),
  )

  return rows.map((r) => ({
    linkId: r.id,
    note: r.note,
    origin: r.origin === 'littleq' ? 'littleq' : 'manual',
    createdAt: r.created_at,
    question: byId.get(r.question_id) ?? null,
  }))
}

/** 这道题被哪些别的题挂过(相关题那一类反查) */
export async function listQuestionsLinkedTo(questionId: string): Promise<LinkedQuestionRef[]> {
  return listLinkedQuestions('question', questionId)
}
