import { useCallback, useMemo, useReducer, useRef, type RefObject } from 'react'
import type { CorrectAnswer, Question } from '@/types'
import type { QuestionAnswerStats } from '@/services/practice'
import {
  initialPracticeQuestionState,
  practiceQuestionReducer,
  type PracticeQuestionState,
} from '@/lib/practice-session'

interface Options {
  /**
   * 过期判定的唯一来源。练习页里 `fetchGenRef` 同时被顺序加载和预取用着，
   * 如果这个 hook 自己再维护一个计数器，就会出现"两条加载路径各自以为自己是新的"
   * —— 所以让调用方把已有那个计数器传进来，两边共用一套号。不传时 hook 自己管一个。
   */
  generation?: RefObject<number>
  /** 首屏直接显示上一次看的那道题（localStorage 缓存），由调用方读好传进来 */
  initialQuestion?: Question | null
  /** 题目变化时的副作用（写缓存）。放在这里是为了让适配器待在边缘，状态机保持纯净 */
  onQuestionPersist?: (q: Question | null) => void
}

/**
 * 把练习会话的"当前这道题 + 作答"接到 React 上。
 *
 * 对外刻意保留组件原来那套字段名与 setter 名（question / setQuestion / isSubmitted / ...）：
 * 这些名字在 PracticeSession 的 JSX 里被引用了上百处，为了换状态模型去动一百处渲染代码
 * 换不来任何东西，还会把回归风险摊到整个页面。所以这里做的是「换掉状态的归属」而不是
 * 「重写调用点」—— 状态与规则收进 reducer，渲染代码一行不用改。
 *
 * 加载路径另外给两个 helper：`beginLoad` 拿号、`isStale` 判断自己是否已被取代、
 * `hydrate` 在号还对时落状态。这三件事改之前在每个加载路径里各写一遍。
 */
export function usePracticeQuestion(options: Options = {}) {
  const { generation, initialQuestion = null, onQuestionPersist } = options
  const ownGenRef = useRef(0)
  const genRef = generation ?? ownGenRef
  const persistRef = useRef(onQuestionPersist)
  persistRef.current = onQuestionPersist

  const [state, dispatch] = useReducer(
    practiceQuestionReducer,
    initialPracticeQuestionState,
    (base) => ({ ...base, question: initialQuestion }),
  )

  const beginLoad = useCallback(() => {
    genRef.current += 1
    dispatch({ type: 'load/begin' })
    return genRef.current
  }, [genRef])

  const isStale = useCallback((loadId: number) => genRef.current !== loadId, [genRef])

  const hydrate = useCallback((loadId: number, question: Question, stats: QuestionAnswerStats | null) => {
    if (genRef.current !== loadId) return false
    dispatch({ type: 'load/hydrate', loadId, question, stats })
    persistRef.current?.(question)
    return true
  }, [genRef])

  const setQuestion = useCallback((q: Question | null) => {
    // null 表示"清掉当前题"；有值则是原地替换（例如切换"已验证"）
    if (q) {
      dispatch({ type: 'question/replace', question: q })
      persistRef.current?.(q)
    } else {
      dispatch({ type: 'reset' })
      persistRef.current?.(null)
    }
  }, [])

  const setSelectedAnswer = useCallback((a: CorrectAnswer | null) => dispatch({ type: 'answer/select', answer: a }), [])
  const setIsSubmitted = useCallback((v: boolean) => {
    dispatch(v ? { type: 'answer/submitted' } : { type: 'answer/reopen' })
  }, [])
  const setAnswerId = useCallback((id: string | null) => dispatch({ type: 'answer/id', answerId: id }), [])
  const setNote = useCallback((n: string) => dispatch({ type: 'note/change', note: n }), [])
  const setIsPublic = useCallback((p: boolean) => dispatch({ type: 'note/visibility', isPublic: p }), [])
  const setAttemptCount = useCallback((n: number) => dispatch({ type: 'stats/set', attempts: n }), [])
  const setWrongCount = useCallback((n: number) => dispatch({ type: 'stats/set', wrongs: n }), [])
  /** 只清作答、不动加载号（顺序刷题路径自己管着一个计数器） */
  const clearAnswer = useCallback(() => dispatch({ type: 'answer/clear' }), [])

  return useMemo(() => ({
    // 字段名与改之前完全一致，渲染代码不必动
    question: state.question,
    selectedAnswer: state.selectedAnswer,
    isSubmitted: state.submitted,
    answerId: state.answerId,
    note: state.note,
    isPublic: state.isPublic,
    attemptCount: state.attempts,
    wrongCount: state.wrongs,

    setQuestion,
    setSelectedAnswer,
    setIsSubmitted,
    setAnswerId,
    setNote,
    setIsPublic,
    setAttemptCount,
    setWrongCount,

    // 加载路径用的 helper
    beginLoad,
    isStale,
    hydrate,
    clearAnswer,
  }), [
    state, setQuestion, setSelectedAnswer, setIsSubmitted, setAnswerId, setNote, setIsPublic,
    setAttemptCount, setWrongCount, beginLoad, isStale, hydrate, clearAnswer,
  ])
}

export type PracticeQuestionHandle = ReturnType<typeof usePracticeQuestion>
export type { PracticeQuestionState }
