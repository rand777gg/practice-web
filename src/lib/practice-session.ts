import type { CorrectAnswer, Question } from '@/types'
import type { QuestionAnswerStats } from '@/services/practice'

/**
 * 练习会话里"当前这道题 + 这道题的作答"的状态机。
 *
 * 抽出来的理由不是"组件太大了"，而是这份状态本来就有一组非法组合没人管：
 * 改之前它是 8 个独立 useState（question / selectedAnswer / isSubmitted / answerId /
 * note / isPublic / attempts / wrongs），于是 `isSubmitted = true` 配 `question = null`、
 * 换了题但 `selectedAnswer` 还留着上一题的答案 —— 都写不出会报错的代码，只能靠人记得清干净；
 * 而四个加载路径又各自用 `fetchGenRef` 手动挡过期响应，四种写法。
 *
 * 这里做两件事：把"开始加载时该清什么、不该清什么"变成 `load/begin` 一条规则，
 * 把"过期响应一律丢弃"变成 `staleResponse` 一条规则。
 * 纯函数、无 I/O（localStorage 缓存由调用方通过 onQuestionPersist 接在边上），
 * 可以单独跑（scripts/test-practice-machine.mjs）。
 *
 * 不装的东西（有意留在组件里）：`isLoading` / `showSkeleton` / `questionReady` / `noQuestions`。
 * 它们描述"页面现在忙不忙、有没有题可做"，不是"这道题是什么" —— 塞进来只会让"切模式时置忙"
 * 这种操作被迫去动题目状态。
 */

export interface PracticeQuestionState {
  /** 每次 `load/begin` 自增；响应回来时带着它，对不上就是过期响应 */
  loadId: number
  question: Question | null
  selectedAnswer: CorrectAnswer | null
  /** 已交卷：此后不能再改选项 */
  submitted: boolean
  /** 落库后的作答行 id；null = 还没落库（离线时可能是 `local-*`） */
  answerId: string | null
  note: string
  isPublic: boolean
  attempts: number
  wrongs: number
}

export const initialPracticeQuestionState: PracticeQuestionState = {
  loadId: 0,
  question: null,
  selectedAnswer: null,
  submitted: false,
  answerId: null,
  note: '',
  isPublic: false,
  attempts: 0,
  wrongs: 0,
}

export type PracticeQuestionAction =
  /**
   * 开始加载：作废上一次的号，并清掉上一题的**作答**。
   * 刻意不动 question / note / isPublic / attempts —— 上一题在下一题到达之前要继续显示
   * （首屏用的是 localStorage 里缓存的那道题），把它清掉会闪一下白屏。
   */
  | { type: 'load/begin' }
  /** 响应回来了；`loadId` 与当前不一致则忽略 */
  | { type: 'load/hydrate'; loadId: number; question: Question; stats: QuestionAnswerStats | null }
  /**
   * 落一道新题但不做过期判定。顺序刷题那条路径自己管着过期号（`seqFetchGenRef`），
   * 它的"这次响应还算不算数"由调用方先判过；这里只复用"换题 + 搬统计 + 清作答"这条规则，
   * 免得那条路径又把这四件事手写一遍。
   */
  | { type: 'load/apply'; question: Question; stats: QuestionAnswerStats | null }
  | { type: 'answer/select'; answer: CorrectAnswer | null }
  /** 只落 id：提交后先拿到行 id、再标记交卷，两步顺序不能合并 */
  | { type: 'answer/id'; answerId: string | null }
  | { type: 'answer/submitted' }
  /** 换题/重做时解锁作答 */
  | { type: 'answer/reopen' }
  /** 只清作答、不作废加载号 —— 顺序刷题那条路径自己管着一个计数器（seqFetchGenRef） */
  | { type: 'answer/clear' }
  | { type: 'note/change'; note: string }
  | { type: 'note/visibility'; isPublic: boolean }
  /** 单独更新计数（预取/缓存路径拿旧值直接覆盖，不走 hydrate） */
  | { type: 'stats/set'; attempts?: number; wrongs?: number }
  /** 题目对象原地替换（例如管理员点"已验证"）：只换 question，作答状态不动 */
  | { type: 'question/replace'; question: Question }
  | { type: 'reset' }

/** 清作答的唯一写法：开始加载、以及不管加载号只换题时都走它 */
function clearAnswer(state: PracticeQuestionState): PracticeQuestionState {
  return { ...state, selectedAnswer: null, submitted: false, answerId: null }
}

/** 换题 + 搬统计 + 清作答：`load/hydrate` 与 `load/apply` 共用这一条规则 */
function applyLoadedQuestion(
  state: PracticeQuestionState,
  question: Question,
  stats: QuestionAnswerStats | null,
): PracticeQuestionState {
  return {
    ...state,
    question,
    selectedAnswer: null,
    submitted: false,
    answerId: null,
    attempts: stats?.attempts ?? 0,
    wrongs: stats?.wrongs ?? 0,
    note: stats?.note ?? '',
    isPublic: stats?.is_public ?? false,
  }
}

/** 过期响应的唯一判据：这次响应对应的 loadId 已经不是最新的了 */
export function staleResponse(state: PracticeQuestionState, loadId: number): boolean {
  return state.loadId !== loadId
}

export function practiceQuestionReducer(
  state: PracticeQuestionState,
  action: PracticeQuestionAction,
): PracticeQuestionState {
  switch (action.type) {
    case 'load/begin':
      return clearAnswer({ ...state, loadId: state.loadId + 1 })

    case 'load/hydrate':
      if (staleResponse(state, action.loadId)) return state
      return applyLoadedQuestion(state, action.question, action.stats)

    case 'load/apply':
      return applyLoadedQuestion(state, action.question, action.stats)

    case 'answer/select':
      // 已交卷就锁住：这不是"界面不该响应"，而是这份状态的规则 —— 交卷后选项必须保持不变
      if (state.submitted) return state
      return { ...state, selectedAnswer: action.answer }

    case 'answer/id':
      return { ...state, answerId: action.answerId }

    case 'answer/submitted':
      // 没有题就没有"交卷"这回事，挡住它才不会出现 isSubmitted 配 question=null
      if (!state.question || state.submitted) return state
      return { ...state, submitted: true }

    case 'answer/reopen':
      return { ...state, submitted: false, answerId: null }

    case 'answer/clear':
      return clearAnswer(state)

    case 'note/change':
      return { ...state, note: action.note }

    case 'note/visibility':
      return { ...state, isPublic: action.isPublic }

    case 'stats/set':
      return {
        ...state,
        attempts: action.attempts ?? state.attempts,
        wrongs: action.wrongs ?? state.wrongs,
      }

    case 'question/replace':
      return { ...state, question: action.question }

    case 'reset':
      return { ...initialPracticeQuestionState, loadId: state.loadId }
  }
}

/** 能不能提交：有题、已选、还没交 */
export function canSubmit(state: PracticeQuestionState): boolean {
  return state.question !== null && state.selectedAnswer !== null && !state.submitted
}

// ── 挑题 ──

/** 候选题目只用到这几个字段（`services/practice` 的 QuestionMeta 结构上满足它） */
export interface PickCandidate {
  question_id: string
  question: {
    subject: string | null
    category: string | null
    categories: string[]
    question_type: string
    key_points: string | null
  }
}

/** 界面上那四个筛选器 */
export interface PracticePickFilters {
  subjects: string[]
  category: string
  type: string
  keyPoint: string
}

/**
 * 按当前筛选器过滤一批评选，再随机取一道。
 *
 * 抽出来的原因很具体：收藏 / 复习（错题∪收藏）/ 仅错题三条分支各自把同样的
 * 「四个 if 依次 filter，然后 Math.random 取一个」抄了一遍 —— 三条分支的筛选口径一旦
 * 不一致（比如某条忘了看 key_points），表现是"有时候筛得住、有时候筛不住"，极难排查。
 *
 * `random` 可注入，测试里就不用碰 Math.random。
 */
export function pickRandomFrom<T extends PickCandidate>(
  rows: T[],
  filters: PracticePickFilters,
  random: () => number = Math.random,
): string | null {
  if (rows.length === 0) return null
  let filtered: T[] = rows
  if (filters.subjects.length > 0) filtered = filtered.filter((r) => filters.subjects.includes(r.question.subject ?? ''))
  if (filters.category) {
    filtered = filtered.filter((r) => r.question.category === filters.category || r.question.categories.includes(filters.category))
  }
  if (filters.type) filtered = filtered.filter((r) => r.question.question_type === filters.type)
  if (filters.keyPoint) filtered = filtered.filter((r) => (r.question.key_points ?? '').includes(filters.keyPoint))
  if (filtered.length === 0) return null
  return filtered[Math.min(Math.floor(random() * filtered.length), filtered.length - 1)].question_id
}
