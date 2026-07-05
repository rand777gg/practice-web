import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Question, QuestionType } from '@/types'

const DEFAULT_PAGE_SIZE = 20

export interface FetchParams {
  page?: number
  pageSize?: number
  search?: string
  subject?: string
  category?: string
  questionType?: QuestionType | ''
  importMode?: string
  verified?: '' | 'true' | 'false'
  keyPoints?: string
}

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const paramsRef = useRef<FetchParams>({})

  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  const fetchQuestions = useCallback(async (params: FetchParams = {}) => {
    const { page: p = 1, pageSize: ps = pageSize, search, subject, category, questionType, importMode, verified, keyPoints } = params
    paramsRef.current = { ...params, pageSize: ps }
    setIsLoading(true)
    setError(null)

    const from = (p - 1) * ps
    const to = from + ps - 1

    let query = supabase
      .from('questions')
      .select('*', { count: 'exact' })

    if (search) query = query.ilike('question_text', `%${search}%`)
    if (subject) query = query.eq('subject', subject)
    if (category) query = query.or(`category.eq."${category}",categories.cs.["${category}"]`)
    if (questionType) query = query.eq('question_type', questionType)
    if (importMode) query = query.eq('import_mode', importMode)
    if (verified === 'true') query = query.eq('verified', true)
    else if (verified === 'false') query = query.eq('verified', false)
    if (keyPoints) query = query.ilike('key_points', `%${keyPoints}%`)

    query = query.order('created_at', { ascending: false }).range(from, to)

    const { data, error: fetchError, count: total } = await query

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setQuestions((data ?? []) as Question[])
      if (total !== null) setCount(total)
    }
    setPage(p)
    if (ps !== pageSize) setPageSize(ps)
    setIsLoading(false)
  }, [pageSize])

  useEffect(() => {
    fetchQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const fetchQuestionsRef = useRef(fetchQuestions)
  fetchQuestionsRef.current = fetchQuestions

  const handleSetPageSize = useCallback((ps: number) => {
    setPageSize(ps)
    fetchQuestionsRef.current({ ...paramsRef.current, pageSize: ps, page: 1 })
  }, [])

  return {
    questions,
    count,
    isLoading,
    error,
    page,
    totalPages,
    pageSize,
    setPageSize: handleSetPageSize,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    fetchQuestions,
    refetch: () => fetchQuestions(paramsRef.current),
  }
}
