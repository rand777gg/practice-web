import { pickRandomFrom, type PickCandidate, type PracticePickFilters } from './practice-session'
import type { Question } from '@/types'

/**
 * 「这一次该做哪道题」这条用例。
 *
 * 原来它整段长在 `PracticeSession` 的 `fetchRandomQuestion` 里（约 100 行），四条范围分支
 * 依次兜底、每条后面还夹一次过期判定。搬到这里是为了两件事：
 *   · 分支**顺序**是业务规则（收藏 → 复习 → 仅错题 → RPC → 离线预取），现在能用断言钉住；
 *   · 组件里剩下的只有"拿到结果之后怎么落到状态里"。
 *
 * 依赖全部注入，所以这个函数不碰 supabase、不碰 DOM、不碰随机数，测试里给几个假 fetch 就能跑。
 * 过期判定也注入：原来每个 await 后面那句 `if (isStale(myGen)) return` 是**行为的一部分**
 * （迟到的响应不能落状态），抽出来时必须一起搬走，不能顺手丢掉。
 */

/** 收藏候选：只需要这道题本身与它被收藏的时间（复习模式按时间窗筛） */
export interface FavoritePickRow {
  question_id: string
  created_at: string | null
  question: PickCandidate['question'] | null
}

/** 错题候选：按**作答时间**落在复习轮次的时间窗内才算 */
export interface WrongPickRow {
  question_id: string
  answered_at: string | null
  question: PickCandidate['question'] | null
}

/** 复习轮次的时间窗；`since`/`until` 是本地日期（YYYY-MM-DD），`until` 为空表示不限 */
export interface ReviewWindow {
  subject: string
  since: string
  until: string
}

export interface PracticePickInput {
  userId: string | null
  scope: 'all' | 'favorites' | 'wrong' | 'review'
  mode: 'new' | 'wrong' | 'sequential'
  filters: PracticePickFilters
  /** 计划学科；没显式选学科时用它当 RPC 的取值范围 */
  planSubjects: string[]
  reviewWindows: ReviewWindow[]
}

export interface PracticePickDeps {
  fetchFavorites(userId: string, limit: number): Promise<FavoritePickRow[]>
  fetchWrong(userId: string, limit: number): Promise<WrongPickRow[]>
  fetchRandomId(args: { userId: string; subjects: string[]; category: string | null; type: string | null }): Promise<string | null>
  getPrefetchedIds(): Promise<string[]>
  getPrefetchedQuestion(id: string): Promise<Question | null>
  /** 在途请求是否已被后来的加载作废 */
  isStale(): boolean
  random?: () => number
}

export type PracticePick =
  /** 拿到题号，调用方去取整题 */
  | { kind: 'id'; id: string }
  /** 离线预取里直接就有整题，不用再请求 */
  | { kind: 'prefetched'; question: Question }
  /** 确实没题可做 */
  | { kind: 'none' }
  /** 过期：调用方应当**什么都不做**（不落状态、不置 isLoading） */
  | { kind: 'stale' }

/** 各范围默认取多少条候选。收藏/错题给的数不一样是原来就有的（复习池要更大） */
const FAVORITE_LIMIT = 200
const REVIEW_LIMIT = 500
const WRONG_LIMIT = 200

export async function resolvePracticePick(
  input: PracticePickInput,
  deps: PracticePickDeps,
): Promise<PracticePick> {
  const { userId, scope, mode, filters, planSubjects, reviewWindows } = input
  const random = deps.random ?? Math.random
  let pickedId: string | null = null

  // 收藏：只在收藏里挑
  if (userId && scope === 'favorites') {
    const rows = (await deps.fetchFavorites(userId, FAVORITE_LIMIT)).filter(
      (r): r is FavoritePickRow & { question: NonNullable<FavoritePickRow['question']> } => r.question !== null,
    )
    if (deps.isStale()) return { kind: 'stale' }
    if (rows.length) pickedId = pickRandomFrom(rows, filters, random)
  }

  // 复习：错题 ∪ 收藏，但只取落在所选「学科×轮次」时间窗内的，同一题只算一次
  if (!pickedId && userId && scope === 'review') {
    const bounds = reviewWindows.map((w) => ({
      subject: w.subject,
      from: new Date(`${w.since}T00:00:00`).getTime(),
      to: w.until ? new Date(`${w.until}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY,
    }))
    const inWindow = (subject: string | null, at: string | null) => {
      if (!subject || !at) return false
      const t = new Date(at).getTime()
      return bounds.some((w) => w.subject === subject && t >= w.from && t <= w.to)
    }
    const byId = new Map<string, PickCandidate & { question_id: string }>()
    const [wrongRows, favRows] = await Promise.all([
      deps.fetchWrong(userId, REVIEW_LIMIT),
      deps.fetchFavorites(userId, REVIEW_LIMIT),
    ])
    if (deps.isStale()) return { kind: 'stale' }
    for (const r of wrongRows) {
      if (r.question && inWindow(r.question.subject, r.answered_at) && !byId.has(r.question_id)) {
        byId.set(r.question_id, { question_id: r.question_id, question: r.question })
      }
    }
    for (const r of favRows) {
      if (r.question && inWindow(r.question.subject, r.created_at) && !byId.has(r.question_id)) {
        byId.set(r.question_id, { question_id: r.question_id, question: r.question })
      }
    }
    if (byId.size > 0) pickedId = pickRandomFrom([...byId.values()], filters, random)
  }

  // 仅错题（或"全部"模式下切到错题池）
  if (!pickedId && userId && (scope === 'wrong' || (scope === 'all' && mode === 'wrong'))) {
    const rows = (await deps.fetchWrong(userId, WRONG_LIMIT)).filter(
      (r): r is WrongPickRow & { question: NonNullable<WrongPickRow['question']> } => r.question !== null,
    )
    if (deps.isStale()) return { kind: 'stale' }
    if (rows.length) pickedId = pickRandomFrom(rows, filters, random)
  }

  // 全部范围：交给服务端 RPC 随机取一个题号（客户端不拼题库查询）
  const effectiveSubjects = filters.subjects.length > 0 ? filters.subjects : planSubjects
  if (!pickedId && userId && scope === 'all' && mode !== 'wrong' && effectiveSubjects.length > 0) {
    const rpcId = await deps.fetchRandomId({
      userId,
      subjects: effectiveSubjects,
      category: filters.category || null,
      type: filters.type || null,
    })
    if (deps.isStale()) return { kind: 'stale' }
    if (rpcId) pickedId = rpcId
  }

  if (deps.isStale()) return { kind: 'stale' }

  // 一条都没挑到时，试试离线预取的题；再没有才是真的"没题"
  if (!pickedId) {
    const localIds = await deps.getPrefetchedIds()
    if (localIds.length > 0) {
      const localId = localIds[Math.min(Math.floor(random() * localIds.length), localIds.length - 1)]
      const localQuestion = await deps.getPrefetchedQuestion(localId)
      if (localQuestion) return { kind: 'prefetched', question: localQuestion }
    }
    return { kind: 'none' }
  }

  return { kind: 'id', id: pickedId }
}
