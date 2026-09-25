import { useCallback, useEffect } from 'react'
import { insertAnswer, updateAnswer, type AnswerUpdate } from '@/services/practice'
import { isAppError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { useSyncStore } from '@/stores/sync-store'
import { addPendingAnswer } from '@/lib/offline-db'
import { autoIndex } from '@/lib/rag'

/** sequential = 顺序学习(推进计划轮次), random = 复习自由刷 */
export type AnswerSource = 'sequential' | 'random'

export function useUserAnswers() {
  const user = useAuthStore((s) => s.user)
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const refreshPending = useSyncStore((s) => s.refresh)
  const sync = useSyncStore((s) => s.sync)

  // Load initial pending count and auto-sync when coming back online
  useEffect(() => {
    refreshPending()
    const onOnline = () => { sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const saveAnswer = useCallback(
    async (questionId: string, selectedAnswer: unknown, isCorrect: boolean, mode: 'practice' | 'exam', examSessionId?: string, source?: AnswerSource) => {
      if (!user) return null

      // Offline: queue to IndexedDB
      if (!navigator.onLine) {
        const localId = await addPendingAnswer({
          user_id: user.id,
          question_id: questionId,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          mode,
          exam_session_id: examSessionId ?? null,
          source: source ?? null,
          answered_at: new Date().toISOString(),
        })
        refreshPending()
        return `local-${localId}`
      }

      // Online: direct Supabase insert
      try {
        return await insertAnswer({
          user_id: user.id,
          question_id: questionId,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          mode,
          exam_session_id: examSessionId ?? null,
          source: source ?? null,
        })
      } catch (e) {
        // 只有网络类失败才值得走离线队列: 校验/权限错误重试也没用
        if (!isAppError(e) || e.kind !== 'network') throw e
        const localId = await addPendingAnswer({
          user_id: user.id,
          question_id: questionId,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          mode,
          exam_session_id: examSessionId ?? null,
          source: source ?? null,
          answered_at: new Date().toISOString(),
        })
        refreshPending()
        return `local-${localId}`
      }
    },
    [user],
  )

  const updateNote = useCallback(
    async (answerId: string, note: string, isPublic?: boolean) => {
      // Offline answers can't be updated — skip
      if (answerId.startsWith('local-')) return

      const payload: AnswerUpdate = { note: note || null }
      if (isPublic !== undefined) payload.is_public = isPublic
      await updateAnswer(answerId, payload)
      // 笔记改成公开/改内容/取消公开都走这里, 索引跟着一起动(服务端只看 is_public, 私密笔记不会进)
      autoIndex('note', answerId)
    },
    [],
  )

  return { saveAnswer, updateNote, sync, pendingCount }
}
