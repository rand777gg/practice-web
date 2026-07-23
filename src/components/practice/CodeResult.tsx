import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { SubmissionResult } from '@/types'

interface Props {
  results: SubmissionResult[] | null
  status: string | null
}

export function CodeResult({ results, status }: Props) {
  const { t } = useT()

  if (!results) return null

  const passedCount = results.filter((r) => r.passed).length
  const allPassed = passedCount === results.length

  return (
    <div className="space-y-2">
      <div className={cn(
        'flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md',
        allPassed
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
      )}>
        {allPassed
          ? <CheckCircle2 className="size-4" />
          : status === 'runtime_error'
            ? <AlertTriangle className="size-4" />
            : <XCircle className="size-4" />
        }
        <span>
          {t('practice.codeEditor.testCases') ?? '测试用例'}：{passedCount}/{results.length}{' '}
          {allPassed
            ? (t('practice.codeEditor.passed') ?? '通过')
            : (t('practice.codeEditor.failed') ?? '失败')}
        </span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {results.map((r) => (
          <div
            key={r.testCaseIndex}
            className={cn(
              'text-xs rounded-md p-2 border',
              r.passed
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {r.passed
                ? <CheckCircle2 className="size-3 text-emerald-500" />
                : <XCircle className="size-3 text-red-500" />
              }
              <span className="font-medium">
                #{r.testCaseIndex + 1}
                {r.passed
                  ? ` ${t('practice.codeEditor.passed') ?? '通过'}`
                  : ` ${t('practice.codeEditor.failed') ?? '失败'}`}
              </span>
            </div>
            {r.input && (
              <div className="text-muted-foreground mb-0.5">
                Input: <code className="text-zinc-700 dark:text-zinc-300">{r.input}</code>
              </div>
            )}
            {!r.passed && (
              <>
                <div className="text-emerald-600 dark:text-emerald-400">
                  {t('practice.codeEditor.expectedOut') ?? '期望输出'}: <code>{r.expected || (t('practice.codeEditor.noOutput') ?? '(无输出)')}</code>
                </div>
                <div className="text-red-600 dark:text-red-400">
                  {t('practice.codeEditor.actualOut') ?? '实际输出'}: <code>{r.actual || (t('practice.codeEditor.noOutput') ?? '(无输出)')}</code>
                </div>
              </>
            )}
            {r.error && (
              <div className="text-red-500 mt-1 font-mono whitespace-pre-wrap">{r.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
