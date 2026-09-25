import type { CorrectAnswer, ExamSession, Question } from '@/types'
import { sessionItemCount } from '@/lib/answer-utils'

/**
 * 考试会话的状态机。
 *
 * 和练习页那次抽状态机的理由一样：改之前 `isLoading` / `isSubmitting` / `session` / `error`
 * 是四个各自独立 set 的字段，能组合出非法态 —— 交卷中而 session 为 null、加载中与交卷中同时为真、
 * 已经 completed 还在 submitting、会话都没恢复就在作答。这些组合写不出会报错的代码，只能靠调用方
 * 记着别那么调；而 `answerQuestion` / `nextQuestion` / `jumpTo` 恰恰是直接从组件里调的。
 *
 * 这里把「现在处于哪个阶段」显式化成 `phase`，并把规则收进 reducer：
 *   · 只有 `in_progress` 能作答、能移游标、能开始交卷；
 *   · 游标按**小题（卡片）**夹在 [0, cardCount-1]，卷面题型一条记录多张卡；
 *   · 失败（`request/failed`）保留已有载荷，只记错误并进入 `failed`。
 *
 * 纯函数、无 I/O，可以单独跑（scripts/test-practice-machine.mjs 里一起测）。
 */

export type ExamPhase =
  /** 什么都没加载：初始态与 reset 之后 */
  | 'idle'
  /** 正在组卷 / 建档 / 取题 */
  | 'composing'
  /** 已开考（或续考成功），可以作答 */
  | 'in_progress'
  /** 交卷请求在途：此时不该再改答案 */
  | 'submitting'
  /** 已交卷；也可能是续考时读到一个已经完成的会话（此时 questions 为空） */
  | 'completed'
  /** 组卷、取题或交卷失败，错误信息在 `error` 里；已有载荷保持不动 */
  | 'failed'

export interface ExamSessionState {
  phase: ExamPhase
  session: ExamSession | null
  questions: Question[]
  /** 游标单位是**小题（卡片）**，不是记录数 */
  currentIndex: number
  answers: Map<string, CorrectAnswer>
  error: string | null
}

export const initialExamSessionState: ExamSessionState = {
  phase: 'idle',
  session: null,
  questions: [],
  currentIndex: 0,
  answers: new Map(),
  error: null,
}

export type ExamAction =
  /** 开始组卷/取题 */
  | { type: 'compose/begin' }
  /** 组卷成功、会话已建档 */
  | { type: 'compose/loaded'; session: ExamSession; questions: Question[] }
  /** 续考成功：会话 + 题目 + 已作答记录一起恢复 */
  | { type: 'session/restored'; session: ExamSession; questions: Question[]; answers: Map<string, CorrectAnswer> }
  /** 续考读到的是已完成会话：只挂会话，没有题目可做 */
  | { type: 'session/history'; session: ExamSession }
  /** 组卷/取题/交卷失败 */
  | { type: 'request/failed'; message: string }
  | { type: 'answer/set'; questionId: string; answer: CorrectAnswer }
  | { type: 'index/move'; delta: number }
  | { type: 'index/set'; index: number }
  | { type: 'submit/begin' }
  | { type: 'submit/done'; patch: Partial<ExamSession> }
  | { type: 'reset' }

/** 游标上界：卷面题型一条记录含多张卡，用 questions.length 会卡死在第 9 张 */
export function examCardCount(questions: Question[]): number {
  return sessionItemCount(questions)
}

function clampIndex(index: number, questions: Question[]): number {
  const max = examCardCount(questions) - 1
  if (max < 0) return 0
  return Math.min(Math.max(index, 0), max)
}

export function examSessionReducer(state: ExamSessionState, action: ExamAction): ExamSessionState {
  switch (action.type) {
    case 'compose/begin':
      // 只翻阶段与清错误：上一次考试的载荷留着，失败时还能看见上一场（与改造前一致）
      return { ...state, phase: 'composing', error: null }

    case 'compose/loaded':
      return {
        ...state,
        phase: 'in_progress',
        session: action.session,
        questions: action.questions,
        currentIndex: 0,
        answers: new Map(),
        error: null,
      }

    case 'session/restored':
      return {
        ...state,
        phase: 'in_progress',
        session: action.session,
        questions: action.questions,
        currentIndex: clampIndex(action.session.current_index, action.questions),
        answers: action.answers,
        error: null,
      }

    case 'session/history':
      return { ...state, phase: 'completed', session: action.session, questions: [], currentIndex: 0, answers: new Map(), error: null }

    case 'request/failed':
      // 交卷失败要退回 in_progress（还能继续答/再交一次），组卷失败则是 failed
      return { ...state, phase: state.phase === 'submitting' ? 'in_progress' : 'failed', error: action.message }

    case 'answer/set':
      // 只有开考状态能改答案：交卷中/已交卷/组卷中一律忽略
      if (state.phase !== 'in_progress') return state
      if (!state.session) return state
      return { ...state, answers: new Map(state.answers).set(action.questionId, action.answer) }

    case 'index/move':
      if (state.phase !== 'in_progress') return state
      return { ...state, currentIndex: clampIndex(state.currentIndex + action.delta, state.questions) }

    case 'index/set':
      if (state.phase !== 'in_progress') return state
      return { ...state, currentIndex: clampIndex(action.index, state.questions) }

    case 'submit/begin':
      // 没有会话就无所谓"交卷"；已在交卷中也不要重复开始
      if (state.phase !== 'in_progress' || !state.session) return state
      return { ...state, phase: 'submitting', error: null }

    case 'submit/done':
      if (state.phase !== 'submitting' || !state.session) return state
      return { ...state, phase: 'completed', session: { ...state.session, ...action.patch }, error: null }

    case 'reset':
      return { ...initialExamSessionState, answers: new Map() }
  }
}
