import { create } from 'zustand'
import { completeExamSession, createExamSession, fetchExamSession, saveExamCursor } from '@/services/exam'
import { fetchExamAnswers, upsertAnswer, upsertAnswers } from '@/services/practice'
import { logError, userMessage } from '@/services/errors'
import type { AnswerInsert } from '@/services/practice'
import { useRefreshStore } from './refresh-store'
import { registerUserScopedStore } from '@/stores/user-scope'
import {
  isAnswerCorrect,
  questionCorrectItemCount,
  questionItemCount,
  sessionItemCount,
} from '@/lib/answer-utils'
import { composeExamIds, fetchQuestionsByIds } from '@/lib/exam-compose'
import { MULTI_ITEM_QUESTION_TYPES } from '@/lib/constants'
import type { ExamSession, Question, CorrectAnswer, ExamTemplate, ExamSampleMode, ExamComposeStat } from '@/types'

/**
 * 考试游标的上界：**按小题（卡片）算**。
 * 卷面题型一条记录含多个小题（完形整篇 20 空 = 20 张卡），按记录数会把游标卡死在第 9 张卡；
 * 普通题一个记录一张卡，跟记录数一致。
 */
function cardCount(questions: Question[]): number {
  return sessionItemCount(questions)
}

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

interface ExamState {
  session: ExamSession | null
  questions: Question[]
  currentIndex: number
  answers: Map<string, CorrectAnswer>
  isLoading: boolean
  isSubmitting: boolean
  error: string | null

  startExam: (params: StartExamParams) => Promise<StartExamResult>
  resumeExam: (sessionId: string) => Promise<void>
  answerQuestion: (questionId: string, answer: CorrectAnswer) => void
  nextQuestion: () => Promise<void>
  previousQuestion: () => Promise<void>
  jumpTo: (index: number) => Promise<void>
  submitExam: () => Promise<void>
  reset: () => void
}

export const useExamStore = create<ExamState>((set, get) => ({
  session: null,
  questions: [],
  currentIndex: 0,
  answers: new Map(),
  isLoading: false,
  isSubmitting: false,
  error: null,

  startExam: async ({ userId, questionCount, durationMs, subjects, categories, questionTypes, template, sampleMode, questionIds: fixedIds }) => {
    set({ isLoading: true, error: null })

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
          set({ isLoading: false, error: e.message })
          return { questionIds: [] as string[], stats: [] as ExamComposeStat[] }
        })

    if (questionIds.length === 0) {
      if (!get().error) {
        set({ isLoading: false, error: 'No questions available. Please add questions first.' })
      }
      return { ok: false, stats }
    }

    const orderedQuestions = await fetchQuestionsByIds(questionIds).catch((e: Error) => {
      set({ isLoading: false, error: e.message })
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
      logError('exam.startExam', e)
      set({ isLoading: false, error: userMessage(e) })
      return { ok: false }
    }

    if (!session) {
      set({ isLoading: false, error: 'Failed to create session' })
      return { ok: false }
    }

    set({
      session,
      questions: orderedQuestions,
      currentIndex: 0,
      answers: new Map(),
      isLoading: false,
    })
    return { ok: true, stats }
  },

  resumeExam: async (sessionId) => {
    set({ isLoading: true, error: null })

    let sess: ExamSession | null
    try {
      sess = await fetchExamSession(sessionId)
    } catch (e) {
      logError('exam.resumeExam', e)
      sess = null
    }

    if (!sess) {
      set({ isLoading: false, error: 'Session not found' })
      return
    }

    if (sess.status === 'completed') {
      set({ isLoading: false, session: sess })
      return
    }

    let orderedQuestions: Question[]
    try {
      orderedQuestions = await fetchQuestionsByIds(sess.question_ids)
    } catch (e) {
      logError('exam.resumeExam.questions', e)
      set({ isLoading: false, error: 'Failed to load questions' })
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

    set({
      session: sess,
      questions: orderedQuestions,
      currentIndex: sess.current_index,
      answers: answersMap,
      isLoading: false,
    })
  },

  answerQuestion: (questionId, answer) => {
    const { answers, session, questions } = get()
    const newAnswers = new Map(answers)
    newAnswers.set(questionId, answer)
    set({ answers: newAnswers })

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
    const { currentIndex, questions, session } = get()
    // 游标按**小题（卡片）**走：卷面题型一条记录含多个小题，用 questions.length 会卡在第 9 张卡
    if (currentIndex < cardCount(questions) - 1) {
      const newIndex = currentIndex + 1
      set({ currentIndex: newIndex })
      if (session) await saveExamCursor(session.id, newIndex).catch((e) => logError('exam.saveCursor', e))
    }
  },

  previousQuestion: async () => {
    const { currentIndex, session } = get()
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      set({ currentIndex: newIndex })
      if (session) await saveExamCursor(session.id, newIndex).catch((e) => logError('exam.saveCursor', e))
    }
  },

  jumpTo: async (index) => {
    const { questions, session } = get()
    if (index >= 0 && index < cardCount(questions)) {
      set({ currentIndex: index })
      if (session) await saveExamCursor(session.id, index).catch((e) => logError('exam.saveCursor', e))
    }
  },

  submitExam: async () => {
    const { session, questions, answers } = get()
    if (!session) return

    set({ isSubmitting: true, error: null })

    let correctItems = 0
    const totalItems = questions.reduce((sum, q) => sum + questionItemCount(q), 0)
    const answerRecords: AnswerInsert[] = []

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
      answerRecords.push({
        user_id: session.user_id,
        question_id: q.id,
        selected_answer: selected,
        is_correct: fullCorrect,
        mode: 'exam',
        exam_session_id: session.id,
      })
    }

    const now = new Date()
    const actualDuration = now.getTime() - new Date(session.started_at).getTime()
    const score = totalItems > 0 ? Math.round((correctItems / totalItems) * 100) : 0

    if (answerRecords.length > 0) {
      // upsert(而非 insert): 作答中的自动保存可能已写过同键行, 交卷时覆盖为最终判定, 避免重复键
      try {
        await upsertAnswers(answerRecords)
      } catch (e) {
        logError('exam.submitExam.answers', e)
        set({ isSubmitting: false, error: userMessage(e) })
        return
      }
    }

    try {
      await completeExamSession(session.id, {
        correct_count: correctItems,
        score,
        duration_ms: actualDuration,
        current_index: get().currentIndex,
        completed_at: now.toISOString(),
      })
    } catch (e) {
      logError('exam.submitExam', e)
      set({ isSubmitting: false, error: userMessage(e) })
      return
    }

    set({
      session: { ...session, status: 'completed', correct_count: correctItems, score, duration_ms: actualDuration },
      isSubmitting: false,
    })
    useRefreshStore.getState().bump()
  },

  reset: () => {
    set({
      session: null,
      questions: [],
      currentIndex: 0,
      answers: new Map(),
      isLoading: false,
      isSubmitting: false,
      error: null,
    })
  },
}))

registerUserScopedStore(() => useExamStore.getState().reset())
