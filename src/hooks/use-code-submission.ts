import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { judgeOnJudge0, JUDGE0_DEFAULT_URL, isJudge0Reachable } from '@/lib/judge0'
import type { TestCase, SubmissionResult } from '@/types'

export type JudgeSource = 'central' | 'local'

interface JudgeResponse {
  status: string
  results: SubmissionResult[]
  execution_time_ms: number
}

/** 练习时选用的判题通道。默认中心(计入公共成绩);本地需用户在题干侧开启自测并保证 Judge0 已启动。 */
export interface SubmissionOptions {
  judgeSource?: JudgeSource
  /** 本地判题的 Judge0 地址(默认 http://localhost:2358) */
  localJudgeUrl?: string
  /** 是否仅自测、不因失败抛错打断流程(local 自测用 true) */
  tolerant?: boolean
}

export function useCodeSubmission(questionId: string) {
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SubmissionResult[] | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<string | null>(null)

  const persist = useCallback(
    async (payload: {
      code: string
      language: string
      status: string
      results?: SubmissionResult[] | null
      execution_time_ms?: number
      error?: string
      judge_source?: JudgeSource
    }) => {
      if (!user) return
      try {
        await supabase.from('submissions').insert({
          user_id: user.id,
          question_id: questionId,
          code: payload.code,
          language: payload.language,
          status: payload.status,
          results: payload.results ?? null,
          error: payload.error ?? null,
          execution_time_ms: payload.execution_time_ms ?? null,
          judge_source: payload.judge_source ?? 'central',
        })
      } catch (e) {
        // 落库失败不影响判题主流程;本地自测更不应因记录失败而报错
        console.error('persist submission failed', e)
      }
    },
    [user, questionId],
  )

  const submit = useCallback(
    async (
      code: string,
      language: string,
      testCases: TestCase[],
      runtimeConfig?: { timeout_ms?: number; memory_mb?: number },
      executionMode?: 'stdio' | 'function',
      options: SubmissionOptions = {},
    ) => {
      if (!user) return null
      const { judgeSource = 'central', localJudgeUrl = JUDGE0_DEFAULT_URL, tolerant = false } = options
      const source: JudgeSource = judgeSource

      setLoading(true)
      setResults(null)
      setJudgeStatus('running')

      try {
        let verdict: JudgeResponse

        if (source === 'local') {
          // ---- 本地 Judge0 自测:仅 stdio + 映射语言,否则回退提示 ----
          if (executionMode === 'function') {
            throw new Error('本地 Judge0 判题仅支持 stdio 模式的题目(function/LeetCode 模板题请走中心判题)')
          }
          const reachable = await isJudge0Reachable(localJudgeUrl)
          if (!reachable) {
            throw new Error(`无法连接本地 Judge0(${localJudgeUrl})。请先启动 Docker 中的 Judge0,或关闭「本地自测」改走平台判题。`)
          }
          const local = await judgeOnJudge0(code, language, testCases, {
            baseUrl: localJudgeUrl,
            timeoutMs: runtimeConfig?.timeout_ms ?? 2000,
            memoryMb: runtimeConfig?.memory_mb ?? 128,
          })
          verdict = { status: local.status, results: local.results, execution_time_ms: local.execution_time_ms }
        } else {
          // ---- 中心判题:经平台 Edge Function(Judge0 转发),计入公共成绩 ----
          const { data, error } = await supabase.functions.invoke<JudgeResponse>('judge', {
            body: {
              code,
              language,
              test_cases: testCases,
              runtime_config: runtimeConfig,
              execution_mode: executionMode || 'stdio',
            },
          })
          if (error) throw error
          const r = data as JudgeResponse
          verdict = { status: r.status, results: r.results ?? [], execution_time_ms: r.execution_time_ms }
        }

        setResults(verdict.results)
        setJudgeStatus(verdict.status)

        const allPassed = verdict.results.every((x) => x.passed)

        await persist({
          code,
          language,
          status: verdict.status,
          results: verdict.results,
          execution_time_ms: verdict.execution_time_ms,
          judge_source: source,
        })

        return { allPassed, results: verdict.results, status: verdict.status, judgeSource: source }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setJudgeStatus('runtime_error')
        // 本地自测仅记录失败现场,不重复抛错打断 UI;中心失败仍抛(由调用方兜底)
        await persist({ code, language, status: 'runtime_error', error: msg, judge_source: source })
        if (tolerant) {
          setResults([
            {
              testCaseIndex: 0,
              passed: false,
              input: '',
              expected: '',
              actual: '',
              error: msg,
              status: 'runtime_error',
            },
          ])
          return { allPassed: false, results: null as unknown as SubmissionResult[], status: 'runtime_error', judgeSource: source, error: msg }
        }
        throw err
      } finally {
        setLoading(false)
      }
    },
    [user, questionId, persist],
  )

  const clearResults = useCallback(() => {
    setResults(null)
    setJudgeStatus(null)
  }, [])

  return { submit, loading, results, judgeStatus, clearResults }
}
