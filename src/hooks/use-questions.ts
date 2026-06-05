import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Question } from '@/types'

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError, count: total } = await supabase
      .from('questions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setQuestions((data ?? []) as Question[])
      if (total !== null) setCount(total)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const createQuestion = async (question: Omit<Question, 'id' | 'created_at' | 'created_by'>) => {
    const { error: createError } = await supabase.from('questions').insert(question as Record<string, unknown>)
    if (createError) throw createError
    await fetchQuestions()
  }

  const updateQuestion = async (id: string, question: Partial<Question>) => {
    const { error: updateError } = await supabase.from('questions').update(question as Record<string, unknown>).eq('id', id)
    if (updateError) throw updateError
    await fetchQuestions()
  }

  const deleteQuestion = async (id: string) => {
    const { error: deleteError } = await supabase.from('questions').delete().eq('id', id)
    if (deleteError) throw deleteError
    await fetchQuestions()
  }

  return {
    questions,
    count,
    isLoading,
    error,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    refetch: fetchQuestions,
  }
}
