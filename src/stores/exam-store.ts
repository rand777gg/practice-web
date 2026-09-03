import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useRefreshStore } from './refresh-store'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { composeExamIds, fetchQuestionsByIds } from '@/lib/exam-compose'
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
  nextQuestion: () => void
  previousQuestion: () => void
  jumpTo: (index: number) => void
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

  startExam: async ({ userId, questionCount, durationMs, subjects, categories, questionTypes, template, sampleMode }) => {
    set({ isLoading: true, error: null })

    const { questionIds, stats } = await composeExamIds({
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

    const { data: session, error: sError } = await supabase
      .from('exam_sessions')
      .insert({
        user_id: userId,
        total_questions: orderedQuestions.length,
        duration_ms: durationMs,
        question_ids: questionIds,
        current_index: 0,
        status: 'in_progress',
        correct_count: 0,
      })
      .select()
      .single()

    if (sError || !session) {
      set({ isLoading: false, error: sError?.message ?? 'Failed to create session' })
      return { ok: false }
    }

    set({
      session: session as unknown as ExamSession,
      questions: orderedQuestions,
      currentIndex: 0,
      answers: new Map(),
      isLoading: false,
    })
    return { ok: true, stats }
  },

  resumeExam: async (sessionId) => {
    set({ isLoading: true, error: null })

    const { data: session, error: sError } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sError || !session) {
      set({ isLoading: false, error: 'Session not found' })
      return
    }

    const sess = session as unknown as ExamSession

    if (sess.status === 'completed') {
      set({ isLoading: false, session: sess })
      return
    }

    const questionIds = sess.question_ids as string[]
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds)

    if (qError || !questions) {
      set({ isLoading: false, error: 'Failed to load questions' })
      return
    }

    const questionMap = new Map<string, Question>()
    for (const q of questions as Question[]) {
      questionMap.set(q.id, q)
    }
    const orderedQuestions = questionIds
      .map((id) => questionMap.get(id))
      .filter((q): q is Question => q !== undefined)

    const { data: existingAnswers } = await supabase
      .from('user_answers')
      .select('*')
      .eq('exam_session_id', sessionId)

    const answersMap = new Map<string, CorrectAnswer>()
    if (existingAnswers) {
      for (const ans of existingAnswers as { question_id: string; selected_answer: CorrectAnswer }[]) {
        answersMap.set(ans.question_id, ans.selected_answer)
      }
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
      const isC = q ? isAnswerCorrect(answer, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks) : false
      supabase.from('user_answers').upsert({
        user_id: session.user_id,
        question_id: questionId,
        selected_answer: answer as any,
        is_correct: isC,
        mode: 'exam',
        exam_session_id: session.id,
        answered_at: new Date().toISOString(),
      }, { onConflict: 'user_id,question_id,exam_session_id' }).then()
    }
  },

  nextQuestion: () => {
    const { currentIndex, questions, session } = get()
    if (currentIndex < questions.length - 1) {
      const newIndex = currentIndex + 1
      set({ currentIndex: newIndex })
      if (session) {
        supabase.from('exam_sessions').update({ current_index: newIndex }).eq('id', session.id).then()
      }
    }
  },

  previousQuestion: () => {
    const { currentIndex, session } = get()
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      set({ currentIndex: newIndex })
      if (session) {
        supabase.from('exam_sessions').update({ current_index: newIndex }).eq('id', session.id).then()
      }
    }
  },

  jumpTo: (index) => {
    const { questions, session } = get()
    if (index >= 0 && index < questions.length) {
      set({ currentIndex: index })
      if (session) {
        supabase.from('exam_sessions').update({ current_index: index }).eq('id', session.id).then()
      }
    }
  },

  submitExam: async () => {
    const { session, questions, answers } = get()
    if (!session) return

    set({ isSubmitting: true, error: null })

    let correctCount = 0
    const answerRecords: {
      user_id: string
      question_id: string
      selected_answer: unknown
      is_correct: boolean
      mode: string
      exam_session_id: string
    }[] = []

    for (const q of questions) {
      const selected = answers.get(q.id)
      if (selected == null) continue
      const isCorrect = isAnswerCorrect(selected, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks)
      if (isCorrect) correctCount++
      answerRecords.push({
        user_id: session.user_id,
        question_id: q.id,
        selected_answer: selected,
        is_correct: isCorrect,
        mode: 'exam',
        exam_session_id: session.id,
      })
    }

    const now = new Date()
    const actualDuration = now.getTime() - new Date(session.started_at).getTime()
    const score = Math.round((correctCount / questions.length) * 100)

    if (answerRecords.length > 0) {
      const { error: aError } = await supabase.from('user_answers').insert(answerRecords)
      if (aError) {
        set({ isSubmitting: false, error: aError.message })
        return
      }
    }

    const { error: uError } = await supabase
      .from('exam_sessions')
      .update({
        status: 'completed',
        correct_count: correctCount,
        score,
        duration_ms: actualDuration,
        current_index: get().currentIndex,
        completed_at: now.toISOString(),
      })
      .eq('id', session.id)

    if (uError) {
      set({ isSubmitting: false, error: uError.message })
      return
    }

    set({
      session: { ...session, status: 'completed', correct_count: correctCount, score, duration_ms: actualDuration },
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
