import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function useUserAnswers() {
  const user = useAuthStore((s) => s.user)

  const saveAnswer = useCallback(
    async (questionId: string, selectedAnswer: unknown, isCorrect: boolean, mode: 'practice' | 'exam', examSessionId?: string) => {
      if (!user) return null
      const { data, error } = await supabase.from('user_answers').insert({
        user_id: user.id,
        question_id: questionId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        mode,
        exam_session_id: examSessionId ?? null,
      }).select('id').single()
      if (error) throw error
      return data?.id as string | null
    },
    [user],
  )

  const updateNote = useCallback(
    async (answerId: string, note: string, isPublic?: boolean) => {
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

  return { saveAnswer, updateNote }
}
