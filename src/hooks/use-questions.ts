import { useCallback, useEffect, useRef, useState } from 'react'
import { autoIndex } from '@/lib/rag'
import { logError, userMessage } from '@/services/errors'
import {
  countQuestionItems,
  deleteQuestion as deleteQuestionRow,
  fetchQuestionPage,
  fetchQuestionsByIds,
  insertQuestions,
  toQuestionInsert,
  updateQuestion as updateQuestionRow,
  type QuestionPageQuery,
} from '@/services/questions'
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
  issueFlag?: '' | 'suspected' | 'confirmed'
}

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [count, setCount] = useState(0)
  /** 同一筛选条件下的**小题**总数：卷面题型一条记录含多个小题（完形 20 空），
   *  只报记录数会让人以为题少了 */
  const [itemCount, setItemCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const paramsRef = useRef<FetchParams>({})

  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  const fetchQuestions = useCallback(async (params: FetchParams = {}) => {
    const { page: p = 1, pageSize: ps = pageSize, search, subject, category, questionType, importMode, verified, keyPoints, issueFlag } = params
    paramsRef.current = { ...params, pageSize: ps }
    setIsLoading(true)
    setError(null)

    // 列表与总数走同一套筛选口径（'__unset__' / '__none__' 两个哨兵值也一致），
    // 记录数与小题数都交给 count_question_items，不再依赖 PostgREST 的 count 头
    const query: QuestionPageQuery = { page: p, pageSize: ps, search, subject, category, questionType, importMode, verified, keyPoints, issueFlag }
    try {
      const [rows, counts] = await Promise.all([fetchQuestionPage(query), countQuestionItems(query)])
      // 列表列集不含 case_questions, 而列表里的小题徽标是按 case_questions 算的,
      // 所以按本页 id 再取一次整题 —— 少了这步, 完形/案例分析那类记录的"N 题"徽标会整片消失
      const full = await fetchQuestionsByIds(rows.map((r) => r.id))
      const byId = new Map(full.map((q) => [q.id, q]))
      setQuestions(rows.flatMap((r) => { const q = byId.get(r.id); return q ? [q] : [] }))
      setCount(counts.rows)
      setItemCount(counts.items)
    } catch (e) {
      logError('useQuestions.fetchQuestions', e)
      setError(userMessage(e))
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
    const [id] = await insertQuestions([toQuestionInsert(question)])
    autoIndex('question', id)
    await fetchQuestions({ ...paramsRef.current, page: 1 })
  }

  const updateQuestion = async (id: string, question: Partial<Question>) => {
    await updateQuestionRow(id, question)
    autoIndex('question', id)
    await fetchQuestions({ ...paramsRef.current, page })
  }

  const deleteQuestion = async (id: string) => {
    await deleteQuestionRow(id)
    // 删题也要同步: 差集里多出来的旧块靠这一次调用清掉, 否则被删的题还会被小Q 引用出来
    autoIndex('question', id)
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
    itemCount,
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
