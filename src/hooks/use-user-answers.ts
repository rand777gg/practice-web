import { useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useSyncStore } from '@/stores/sync-store'
import { addPendingAnswer } from '@/lib/offline-db'

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
    async (questionId: string, selectedAnswer: unknown, isCorrect: boolean, mode: 'practice' | 'exam', examSessionId?: string) => {
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
          answered_at: new Date().toISOString(),
        })
        refreshPending()
        return `local-${localId}`
      }

      // Online: direct Supabase insert
      const { data, error } = await supabase.from('user_answers').insert({
        user_id: user.id,
        question_id: questionId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        mode,
        exam_session_id: examSessionId ?? null,
      }).select('id').single()

      if (error) {
        // Fallback: save to offline queue if network error
        if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('timeout')) {
          const localId = await addPendingAnswer({
            user_id: user.id,
            question_id: questionId,
            selected_answer: selectedAnswer,
            is_correct: isCorrect,
            mode,
            exam_session_id: examSessionId ?? null,
            answered_at: new Date().toISOString(),
          })
          refreshPending()
          return `local-${localId}`
        }
        throw error
      }
      return data?.id as string | null
    },
    [user],
  )

  const updateNote = useCallback(
    async (answerId: string, note: string, isPublic?: boolean) => {
      // Offline answers can't be updated — skip
      if (answerId.startsWith('local-')) return

      const payload: { note: string | null; is_public?: boolean } = { note: note || null }
      if (isPublic !== undefined) payload.is_public = isPublic
      const { error } = await supabase
        .from('user_answers')
        .update(payload)
        .eq('id', answerId)
      if (error) throw error
    },
    [],
  )

  return { saveAnswer, updateNote, sync, pendingCount }
}
