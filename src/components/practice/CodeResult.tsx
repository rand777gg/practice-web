import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'
import type { SubmissionResult } from '@/types'
import { WhitespaceBlock } from '@/components/practice/WhitespaceBlock'

interface Props {
  results: SubmissionResult[] | null
  status: string | null
  testCasesCount?: number
  /** 单测模式:仅回显本次单个用例,标题显示 Case n 的判定 */
  singleCaseIndex?: number
}

const statusLabel = (st: string | undefined, t: ReturnType<typeof useT>['t']): string => {
  switch (st) {
    case 'accepted': return t('codeEditor.passed') ?? '通过'
    case 'wrong_answer': return t('localJudge.status_wrong_answer') ?? '答案错误'
    case 'timeout': return t('localJudge.status_timeout') ?? '超时'
    case 'compile_error': return t('localJudge.status_compile_error') ?? '编译错误'
    case 'runtime_error': return t('localJudge.status_runtime_error') ?? '运行错误'
    default: return t('codeEditor.failed') ?? '失败'
  }
}

export function CodeResult({ results, status, testCasesCount, singleCaseIndex }: Props) {
  const { t } = useT()
  if (!results || results.length === 0) return null

  const isSingle = singleCaseIndex != null
  const total = isSingle ? 1 : (testCasesCount ?? results.length)
  const doneCount = results.filter((r) => r.status !== 'pending' && r.status !== 'running').length
  const passedCount = results.filter((r) => r.passed).length
  const running = status === 'running' || doneCount < total
  const allPassed = !running && passedCount === total
  const verdict = running
    ? (t('codeEditor.judging') ?? '判题中…')
    : allPassed
      ? (t('codeEditor.passed') ?? '通过')
      : (t('codeEditor.failed') ?? '失败')

  return (
    <div className="space-y-2">
      {/* 汇总条 */}
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md',
          running
            ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300'
            : allPassed
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
        )}
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" />
        ) : allPassed ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <XCircle className="size-4" />
        )}
        <span>
          {isSingle
            ? `Case ${singleCaseIndex + 1}：${verdict}`
            : running
              ? `${t('codeEditor.testCases') ?? '测试点'}：${doneCount}/${total} ${verdict}`
              : `${t('codeEditor.testCases') ?? '测试点'}：${passedCount}/${total} ${verdict}`}
        </span>
      </div>

      {/* 逐测试点卡片 */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
        {results.map((r, idx) => {
          const pending = r.status === 'pending' || r.status === 'running'
          const border = pending
            ? 'border-border/70 bg-muted/10'
            : r.passed
              ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
          return (
            <div key={r.testCaseIndex ?? idx} className={cn('text-xs rounded-md p-2 border', border)}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-muted-foreground font-mono">#{idx + 1}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium',
                    pending
                      ? 'bg-muted text-muted-foreground'
                      : r.passed
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                  )}
                >
                  {pending ? (
                    <Clock className="size-2.5" />
                  ) : r.passed ? (
                    <CheckCircle2 className="size-2.5" />
                  ) : (
                    <XCircle className="size-2.5" />
                  )}
                  {pending ? (t('codeEditor.judgingShort') ?? '判题中') : statusLabel(r.status, t)}
                </span>
                {(r.time_ms != null || r.memory_kb != null) && (
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {r.time_ms != null ? `${r.time_ms}ms` : ''}
                    {r.memory_kb != null ? `${r.time_ms != null ? ' · ' : ''}${Math.round(r.memory_kb / 1024)}MB` : ''}
                  </span>
                )}
              </div>

              {/* 输入 | 期望/实际 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className="rounded border border-border/60 bg-background/60 p-1.5 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t('codeEditor.input') ?? '输入'}</p>
                  <WhitespaceBlock text={r.input || (t('codeEditor.emptyMark') ?? '(空)')} className="text-zinc-700 dark:text-zinc-200" dim={false} />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="rounded border border-border/60 bg-background/60 p-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t('codeEditor.expectedOut') ?? '期望输出'}</p>
                    <WhitespaceBlock text={r.expected || (t('codeEditor.emptyMark') ?? '(空)')} className="text-emerald-700 dark:text-emerald-300" dim={false} />
                  </div>
                  {!pending && (
                    <div className="rounded border border-border/60 bg-background/60 p-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t('codeEditor.actualOut') ?? '实际输出'}</p>
                      <WhitespaceBlock
                        text={r.actual || (r.error ? (t('codeEditor.noOutput') ?? '(无输出)') : (t('codeEditor.emptyMark') ?? '(空)'))}
                        className={r.passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}
                        dim={false}
                      />
                    </div>
                  )}
                </div>
              </div>

              {r.error && (
                <div className="mt-1.5 rounded border border-red-300/50 bg-red-50 px-2 py-1 font-mono whitespace-pre-wrap text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  {r.error}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
