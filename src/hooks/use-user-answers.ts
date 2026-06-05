import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function useUserAnswers() {
  const user = useAuthStore((s) => s.user)

  const saveAnswer = useCallback(
    async (questionId: string, selectedAnswer: number, isCorrect: boolean, mode: 'practice' | 'exam', examSessionId?: string) => {
      if (!user) return
      const { error } = await supabase.from('user_answers').insert({
        user_id: user.id,
        question_id: questionId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        mode,
        exam_session_id: examSessionId ?? null,
      })
      if (error) throw error
    },
    [user],
  )

  return { saveAnswer }
}
