/**
 * 「相关真题」的读写 —— 拆出来是为了让 kp-question-refs.ts 保持纯函数, 能被 Node 直接跑验证。
 *
 * 关联只存 question_id + 备注: 题干、选项、答案、解析**不存快照**, 读的时候现查题目 ——
 * 题库里的题随时会被改(甚至被合并重复题), 存了快照反而会显示一道已经不存在的题。
 * 只有文献依据那边才需要快照(原文献下线后"当初引的是这段"仍然成立)。
 */
import { supabase } from '@/lib/supabase'
import { questionFromRow, type KpQuestionDraft, type KpQuestionLink, type LinkedQuestion } from '@/lib/kp-question-refs'

const QUESTION_COLUMNS = [
  'id', 'question_type', 'question_text', 'options', 'correct_answer',
  'subject', 'category', 'categories', 'analysis', 'answer_explanation',
].join(', ')

interface RawLinkRow {
  id: string
  question_id: string
  note: string
  sort_order: number
}

/** 某条解读挂的全部真题(按管理员排的顺序) */
export async function listKpQuestions(subject: string, kp: string): Promise<KpQuestionLink[]> {
  if (!subject || !kp) return []
  const { data, error } = await supabase
    .from('kp_question_refs')
    .select('id, question_id, note, sort_order')
    .eq('subject', subject)
    .eq('kp', kp)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`加载真题失败: ${error.message}`)

  const rows = (data ?? []) as unknown as RawLinkRow[]
  if (rows.length === 0) return []

  // 题目单独查一次而不是让 PostgREST 内嵌关联: 关联形状依赖外键的暴露方式, 两条查询更可控,
  // 而这里一次最多也就几十道题
  const { data: qs, error: qErr } = await supabase
    .from('questions')
    .select(QUESTION_COLUMNS)
    .in('id', rows.map((r) => r.question_id))
  if (qErr) throw new Error(`加载真题内容失败: ${qErr.message}`)

  const byId = new Map<string, LinkedQuestion>(
    ((qs ?? []) as unknown as Parameters<typeof questionFromRow>[0][]).map((q) => [q.id, questionFromRow(q)]),
  )

  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    sortOrder: r.sort_order,
    question: byId.get(r.question_id) ?? null,
  }))
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
  const { data, error } = await supabase.rpc('save_kp_question_refs', {
    p_subject: subject,
    p_kp: kp,
    p_refs: items.map((i) => ({ question_id: i.questionId, note: i.note })),
  })
  if (error) throw new Error(`保存真题失败: ${error.message}`)
  return Number(data ?? 0)
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
  let query = supabase
    .from('questions')
    .select(QUESTION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, options.limit ?? 60)))

  const keyword = options.keyword?.trim()
  if (keyword) query = query.ilike('question_text', `%${keyword}%`)
  if (options.subject) query = query.eq('subject', options.subject)
  if (options.year) query = query.or(`category.eq."${options.year}",categories.cs.["${options.year}"]`)

  const { data, error } = await query
  if (error) throw new Error(`检索题目失败: ${error.message}`)
  return ((data ?? []) as unknown as Parameters<typeof questionFromRow>[0][]).map(questionFromRow)
}
