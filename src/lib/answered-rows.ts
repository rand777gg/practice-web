import { supabase } from '@/lib/supabase'
import { chunkIds } from '@/lib/chunk-ids'

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
 *
 * 另外一个坑: `.in('question_id', ids)` 是把所有 id 拼进 URL 查询串的,
 * 一个大考卷 700 题就是 26KB 的 URL —— 超过 nginx 的 large_client_header_buffers(4 16k),
 * 请求行放不进单个 buffer, 源站直接 414(Request-URI Too Large);
 * 经 CDN 时表现为 520 / net::ERR_FAILED, 前端只看到"请求失败"。
 * 所以按 chunkIds 拆批, 保证每个 URL 都远低于 16KB(见 chunk-ids.ts 的实测数据)。
 */
const PAGE = 1000

async function fetchAnsweredChunk(
  userId: string,
  ids: string[],
  since?: string | null,
): Promise<AnsweredRow[]> {
  const rows: AnsweredRow[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('user_answers')
      .select('question_id, answered_at, is_correct')
      .eq('user_id', userId)
      .in('question_id', ids)
      .order('id')
      .range(from, from + PAGE - 1)
    if (since) query = query.gte('answered_at', since)
    const { data, error } = await query
    if (error) {
      console.error('fetchAnsweredRows:', error)
      break
    }
    const page = (data ?? []) as AnsweredRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

export async function fetchAnsweredRows(
  userId: string,
  questionIds: string[],
  since?: string | null,
): Promise<AnsweredRow[]> {
  if (questionIds.length === 0) return []
  // 分片之间互不重叠, 结果直接拼起来即可; 某一片失败不影响其它片
  const parts = await Promise.all(
    chunkIds(questionIds).map((ids) => fetchAnsweredChunk(userId, ids, since)),
  )
  return parts.flat()
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
