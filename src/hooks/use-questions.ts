import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Question, QuestionType } from '@/types'

const PAGE_SIZE = 20

export interface FetchParams {
  page?: number
  search?: string
  subject?: string
  category?: string
  questionType?: QuestionType | ''
}

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const paramsRef = useRef<FetchParams>({})

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const fetchQuestions = useCallback(async (params: FetchParams = {}) => {
    const { page: p = 1, search, subject, category, questionType } = params
    paramsRef.current = params
    setIsLoading(true)
    setError(null)

    const from = (p - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('questions')
      .select('*', { count: 'exact' })

    if (search) query = query.ilike('question_text', `%${search}%`)
    if (subject) query = query.eq('subject', subject)
    if (category) query = query.contains('categories', [category])
    if (questionType) query = query.eq('question_type', questionType)

    query = query.order('created_at', { ascending: false }).range(from, to)

    const { data, error: fetchError, count: total } = await query

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setQuestions((data ?? []) as Question[])
      if (total !== null) setCount(total)
    }
    setPage(p)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const createQuestion = async (question: Omit<Question, 'id' | 'created_at' | 'created_by'>) => {
    const { error: createError } = await supabase.from('questions').insert(question as Record<string, unknown>)
    if (createError) throw createError
    await fetchQuestions({ ...paramsRef.current, page: 1 })
  }

  const updateQuestion = async (id: string, question: Partial<Question>) => {
    const { error: updateError } = await supabase.from('questions').update(question as Record<string, unknown>).eq('id', id)
    if (updateError) throw updateError
    await fetchQuestions({ ...paramsRef.current, page })
  }

  const deleteQuestion = async (id: string) => {
    const { error: deleteError } = await supabase.from('questions').delete().eq('id', id)
    if (deleteError) throw deleteError
    // If last item on page and not first page, go back one page
    const nextPage = questions.length <= 1 && page > 1 ? page - 1 : page
    await fetchQuestions({ ...paramsRef.current, page: nextPage })
  }

  return {
    questions,
    count,
    isLoading,
    error,
    page,
    totalPages,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    fetchQuestions,
    refetch: () => fetchQuestions(paramsRef.current),
  }
}
