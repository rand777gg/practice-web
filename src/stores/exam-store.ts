import { create } from 'zustand'
import { completeExam, completeExamSession, createExamSession, fetchExamSession, saveExamCursor } from '@/services/exam'
import { isFunctionMissing } from '@/services/errors'
import { withTrace } from '@/lib/trace'
import { fetchExamAnswers, upsertAnswer, upsertAnswers } from '@/services/practice'
import { logError, userMessage } from '@/services/errors'
import { reportClientEvent } from '@/lib/client-events'
import type { ExamAnswerPayload } from '@/services/exam'
import { useRefreshStore } from './refresh-store'
import { registerUserScopedStore } from '@/stores/user-scope'
import {
  isAnswerCorrect,
  questionCorrectItemCount,
  questionItemCount,
} from '@/lib/answer-utils'
import {
  examSessionReducer,
  initialExamSessionState,
  type ExamAction,
  type ExamSessionState,
} from '@/lib/exam-session'
import { composeExamIds, fetchQuestionsByIds } from '@/lib/exam-compose'
import { MULTI_ITEM_QUESTION_TYPES } from '@/lib/constants'
import type { ExamSession, Question, CorrectAnswer, ExamTemplate, ExamSampleMode, ExamComposeStat } from '@/types'

export interface StartExamParams {
  userId: string
  /** 无模板时使用 */
  questionCount: number
  durationMs: number
  subjects?: string[]
  categories?: string[]
  questionTypes?: string[]
  /** 有模板时按模板分区组卷, 忽略 questionCount / questionTypes */
  template?: ExamTemplate | null
  sampleMode?: ExamSampleMode
  /** 固定题单(试题库套卷): 传了就直接开考, 不再走组卷 RPC */
  questionIds?: string[]
}

export interface StartExamResult {
  ok: boolean
  /** 各分区实际抽到的题数, 用于提示题库不足 */
  stats?: ExamComposeStat[]
}

/**
 * 状态本身在 `lib/exam-session.ts` 的 reducer 里（阶段、会话、题目、游标、答案、错误）。
 * 这里只做两件事：把 action 喂给 reducer，以及**在一个地方**把阶段翻译成消费者仍在用的两个布尔。
 * 布尔不再各自 set，所以不可能和阶段不一致 —— 这正是改造前那四个独立字段最大的问题。
 */
interface ExamState extends ExamSessionState {
  /** 阶段为 composing 的派生值；只为兼容既有调用点而保留 */
  isLoading: boolean
  /** 阶段为 submitting 的派生值 */
  isSubmitting: boolean

  startExam: (params: StartExamParams) => Promise<StartExamResult>
  resumeExam: (sessionId: string) => Promise<void>
  answerQuestion: (questionId: string, answer: CorrectAnswer) => void
  nextQuestion: () => Promise<void>
  previousQuestion: () => Promise<void>
  jumpTo: (index: number) => Promise<void>
  submitExam: () => Promise<void>
  reset: () => void
}

export const useExamStore = create<ExamState>((set, get) => {
  /** 唯一的写入口：reducer 决定状态，阶段决定那两个派生布尔 */
  const apply = (action: ExamAction) =>
    set((s) => {
      const next = examSessionReducer(s, action)
      return { ...next, isLoading: next.phase === 'composing', isSubmitting: next.phase === 'submitting' }
    })

  const fail = (e: unknown, context: string) => {
    logError(context, e)
    apply({ type: 'request/failed', message: userMessage(e) })
  }

  return {
    ...initialExamSessionState,
    isLoading: false,
    isSubmitting: false,

    startExam: async ({ userId, questionCount, durationMs, subjects, categories, questionTypes, template, sampleMode, questionIds: fixedIds }) => {
      apply({ type: 'compose/begin' })

      // 套卷的题单在生成时就冻住了, 这里直接取题, 不再组卷
      const { questionIds, stats } = fixedIds?.length
        ? { questionIds: fixedIds, stats: [] as ExamComposeStat[] }
        : await composeExamIds({
            template,
            questionCount,
            subjects,
            categories,
            questionTypes,
            sampleMode,
          }).catch((e: Error) => {
            fail(e, 'exam.startExam.compose')
            return { questionIds: [] as string[], stats: [] as ExamComposeStat[] }
          })

      if (questionIds.length === 0) {
        // 组卷已经报过错就别覆盖它 —— 那个错（比如 RPC 失败）比"没题"更具体
        if (!get().error) apply({ type: 'request/failed', message: 'No questions available. Please add questions first.' })
        return { ok: false, stats }
      }

      const orderedQuestions = await fetchQuestionsByIds(questionIds).catch((e: Error) => {
        fail(e, 'exam.startExam.questions')
        return [] as Question[]
      })

      if (orderedQuestions.length === 0) return { ok: false, stats }

      // 总题数按「小题」展开: 案例分析题 = 小题数, 其余 = 1
      const totalItems = orderedQuestions.reduce((sum, q) => sum + questionItemCount(q), 0)

      // 模板快照随会话入库: 刷新/续考后可还原封面、工具栏名称与排版(与模板本体解耦)
      let session: ExamSession | null
      try {
        session = await createExamSession({
          user_id: userId,
          total_questions: totalItems,
          duration_ms: durationMs,
          question_ids: questionIds,
          template: template ?? null,
        })
      } catch (e) {
        fail(e, 'exam.startExam.createSession')
        return { ok: false }
      }

      if (!session) {
        apply({ type: 'request/failed', message: 'Failed to create session' })
        return { ok: false }
      }

      apply({ type: 'compose/loaded', session, questions: orderedQuestions })
      return { ok: true, stats }
    },

    resumeExam: async (sessionId) => {
      apply({ type: 'compose/begin' })

      let sess: ExamSession | null
      try {
        sess = await fetchExamSession(sessionId)
      } catch (e) {
        logError('exam.resumeExam', e)
        sess = null
      }

      if (!sess) {
        apply({ type: 'request/failed', message: 'Session not found' })
        return
      }

      // 已经交过的场次：只挂会话（用于看历史成绩），没有题目可做
      if (sess.status === 'completed') {
        apply({ type: 'session/history', session: sess })
        return
      }

      let orderedQuestions: Question[]
      try {
        orderedQuestions = await fetchQuestionsByIds(sess.question_ids)
      } catch (e) {
        logError('exam.resumeExam.questions', e)
        apply({ type: 'request/failed', message: 'Failed to load questions' })
        return
      }

      const answersMap = new Map<string, CorrectAnswer>()
      try {
        for (const ans of await fetchExamAnswers(sessionId)) {
          answersMap.set(ans.question_id, ans.selected_answer)
        }
      } catch (e) {
        logError('exam.resumeExam.answers', e)
      }

      apply({ type: 'session/restored', session: sess, questions: orderedQuestions, answers: answersMap })
    },

    answerQuestion: (questionId, answer) => {
      const { session, questions } = get()
      apply({ type: 'answer/set', questionId, answer })

      // Auto-save to DB so answers survive refresh
      if (session) {
        const q = questions.find(x => x.id === questionId)
        const isC = q ? isAnswerCorrect(answer, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks, q.case_questions) : false
        void (async () => {
          try {
            await upsertAnswer({
              user_id: session.user_id,
              question_id: questionId,
              selected_answer: answer,
              is_correct: isC,
              mode: 'exam',
              exam_session_id: session.id,
              answered_at: new Date().toISOString(),
            })
          } catch (e) {
            logError('exam.autoSaveAnswer', e)
          }
        })()
      }
    },

    nextQuestion: async () => {
      const before = get()
      apply({ type: 'index/move', delta: 1 })
      const after = get()
      // 游标没动就别写库（到达最后一张卡时是常态）
      if (after.currentIndex === before.currentIndex || !after.session) return
      await saveExamCursor(after.session.id, after.currentIndex).catch((e) => logError('exam.saveCursor', e))
    },

    previousQuestion: async () => {
      const before = get()
      apply({ type: 'index/move', delta: -1 })
      const after = get()
      if (after.currentIndex === before.currentIndex || !after.session) return
      await saveExamCursor(after.session.id, after.currentIndex).catch((e) => logError('exam.saveCursor', e))
    },

    jumpTo: async (index) => {
      const before = get()
      apply({ type: 'index/set', index })
      const after = get()
      if (after.currentIndex === before.currentIndex || !after.session) return
      await saveExamCursor(after.session.id, after.currentIndex).catch((e) => logError('exam.saveCursor', e))
    },

    submitExam: () => withTrace('exam.submit', async () => {
      const { session, questions, answers } = get()
      if (!session) return

      apply({ type: 'submit/begin' })
      // 只有真的进入 submitting 才继续 —— 否则（已经在交卷中、或这场已经交过）后面那次
      // RPC 会再跑一遍。服务端也做了幂等早返回，两边都有才叫真的挡住。
      if (get().phase !== 'submitting') return

      let correctItems = 0
      const totalItems = questions.reduce((sum, q) => sum + questionItemCount(q), 0)
      const answerPayload: ExamAnswerPayload[] = []

      for (const q of questions) {
        const selected = answers.get(q.id)
        if (selected == null) continue
        const multi = MULTI_ITEM_QUESTION_TYPES.includes(q.question_type as typeof MULTI_ITEM_QUESTION_TYPES[number])
        // 一条记录挂多个小题的题型（案例题、卷面的完形/阅读/新题型/翻译）按小题计分，可部分得分
        const okCount = multi
          ? questionCorrectItemCount(q, selected)
          : isAnswerCorrect(selected, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks, q.case_questions)
            ? questionItemCount(q)
            : 0
        correctItems += okCount
        const fullCorrect = !multi ? okCount > 0 : ((q.case_questions?.length ?? 0) > 0 && okCount === (q.case_questions?.length ?? 0))
        answerPayload.push({
          question_id: q.id,
          selected_answer: selected,
          is_correct: fullCorrect,
        })
      }

      const score = totalItems > 0 ? Math.round((correctItems / totalItems) * 100) : 0

      // 作答入库与会话完成原来在客户端分两次写（upsertAnswers + completeExamSession），
      // 中间失败会留下"作答已写、会话还在进行中"的半成品。Section 102 把它们合成一次 RPC。
      let patch: { correct_count: number; score: number; duration_ms: number }
      try {
        const completed = await completeExam({
          sessionId: session.id,
          answers: answerPayload,
          correctCount: correctItems,
          score,
          currentIndex: get().currentIndex,
        })
        if (!completed) throw new Error('交卷没有返回会话')
        // 服务端返回的行是权威值：duration_ms 是服务端按 started_at 算的，分数也以库里为准
        patch = {
          correct_count: completed.correct_count,
          score: completed.score ?? score,
          duration_ms: completed.duration_ms,
        }
      } catch (e) {
        if (!isFunctionMissing(e)) {
          fail(e, 'exam.submitExam')
          return
        }
        // 迁移还没上线（部署顺序：先发代码、后跑迁移）。退回旧的两步写法：
        // 它有半成功窗口，但总好过"交卷直接不可用"。日志只记开发环境（logError 在生产是空操作），
        // 所以线上要靠 client_events 里的 rpc_missing 事件来发现它 —— 迁移执行后这个分支应当永不进入。
        logError('exam.submitExam.rpcMissing', e)
        reportClientEvent({ kind: 'rpc_missing', name: 'complete_exam', detail: { context: 'exam.submitExam' } })
        const startedMs = new Date(session.started_at).getTime()
        try {
          if (answerPayload.length > 0) {
            await upsertAnswers(answerPayload.map((a) => ({
              user_id: session.user_id,
              question_id: a.question_id,
              selected_answer: a.selected_answer,
              is_correct: a.is_correct,
              mode: 'exam' as const,
              exam_session_id: session.id,
            })))
          }
          const now = new Date()
          await completeExamSession(session.id, {
            correct_count: correctItems,
            score,
            duration_ms: now.getTime() - startedMs,
            current_index: get().currentIndex,
            completed_at: now.toISOString(),
          })
        } catch (e2) {
          fail(e2, 'exam.submitExam.legacy')
          return
        }
        patch = { correct_count: correctItems, score, duration_ms: Date.now() - startedMs }
      }

      apply({ type: 'submit/done', patch: { status: 'completed', ...patch } })
      useRefreshStore.getState().bump()
    }),

    reset: () => apply({ type: 'reset' }),
  }
})

registerUserScopedStore(() => useExamStore.getState().reset())
