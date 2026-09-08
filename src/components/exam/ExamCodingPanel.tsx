import { useState, useEffect, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { CodeEditorCM } from '@/components/practice/CodeEditorCM'
import { CodeResult } from '@/components/practice/CodeResult'
import { WhitespaceBlock } from '@/components/practice/WhitespaceBlock'
import { Icon } from '@/lib/icons'
import { useCodeSubmission } from '@/hooks/use-code-submission'
import { isJudge0Reachable, JUDGE0_DEFAULT_URL } from '@/lib/judge0'
import { Play, Loader2, TriangleAlert, RotateCcw, Terminal } from 'lucide-react'
import type { Question, TestCase, CodingAnswer } from '@/types'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript', icon: 'vscode-icons:file-type-js-official' },
  { value: 'typescript', label: 'TypeScript', icon: 'vscode-icons:file-type-typescript-official' },
  { value: 'python', label: 'Python', icon: 'vscode-icons:file-type-python' },
  { value: 'cpp', label: 'C++', icon: 'vscode-icons:file-type-cpp3' },
  { value: 'java', label: 'Java', icon: 'vscode-icons:file-type-java' },
]

interface Props {
  question: Question
  /** 当前已保存作答(兼容旧字符串作答); 由父组件按题 id 挂 key 以保证切题后状态重置 */
  value: CodingAnswer | null | undefined
  onChange: (a: CodingAnswer) => void
}

/** 考试模式编程题作答面板: CodeMirror + 语言选择 + 运行自测(本地/平台) */
export function ExamCodingPanel({ question, value, onChange }: Props) {
  const { t } = useT()
  const isLocalJudgeable = (question.execution_mode ?? 'stdio') !== 'function'
  const testCases = (question.test_cases ?? []) as TestCase[]

  const code0 = value ? value.code : ''
  const lang0 = value?.language && LANGUAGES.some((l) => l.value === value.language) ? value.language : 'python'

  const [code, setCode] = useState(code0)
  const [language, setLanguage] = useState(lang0)
  const [channel, setChannel] = useState<'local' | 'central'>('central')
  const [localReachable, setLocalReachable] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [allPassed, setAllPassed] = useState<boolean>(value?.allPassed ?? false)
  const [activeCase, setActiveCase] = useState(0)
  const { submit, loading, results, judgeStatus, clearResults } = useCodeSubmission(question.id)

  useEffect(() => {
    if (!isLocalJudgeable) return
    let cancelled = false
    isJudge0Reachable(JUDGE0_DEFAULT_URL).then((ok) => {
      if (cancelled) return
      setLocalReachable(ok)
      // 本地 Judge0 可达才给本地自测入口;默认平台判题
    })
    return () => { cancelled = true }
  }, [isLocalJudgeable])

  const emit = useCallback((nextCode: string, nextLang: string, passed: boolean) => {
    onChange({ code: nextCode, language: nextLang, allPassed: passed })
  }, [onChange])

  const handleCode = (next: string) => {
    setCode(next)
    emit(next, language, allPassed)
  }
  const handleLang = (v: string) => {
    setLanguage(v)
    emit(code, v, allPassed)
  }

  const run = async () => {
    if (!code.trim()) { setNotice(t('codeEditor.pleaseWriteCode') ?? '请先编写代码'); return }
    setNotice(null)
    clearResults()
    const useLocal = channel === 'local'
    if (useLocal && !isLocalJudgeable) { setNotice(t('localJudge.functionNotice') ?? 'function 模板题不适用'); return }
    if (useLocal && localReachable !== true) { setNotice(t('localJudge.offlineShort') ?? '未连接本地 Judge0'); return }
    try {
      const res = await submit(code, language, testCases, question.runtime_config, 'stdio', {
        judgeSource: useLocal ? 'local' : 'central',
        tolerant: useLocal,
        // 考试自测不入公共提交记录(正式计分以交卷时的作答为准)
        persist: false,
      })
      if (res) {
        const passed = !!res.allPassed
        setAllPassed(passed)
        emit(code, language, passed)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setNotice(msg)
    }
  }

  const activeCaseData = testCases[activeCase]
  const activeLang = LANGUAGES.find((l) => l.value === language) ?? LANGUAGES[0]

  return (
    <div
      className="space-y-2"
      // 阻止作答区横向滑动手势冒泡到切题容器(编辑/选择文本不应切题)
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* 编辑器头部: 语言 + 通道 + 运行 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Terminal className="h-3.5 w-3.5" />{t('codeEditor.code') ?? '代码'}</span>
        <Icon icon={activeLang.icon} className="h-4 w-4" />
        <Select value={language} onValueChange={handleLang}>
          <SelectTrigger size="sm" className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
        </Select>
        {isLocalJudgeable && (
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => { setChannel('local'); setNotice(null) }}
              disabled={localReachable !== true}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                localReachable === true
                  ? channel === 'local'
                    ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-border text-muted-foreground hover:bg-muted'
                  : 'border-border text-muted-foreground',
              )}
              title={t('localJudge.enableShort') ?? '本地自测'}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', localReachable === true ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              {t('localJudge.enableShort') ?? '本地自测'}
            </button>
            <button
              type="button"
              onClick={() => { setChannel('central'); setNotice(null) }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                channel === 'central' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t('localJudge.central') ?? '平台判题'}
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={clearResults} className="p-1 text-muted-foreground hover:text-foreground" title={t('codeEditor.clear') ?? '清空结果'}><RotateCcw className="h-3.5 w-3.5" /></button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={run} disabled={loading || !code.trim() || (channel === 'local' && localReachable !== true)}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {loading ? (t('codeEditor.judging') ?? '判题中…') : (t('codeEditor.runShort') ?? '运行')}
          </Button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{notice}</span>
        </div>
      )}

      <CodeEditorCM value={code} onChange={handleCode} language={language} minHeight="200px" />

      {/* 测试用例(只读预览 + 运行回显) */}
      {testCases.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20">
          <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{(t('codeEditor.testCases') ?? '测试点')}</span>
            {testCases.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveCase(i)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  activeCase === i ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                Case {i + 1}
              </button>
            ))}
          </div>
          {activeCaseData && (
            <div className="border-t border-border px-2 py-1.5 text-[11px] space-y-1">
              <p className="text-muted-foreground">{t('codeEditor.input') ?? '输入'}<WhitespaceBlock text={activeCaseData.input || (t('codeEditor.emptyMark') ?? '(空)')} className="mt-0.5 text-foreground" dim={false} /></p>
              <p className="text-muted-foreground">{t('codeEditor.expected') ?? '期望'}<WhitespaceBlock text={activeCaseData.expected || (t('codeEditor.emptyMark') ?? '(空)')} className="mt-0.5 text-emerald-600 dark:text-emerald-400" dim={false} /></p>
            </div>
          )}
        </div>
      )}

      {/* 判题结果 */}
      <CodeResult results={results} status={judgeStatus} testCasesCount={testCases.length} />
    </div>
  )
}
