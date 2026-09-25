import { useCallback, useEffect } from 'react'
import { insertAnswer, updateAnswer, type AnswerUpdate } from '@/services/practice'
import { isAppError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { useSyncStore } from '@/stores/sync-store'
import { enqueueAnswer } from '@/lib/offline-db'
import { autoIndex } from '@/lib/rag'

/** sequential = 顺序学习(推进计划轮次), random = 复习自由刷 */
export type AnswerSource = 'sequential' | 'random'

export function useUserAnswers() {
  const user = useAuthStore((s) => s.user)
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const refreshPending = useSyncStore((s) => s.refresh)
  const sync = useSyncStore((s) => s.sync)

  // 只负责首屏读一次计数；"网络恢复就同步"由 sync-store 统一挂的触发点负责，
  // 这里再挂一个 online 监听只会让同一件事有两个触发源
  useEffect(() => { refreshPending() }, [])

  const saveAnswer = useCallback(
    async (questionId: string, selectedAnswer: unknown, isCorrect: boolean, mode: 'practice' | 'exam', examSessionId?: string, source?: AnswerSource) => {
      if (!user) return null

      const base = {
        user_id: user.id,
        question_id: questionId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        mode,
        exam_session_id: examSessionId ?? null,
        source: source ?? null,
      }
      // 入队时补上作答时刻 —— 队列里的时间必须停在作答那一刻，不能是最终同步的时刻
      const queueIt = async () => {
        const operationId = await enqueueAnswer({ ...base, answered_at: new Date().toISOString() })
        await refreshPending()
        return `local-${operationId}`
      }

      if (!navigator.onLine) return queueIt()

      try {
        return await insertAnswer(base)
      } catch (e) {
        // 只有网络类失败才值得走离线队列: 校验/权限错误重试也没用
        if (!isAppError(e) || e.kind !== 'network') throw e
        return queueIt()
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
