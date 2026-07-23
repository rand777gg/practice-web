import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { TestCase, SubmissionResult } from '@/types'

interface JudgeResponse {
  status: string
  results: SubmissionResult[]
  execution_time_ms: number
}

export function useCodeSubmission(questionId: string) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SubmissionResult[] | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<string | null>(null)

  const submit = useCallback(
    async (code: string, language: string, testCases: TestCase[], runtimeConfig?: { timeout_ms?: number; memory_mb?: number }, executionMode?: 'stdio' | 'function') => {
      if (!user) return null
      setLoading(true)
      setResults(null)
      setJudgeStatus('running')

      try {
        const { data, error } = await supabase.functions.invoke<JudgeResponse>('judge', {
          body: { code, language, test_cases: testCases, runtime_config: runtimeConfig, execution_mode: executionMode || 'stdio' },
        })

        if (error) throw error

        const r = data as JudgeResponse
        setResults(r.results)
        setJudgeStatus(r.status)

        const allPassed = r.results.every((x) => x.passed)

        // Save submission record
        await supabase.from('submissions').insert({
          user_id: user.id,
          question_id: questionId,
          code,
          language,
          status: r.status,
          results: r.results,
          execution_time_ms: r.execution_time_ms,
        })

        return { allPassed, results: r.results, status: r.status }
      } catch (err) {
        setJudgeStatus('runtime_error')
        await supabase.from('submissions').insert({
          user_id: user.id,
          question_id: questionId,
          code,
          language,
          status: 'runtime_error',
          error: String(err),
        })
        throw err
      } finally {
        setLoading(false)
      }
    },
    [user, questionId],
  )

  const clearResults = useCallback(() => {
    setResults(null)
    setJudgeStatus(null)
  }, [])

  return { submit, loading, results, judgeStatus, clearResults }
}
