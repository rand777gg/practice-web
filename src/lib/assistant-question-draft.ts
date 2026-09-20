/**
 * /create 出的题落到 questions 表。
 *
 * 这个映射同时被 AI 批量导入页和对话里的 /create 用 —— 两边必须写出一模一样的字段,
 * 否则"对话里出的题"和"导入页出的题"在题库里会长得不一样(一个带 key_points 一个不带,
 * import_mode 也不同的那种), 事后没法按来源筛。
 */
import { supabase } from '@/lib/supabase'
import { autoIndex } from '@/lib/rag'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { CorrectAnswer } from '@/types'

export interface QuestionRowMeta {
  subject: string | null
  /** 多个分类时第一个同时写进 category 列(有触发器同步, 这里只是显式给出) */
  categories: string[]
  importMode: string
  /** 解析出来的 source_page 为空时的兜底, 导入页用来记页码范围 */
  sourcePageFallback?: string | null
}

export function questionRowFromParsed(q: ParsedQuestion, meta: QuestionRowMeta): Record<string, unknown> {
  return {
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options,
    correct_answer: (q.correct_answer ?? '') as CorrectAnswer,
    category: meta.categories[0] ?? null,
    categories: meta.categories,
    subject: meta.subject,
    analysis: q.analysis?.trim() || null,
    key_points: q.key_points?.trim() || null,
    answer_explanation: q.answer_explanation?.trim() || null,
    seq_number: null,
    import_mode: meta.importMode,
    source_page: q.source_page || meta.sourcePageFallback || null,
    verified: q.verified ?? false,
    allow_unordered: q.allow_unordered ?? false,
  }
}

/**
 * 确认入库。写完立刻补索引 —— 不补的话这几道新题在重建索引之前搜不到,
 * 而"刚出的题在对话里搜不到"看起来就像出题失败了。
 */
export async function insertQuestionDraft(
  questions: ParsedQuestion[],
  meta: QuestionRowMeta,
): Promise<number> {
  if (questions.length === 0) return 0
  const { data, error } = await supabase
    .from('questions')
    .insert(questions.map((q) => questionRowFromParsed(q, meta)))
    .select('id')
  if (error) throw new Error(`入库失败: ${error.message}`)
  autoIndex('question')
  return (data ?? []).length
}
