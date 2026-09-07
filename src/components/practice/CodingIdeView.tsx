import { useState, useEffect, useRef, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { CodeEditorCM } from '@/components/practice/CodeEditorCM'
import { CodeResult } from '@/components/practice/CodeResult'
import { WhitespaceBlock } from '@/components/practice/WhitespaceBlock'
import { useCodeSubmission } from '@/hooks/use-code-submission'
import { isJudge0Reachable, JUDGE0_DEFAULT_URL, JUDGE0_PLATFORM_URL, measureJudge0Latency } from '@/lib/judge0'
import { Play, Loader2, TriangleAlert, Terminal, BookOpen, History, RotateCcw, GripVertical } from 'lucide-react'
import type { Question, TestCase, ExampleCase, CodingAnswer } from '@/types'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
]

type Tab = 'desc' | 'solution' | 'records'

interface Props {
  question: Question
  onSaveResult?: (answer: CodingAnswer) => void
}

export function CodingIdeView({ question, onSaveResult }: Props) {
  const { t } = useT()
  const { submit, loading, results, judgeStatus, clearResults } = useCodeSubmission(question.id)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')
  const [tab, setTab] = useState<Tab>('desc')
  const [channel, setChannel] = useState<'local' | 'central'>('local')
  const [localReachable, setLocalReachable] = useState<boolean | null>(null)
  const [platformLatency, setPlatformLatency] = useState<number | null>(null)
  const [platformChecking, setPlatformChecking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [customInput, setCustomInput] = useState('')
  // 左栏宽度(百分比),支持拖拽
  const [leftPct, setLeftPct] = useState(46)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const isLocalJudgeable = (question.execution_mode ?? 'stdio') !== 'function'
  const testCases = (question.test_cases ?? []) as TestCase[]
  const examples = (question.examples ?? []) as ExampleCase[]

  useEffect(() => {
    if (!isLocalJudgeable) return
    let cancelled = false
    isJudge0Reachable(JUDGE0_DEFAULT_URL).then((ok) => { if (!cancelled) setLocalReachable(ok) })
    return () => { cancelled = true }
  }, [isLocalJudgeable])

  // 拖拽分割线
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const move = (ev: PointerEvent) => {
      if (!rootRef.current || !draggingRef.current) return
      const rect = rootRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setLeftPct(Math.min(72, Math.max(26, pct)))
    }
    const up = () => {
      draggingRef.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const selectChannel = (c: 'local' | 'central') => {
    setChannel(c); setNotice(null)
    if (c === 'central') {
      setPlatformChecking(true); setPlatformLatency(null)
      measureJudge0Latency(JUDGE0_PLATFORM_URL).then((ms) => { setPlatformLatency(ms); setPlatformChecking(false) })
    }
  }

  const doRun = async (cases: TestCase[]) => {
    if (!code.trim()) { setNotice('请先编写代码'); return }
    setNotice(null); clearResults()
    const useLocal = channel === 'local'
    if (useLocal && !isLocalJudgeable) { setNotice(t('localJudge.functionNotice') ?? 'function 模板题不适用'); return }
    if (useLocal && localReachable === false) { setNotice(t('localJudge.offline') ?? '未连接本地 Judge0'); return }
    const res = await submit(code, language, cases, question.runtime_config, 'stdio', {
      judgeSource: useLocal ? 'local' : 'central', tolerant: useLocal,
    })
    if (res) onSaveResult?.({ code, language, allPassed: res.allPassed })
  }
  const run = () => doRun(testCases)
  const runCustom = () => {
    if (!customInput.trim()) { setNotice('请输入自定义 stdin'); return }
    doRun([{ input: customInput, expected: '' }])
  }

  const tabBtn = (v: Tab, label: string, icon: React.ReactNode) => (
    <button key={v} type="button" onClick={() => setTab(v)} className={cn(
      'flex items-center gap-1.5 px-3 h-10 text-sm font-medium border-b-2 transition-colors',
      tab === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
    )}>{icon}{label}</button>
  )

  return (
    <div ref={rootRef} className="rounded-xl border bg-card overflow-hidden" style={{ height: 640 }}>
      <div className="flex h-full w-full select-none">
        {/* 左:题目面板 */}
        <div className="min-w-0 flex flex-col border-r" style={{ width: `${leftPct}%` }}>
          <div className="flex items-center border-b px-1 gap-1 shrink-0">
            {tabBtn('desc', '题目描述', <BookOpen className="h-3.5 w-3.5" />)}
            {tabBtn('solution', '题解', <Terminal className="h-3.5 w-3.5" />)}
            {tabBtn('records', '提交记录', <History className="h-3.5 w-3.5" />)}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'desc' ? (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-emerald-500/50 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">简单</span>
                    {question.subject && <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">{question.subject}</span>}
                    {question.category && <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">{question.category}</span>}
                  </div>
                </div>
                <MarkdownRenderer content={question.question_text} />
                {examples.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">示例</p>
                    {examples.map((ex, i) => (
                      <div key={i} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1.5">
                        <p className="font-semibold text-muted-foreground">示例 {i + 1}</p>
                        <p className="text-muted-foreground font-medium">输入：<code className="ml-1 text-zinc-200">{ex.input}</code></p>
                        <p className="text-muted-foreground font-medium">输出：<code className="ml-1 text-emerald-400">{ex.expected}</code></p>
                        {ex.explanation && <p className="text-muted-foreground">解释：{ex.explanation}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tab === 'solution' ? (
              <p className="text-sm text-muted-foreground">题解解析待补充。</p>
            ) : (
              <p className="text-sm text-muted-foreground">提交记录功能规划中(Phase 4)。</p>
            )}
          </div>
        </div>

        {/* 拖拽分割线 */}
        <div
          onPointerDown={onPointerDown}
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors flex items-center justify-center"
          title="拖拽调整宽度"
        >
          <GripVertical className="h-4 w-2.5 text-muted-foreground" />
        </div>

        {/* 右:编辑器 + 判题 */}
        <div className="min-w-0 flex-1 flex flex-col bg-muted/30">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Terminal className="h-3.5 w-3.5" />代码</span>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger size="sm" className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={clearResults} className="p-1 text-muted-foreground hover:text-foreground" title="清空"><RotateCcw className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-2 gap-1">
            <CodeEditorCM value={code} onChange={setCode} language={language} minHeight="280px" onCursor={(line, col) => setCursor({ line, col })} />
            <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground shrink-0">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />已存储</span>
              <span className="tabular-nums">行 {cursor.line},列 {cursor.col}</span>
            </div>
          </div>
          {/* 判题通道 + 运行 + 结果 */}
          <div className="border-t border-border p-2 space-y-1.5 shrink-0">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">判题通道:</span>
              <button type="button" onClick={() => selectChannel('local')} className={cn('rounded-full border px-2 py-0.5 transition-colors', channel === 'local' ? 'border-teal-500/60 bg-teal-500/10 text-teal-600 dark:text-teal-400' : 'border-border text-muted-foreground hover:bg-muted')}>本地自测</button>
              <button type="button" onClick={() => selectChannel('central')} className={cn('rounded-full border px-2 py-0.5 transition-colors', channel === 'central' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>平台判题</button>
              {channel === 'central' && (platformChecking ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />探测延迟…</span> : platformLatency != null ? <span className="text-emerald-600 dark:text-emerald-400">延迟 {platformLatency}ms</span> : <span className="text-red-500">平台节点不可达</span>)}
              {channel === 'local' && localReachable === false && <span className="text-red-500">{t('localJudge.offline') ?? '本地 Judge0 未启动'}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={run} disabled={loading || !code.trim()} className="gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? '判题中…' : '运行'}
              </Button>
              <details className="flex-1 min-w-0 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">自定义输入自测</summary>
                <div className="mt-1.5 flex gap-1.5">
                  <Textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="输入自定义 stdin(多行用回车)"
                    rows={2}
                    className="font-mono text-xs min-h-[2rem] resize-y border-input"
                    spellCheck={false}
                  />
                  <Button variant="outline" size="sm" onClick={runCustom} disabled={loading} className="shrink-0 h-auto">自测</Button>
                </div>
              </details>
              {notice && <span className="flex items-center gap-1 text-xs text-red-500"><TriangleAlert className="h-3 w-3" />{notice}</span>}
            </div>
            <CodeResult results={results} status={judgeStatus} testCasesCount={testCases.length} />
            {testCases.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('practice.codeEditor.testCases') ?? '测试点'}({testCases.length})</summary>
                <div className="mt-1.5 space-y-1">
                  {testCases.map((tc, i) => (
                    <div key={i} className="rounded border border-border bg-muted/40 p-1.5">
                      <div className="flex gap-1.5"><span className="text-muted-foreground w-4 shrink-0">#{i + 1}</span><span className="text-muted-foreground shrink-0">输入</span><WhitespaceBlock text={tc.input || '(空)'} className="text-foreground" dim={false} /></div>
                      <div className="flex gap-1.5 pl-5"><span className="text-muted-foreground shrink-0">期望</span><WhitespaceBlock text={tc.expected || '(空)'} className="text-emerald-600 dark:text-emerald-400" dim={false} /></div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
