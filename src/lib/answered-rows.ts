import { fetchAnsweredRows as fetchAnsweredRowsFromService, type AnswerStatSource } from '@/services/practice'
import { logError } from '@/services/errors'
import { supabase } from '@/lib/supabase'

export type AnsweredRow = AnswerStatSource

/**
 * 分页与 .in() 分片交给服务层(见 services/practice.fetchAnsweredRows): 单次 1000 行的响应上限
 * 和 URL 长度上限(nginx 414)是两个各自会静默丢数据的坑, 判断口径必须只有一处。
 *
 * since 传所有学科里最早的本遍起点(可空): 比它还早的作答过不了 isAnsweredAfterReset, 不用拉。
 */
export async function fetchAnsweredRows(
  userId: string,
  questionIds: string[],
  since?: string | null,
): Promise<AnsweredRow[]> {
  try {
    return await fetchAnsweredRowsFromService(userId, questionIds, since ?? null)
  } catch (e) {
    // 拉不到只能当作"没答过": 调用方按缺行显示成未完成, 比整块进度消失好
    logError('fetchAnsweredRows', e)
    return []
  }
}

/**
 * 本遍最早的重置起点 = 各学科门槛里最早的那个。学科门槛 = 该科"本遍起点"(上一轮完成日 与
 * 完成日 与 重置时刻取晚的那个, 见 passStartBySubject); 没有轮次记录的学科就退回学科重置时刻 /
 * 计划重置时刻。有任何一个学科压根没门槛(等于"不限时间"), 返回 null —— 不能拿时间下限砍它的作答。
 */
export function earliestPassStart(
  subjects: (string | null)[],
  subjectResets?: Record<string, string> | null,
  planResetAt?: string | null,
  passStarts?: Record<string, number> | null,
): string | null {
  const names = [...new Set(subjects.filter((s): s is string => !!s))]
  const marks: number[] = []
  for (const name of names) {
    const declared = passStarts?.[name]
    if (declared != null) { marks.push(declared); continue }
    const at = (subjectResets && subjectResets[name]) || planResetAt
    if (!at) return null
    const ms = new Date(at).getTime()
    if (Number.isFinite(ms)) marks.push(ms)
  }
  if (marks.length === 0) return null
  return new Date(Math.min(...marks)).toISOString()
}

/**
 * 各学科本轮的门槛(ISO 时刻): 和练习页 isAnsweredAfterReset 同一优先级 —— 轮次算出来的本遍
 * 起点优先, 没有就退回学科重置时刻 / 计划重置时刻。两个都没有的学科不进表 = 不限时间。
 */
export function passStartIso(
  subjects: string[],
  subjectResets?: Record<string, string> | null,
  planResetAt?: string | null,
  passStarts?: Record<string, number> | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const subject of new Set(subjects)) {
    if (!subject) continue
    const declared = passStarts?.[subject]
    if (declared != null) { out[subject] = new Date(declared).toISOString(); continue }
    const at = (subjectResets && subjectResets[subject]) || planResetAt
    if (at) out[subject] = at
  }
  return out
}

/**
 * 每个会话"本轮已作答"的题数(按题去重), 给会话列表显示 —— 和主进度条、计划里的轮次同一个口径。
 * 服务端一次算完: current_index 只是光标位置(含跳过没答的题), 拿它当完成数会和计划对不上。
 * 返回 null = 没算出来(调用方继续显示"统计中…", 不要把失败显示成 0)。
 */
export async function fetchSessionsAnswered(
  userId: string,
  starts: Record<string, string>,
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.rpc('get_sessions_answered', { p_user_id: userId, p_starts: starts })
  if (error) {
    console.error('fetchSessionsAnswered:', error)
    return null
  }
  return new Map(((data ?? []) as { session_key: string; answered: number }[])
    .map((r) => [r.session_key, Number(r.answered)]))
}
