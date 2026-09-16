import { supabase } from '@/lib/supabase'

export interface AnsweredRow {
  question_id: string
  answered_at: string
  is_correct: boolean
}

/**
 * 分页拉取这批题目的作答行。
 * Supabase REST 单次响应最多 1000 行(超出部分静默丢掉), 上千题的大会话又反复刷同一批题时
 * 一批很容易超过 —— 丢掉的题会被当成"没做过", 学科进度/知识点状态就少算。
 * 所以按 id 稳定排序翻页, 一直取到不满一页为止。
 * since 传所有学科里最早的本遍起点(可空): 比它还早的作答过不了 isAnsweredAfterReset, 不用拉。
 */
export async function fetchAnsweredRows(
  userId: string,
  questionIds: string[],
  since?: string | null,
): Promise<AnsweredRow[]> {
  const PAGE = 1000
  const rows: AnsweredRow[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('user_answers')
      .select('question_id, answered_at, is_correct')
      .eq('user_id', userId)
      .in('question_id', questionIds)
      .order('id')
      .range(from, from + PAGE - 1)
    if (since) query = query.gte('answered_at', since)
    const { data, error } = await query
    if (error) break
    const page = (data ?? []) as AnsweredRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/**
 * 本遍最早的重置起点 = 各学科门槛(学科重置时刻, 没有就用计划重置时刻)里最早的那个。
 * 有任何一个学科压根没有门槛(那就等于"不限时间"), 返回 null —— 不能拿时间下限去砍它的作答。
 */
export function earliestPassStart(
  subjects: (string | null)[],
  subjectResets?: Record<string, string> | null,
  planResetAt?: string | null,
): string | null {
  const names = [...new Set(subjects.filter((s): s is string => !!s))]
  const marks: number[] = []
  for (const name of names) {
    const at = (subjectResets && subjectResets[name]) || planResetAt
    if (!at) return null
    const ms = new Date(at).getTime()
    if (Number.isFinite(ms)) marks.push(ms)
  }
  if (marks.length === 0) return null
  return new Date(Math.min(...marks)).toISOString()
}
