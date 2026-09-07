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
import { QuestionTags } from '@/components/questions/QuestionTags'
import { Icon } from '@/lib/icons'
import { useCodeSubmission } from '@/hooks/use-code-submission'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { isJudge0Reachable, JUDGE0_DEFAULT_URL, JUDGE0_PLATFORM_URL, measureJudge0Latency } from '@/lib/judge0'
import { Play, Loader2, TriangleAlert, Terminal, BookOpen, History, RotateCcw, Plus } from 'lucide-react'
import type { Question, TestCase, ExampleCase, CodingAnswer, SubmissionResult } from '@/types'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript', icon: 'vscode-icons:file-type-js-official' },
  { value: 'typescript', label: 'TypeScript', icon: 'vscode-icons:file-type-typescript-official' },
  { value: 'python', label: 'Python', icon: 'vscode-icons:file-type-python' },
  { value: 'cpp', label: 'C++', icon: 'vscode-icons:file-type-cpp3' },
  { value: 'java', label: 'Java', icon: 'vscode-icons:file-type-java' },
]

type Tab = 'desc' | 'solution' | 'records'

interface Record {
  id: string
  status: string
  language: string
  execution_time_ms: number | null
  created_at: string
}

interface Props {
  question: Question
  onSaveResult?: (answer: CodingAnswer) => void
  attemptCount?: number
  wrongCount?: number
}

export function CodingIdeView({ question, onSaveResult, attemptCount, wrongCount }: Props) {
  const { t } = useT()
  const isLocalJudgeable = (question.execution_mode ?? 'stdio') !== 'function'
  const { submit, loading, results, judgeStatus, clearResults } = useCodeSubmission(question.id)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')
  const [tab, setTab] = useState<Tab>('desc')
  const [channel, setChannel] = useState<'local' | 'central'>(isLocalJudgeable ? 'local' : 'central')
  const [localReachable, setLocalReachable] = useState<boolean | null>(null)
  const [platformLatency, setPlatformLatency] = useState<number | null>(null)
  const [platformChecking, setPlatformChecking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [records, setRecords] = useState<Record[] | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [customExpected, setCustomExpected] = useState('')
  const [leftPct, setLeftPct] = useState(46)
  const [rowLeft, setRowLeft] = useState(50) // 左栏上下分隔(%)
  const [rowRight, setRowRight] = useState(55) // 右栏编辑/判题分隔(%)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ dir: 'col' | 'rowL' | 'rowR' } | null>(null)
  const [activeCase, setActiveCase] = useState(0) // 选中的测试用例索引
  const [customOn, setCustomOn] = useState(false) // "+"克隆自定义编辑态
  const [runMode, setRunMode] = useState<'all' | 'single' | null>(null) // 最近一次判题模式(全量/单测),用于 Case 胶囊着色与结果回显
  const [singleIndex, setSingleIndex] = useState<number | null>(null) // 单测的目标用例索引

  const testCases = (question.test_cases ?? []) as TestCase[]
  const examples = (question.examples ?? []) as ExampleCase[]
  const user = useAuthStore((s) => s.user)

  const loadRecords = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('submissions')
        .select('id,status,language,execution_time_ms,created_at')
        .eq('user_id', user.id)
        .eq('question_id', question.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setRecords((data ?? []) as Record[])
    } catch { /* noop */ }
  }, [user, question.id])

  // 判题通道切换:选中平台通道时顺带探测浏览器→平台延迟
  const selectChannel = useCallback((c: 'local' | 'central') => {
    setChannel(c); setNotice(null)
    if (c === 'central') {
      setPlatformChecking(true); setPlatformLatency(null)
      measureJudge0Latency(JUDGE0_PLATFORM_URL).then((ms) => { setPlatformLatency(ms); setPlatformChecking(false) })
    }
  }, [])

  useEffect(() => {
    if (!isLocalJudgeable) return
    let cancelled = false
    isJudge0Reachable(JUDGE0_DEFAULT_URL).then((ok) => {
      if (cancelled) return
      setLocalReachable(ok)
      if (!ok) selectChannel('central') // 本地 Judge0 离线时自动落到平台判题
    })
    return () => { cancelled = true }
  }, [isLocalJudgeable, selectChannel])

  // 拖拽分割(横向整体宽度 + 左右两栏内部上下分隔)
  const onPointerDown = useCallback((e: React.PointerEvent, dir: 'col' | 'rowL' | 'rowR') => {
    e.preventDefault()
    draggingRef.current = { dir }
    const move = (ev: PointerEvent) => {
      const root = rootRef.current
      if (!root || !draggingRef.current) return
      const rect = root.getBoundingClientRect()
      const d = draggingRef.current.dir
      if (d === 'col') {
        const p = ((ev.clientX - rect.left) / rect.width) * 100
        setLeftPct(Math.min(72, Math.max(26, p)))
      } else if (d === 'rowL') {
        const p = ((ev.clientY - rect.top) / rect.height) * 100
        setRowLeft(Math.min(85, Math.max(25, p)))
      } else {
        const p = ((ev.clientY - rect.top) / rect.height) * 100
        setRowRight(Math.min(90, Math.max(30, p)))
      }
    }
    const up = () => {
      draggingRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const doRun = async (cases: TestCase[], mode: 'all' | 'single' | 'custom') => {
    if (!code.trim()) { setNotice(t('codeEditor.pleaseWriteCode') ?? '请先编写代码'); return }
    setNotice(null); clearResults()
    setRunMode(mode === 'custom' ? null : mode)
    const useLocal = channel === 'local'
    if (useLocal && !isLocalJudgeable) { setNotice(t('localJudge.functionNotice') ?? 'function 模板题不适用'); return }
    if (useLocal && localReachable === false) { setNotice(t('localJudge.offlineShort') ?? '未连接本地 Judge0'); return }
    const res = await submit(code, language, cases, question.runtime_config, 'stdio', {
      judgeSource: useLocal ? 'local' : 'central', tolerant: useLocal,
    })
    if (res) { onSaveResult?.({ code, language, allPassed: res.allPassed }); loadRecords() }
  }
  const run = () => doRun(testCases, 'all')
  const runSingle = (i: number) => { setSingleIndex(i); doRun([testCases[i]], 'single') }
  const addCustom = () => {
    // "+"克隆当前选中的测试用例为自定义编辑
    const src = testCases[activeCase] || { input: '', expected: '' }
    setCustomInput(src.input); setCustomExpected(src.expected); setCustomOn(true)
  }
  const runCustom = () => {
    if (!customInput.trim() && !customExpected.trim()) { setNotice(t('codeEditor.customInputRequired') ?? '请输入自定义 stdin 或期望'); return }
    doRun([{ input: customInput, expected: customExpected }], 'custom')
  }
  const clearRun = () => { clearResults(); setRunMode(null); setSingleIndex(null) }

  const switchTab = (v: Tab) => { setTab(v); if (v === 'records') loadRecords() }

  // 提交记录状态文案
  const recordLabel = (s: string) => {
    switch (s) {
      case 'accepted': return t('localJudge.status_accepted') ?? '通过'
      case 'wrong_answer': return t('localJudge.status_wrong_answer') ?? '答案错误'
      case 'timeout': return t('localJudge.status_timeout') ?? '超时'
      case 'compile_error': return t('localJudge.status_compile_error') ?? '编译错误'
      case 'runtime_error': return t('localJudge.status_runtime_error') ?? '运行错误'
      default: return s
    }
  }

  // Case 胶囊:判题后按结果着色(通过绿/失败红/进行中琥珀),选中态以主色描边区分
  const casePill = (i: number) => {
    let r: SubmissionResult | undefined
    if (results && runMode === 'all') r = results.find((x) => x.testCaseIndex === i)
    else if (results && runMode === 'single' && singleIndex === i) r = results[0]
    const active = activeCase === i && !customOn
    const base = 'shrink-0 rounded-full border px-3.5 py-1 text-sm font-medium transition-colors'
    if (!r) {
      const waiting = loading && (runMode === 'all' || (runMode === 'single' && singleIndex === i))
      if (waiting) return cn(base, active ? 'border-amber-500/70 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-amber-500/40 text-amber-600/80 hover:bg-muted')
      return cn(base, active ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')
    }
    const busy = r.status === 'pending' || r.status === 'running'
    if (busy) return cn(base, active ? 'border-amber-500/70 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-amber-500/40 text-amber-600/80 hover:bg-muted')
    if (r.passed) return cn(base, active ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 hover:bg-muted')
    return cn(base, active ? 'border-red-500/70 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-red-500/50 text-red-500 hover:bg-muted')
  }

  const tabBtn = (v: Tab, label: string, icon: React.ReactNode) => (
    <button key={v} type="button" onClick={() => switchTab(v)} className={cn(
      'flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
      tab === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
    )}>{icon}{label}</button>
  )

  return (
    <div ref={rootRef} className="overflow-hidden" style={{ height: 700 }}>
      <div className="flex h-full w-full select-none">
        {/* ============ 左列 ============ */}
        <div className="min-w-0 flex flex-col border-r" style={{ width: `${leftPct}%` }}>
          {/* 上:题目(tab: 题目描述/题解/提交记录) */}
          <div className="flex flex-col min-h-0" style={{ height: `${rowLeft}%` }}>
            <div className="flex items-center border-b px-1 gap-1 shrink-0">
              {tabBtn('desc', t('practice.ide.descTab') ?? '题目描述', <BookOpen className="h-3 w-3" />)}
              {tabBtn('solution', t('practice.ide.solutionTab') ?? '题解', <Terminal className="h-3 w-3" />)}
              {tabBtn('records', t('practice.ide.recordsTab') ?? '提交记录', <History className="h-3 w-3" />)}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {tab === 'desc' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <QuestionTags question={question} attemptCount={attemptCount} wrongCount={wrongCount} />
                  </div>
                  <div className="border-t border-border/60" />
                  <MarkdownRenderer content={question.question_text} />
                </div>
              ) : tab === 'solution' ? (
                question.analysis || question.answer_explanation ? (
                  <div className="space-y-3">
                    {question.analysis && <MarkdownRenderer content={question.analysis} />}
                    {question.answer_explanation && question.analysis !== question.answer_explanation && <MarkdownRenderer content={question.answer_explanation} />}
                  </div>
                ) : <p className="text-sm text-muted-foreground">{t('practice.ide.noSolution') ?? '本题暂无题解解析。'}</p>
              ) : (
                <div className="space-y-1.5">
                  {!records || records.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('practice.ide.noRecords') ?? '还没有提交记录。'}</p>
                  ) : (
                    records.map((r) => {
                      const ok = r.status === 'accepted'
                      const color = ok ? 'text-emerald-600 dark:text-emerald-400' : r.status === 'runtime_error' || r.status === 'timeout' || r.status === 'compile_error' ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
                      return (
                        <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
                          <span className={cn('font-medium', color)}>{recordLabel(r.status)}</span><span className="text-muted-foreground">{r.language}</span>
                          {r.execution_time_ms != null && <span className="ml-auto text-muted-foreground tabular-nums">{r.execution_time_ms}ms</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          {/* 左栏上下分隔(题目/示例) */}
          <div onPointerDown={(e) => onPointerDown(e, 'rowL')} className="shrink-0 cursor-row-resize bg-border hover:bg-primary/40 h-1 w-full" title={t('codeEditor.resizeV') ?? '拖拽调整高度'} />
          {/* 下:示例 */}
          <div className="flex flex-col min-h-0 flex-1 overflow-y-auto p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t('codeEditor.examples') ?? '示例'}</p>
            {examples.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('codeEditor.noExamples') ?? '无示例。'}</p>
            ) : (
              <div className="space-y-2">
                {examples.map((ex, i) => (
                  <div key={i} className="rounded-lg border bg-muted/20 p-2.5 text-xs space-y-1">
                    <p className="font-semibold text-muted-foreground">{t('codeEditor.example') ?? '示例'} {i + 1}</p>
                    <p className="text-muted-foreground">{t('codeEditor.input') ?? '输入'}：<code className="ml-1 font-mono text-foreground">{ex.input}</code></p>
                    <p className="text-muted-foreground">{t('codeEditor.output') ?? '输出'}：<code className="ml-1 font-mono text-emerald-600 dark:text-emerald-400">{ex.expected}</code></p>
                    {ex.explanation && <p className="text-muted-foreground">{t('codeEditor.explanation') ?? '解释'}：{ex.explanation}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 纵向分割线 */}
        <div onPointerDown={(e) => onPointerDown(e, 'col')} className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50" title={t('codeEditor.resizeH') ?? '拖拽调整宽度'} />

        {/* ============ 右列 ============ */}
        <div className="min-w-0 flex-1 flex flex-col bg-muted/20">
          {/* 上:代码编辑 */}
          <div className="flex flex-col min-h-0" style={{ height: `${rowRight}%` }}>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Terminal className="h-3.5 w-3.5" />{t('codeEditor.code') ?? '代码'}</span>
              <Icon icon={LANGUAGES.find((l) => l.value === language)?.icon ?? LANGUAGES[0].icon} className="h-4 w-4 shrink-0" />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger size="sm" className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={clearRun} className="p-1 text-muted-foreground hover:text-foreground" title={t('codeEditor.clear') ?? '清空'}><RotateCcw className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              <CodeEditorCM value={code} onChange={setCode} language={language} minHeight="240px" onCursor={(line, col) => setCursor({ line, col })} />
            </div>
            {/* 编辑区右下角工具条:保存状态 + 判题通道 + 运行 */}
            <div className="shrink-0 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border bg-background/60 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('codeEditor.saved') ?? '已存储'}</span>
              <span className="hidden lg:inline text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{t('codeEditor.line') ?? '行'} {cursor.line},{t('codeEditor.col') ?? '列'} {cursor.col}</span>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1.5">
                {/* 本地自测:Judge0 可达才可选(绿框),否则禁用 */}
                <button type="button" onClick={() => selectChannel('local')} disabled={!isLocalJudgeable || localReachable !== true}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                    isLocalJudgeable && localReachable === true
                      ? channel === 'local'
                        ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 hover:bg-muted'
                      : 'border-border text-muted-foreground',
                  )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isLocalJudgeable && localReachable === true ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                  {t('localJudge.enableShort') ?? '本地自测'}
                </button>
                <button type="button" onClick={() => selectChannel('central')}
                  className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
                    channel === 'central' ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {t('localJudge.central') ?? '平台判题'}
                </button>
                {channel === 'central' ? (
                  platformChecking ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap"><Loader2 className="h-3 w-3 animate-spin" />{t('localJudge.probing') ?? '探测中…'}</span>
                  ) : platformLatency != null ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">{(t('localJudge.latency') ?? '延迟 {n}ms').replace('{n}', String(platformLatency))}</span>
                  ) : (
                    <span className="text-[11px] text-red-500 whitespace-nowrap">{t('localJudge.unreachable') ?? '平台节点不可达'}</span>
                  )
                ) : (
                  localReachable === null && isLocalJudgeable ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap"><Loader2 className="h-3 w-3 animate-spin" />{t('localJudge.probing') ?? '探测中…'}</span>
                  ) : localReachable === false && (
                    <span className="text-[11px] text-red-500 whitespace-nowrap">{t('localJudge.offlineShort') ?? '未连接本地 Judge0'}</span>
                  )
                )}
                {notice && <span className="inline-flex items-center gap-1 text-[11px] text-red-500"><TriangleAlert className="h-3 w-3 shrink-0" />{notice}</span>}
                <Button onClick={run} size="sm" disabled={loading || !code.trim() || (channel === 'local' && localReachable !== true)} className="gap-1.5 h-8 shrink-0">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {loading ? (t('codeEditor.judging') ?? '判题中…') : (t('codeEditor.runShort') ?? '运行')}
                </Button>
              </div>
            </div>
          </div>
          {/* 横向分隔(右列上下) */}
          <div onPointerDown={(e) => onPointerDown(e, 'rowR')} className="shrink-0 cursor-row-resize bg-border hover:bg-primary/40 h-1 w-full" title={t('codeEditor.resizeV') ?? '拖拽调整高度'} />
          {/* 下:判题/测试 */}
          <div className="flex-1 min-h-0 flex flex-col border-t border-border">
            {/* 测试用例 tab 行 */}
            <div className="flex items-center gap-1.5 px-2 py-2 overflow-x-auto shrink-0">
              {testCases.map((_, i) => (
                <button key={i} type="button" onClick={() => { setActiveCase(i); setCustomOn(false) }} className={casePill(i)}>
                  Case {i + 1}
                </button>
              ))}
              {/* "+":克隆当前选中为自定义 */}
              <button type="button" onClick={addCustom} className={cn('shrink-0 inline-flex items-center gap-1 rounded-full border px-3.5 py-1 text-sm font-medium', customOn ? 'border-teal-500/60 bg-teal-500/10 text-teal-600 dark:text-teal-400' : 'border-border text-muted-foreground hover:bg-muted')}><Plus className="h-4 w-4" />{t('codeEditor.custom') ?? '自定义'}</button>
            </div>
            {/* 选中用例展示 + 结果 */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {!customOn && testCases[activeCase] ? (
                <div className="rounded-md border border-border bg-background/60 p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-muted-foreground">Case {activeCase + 1}</span>
                    <Button variant="outline" size="sm" className="h-6 gap-1" onClick={() => runSingle(activeCase)} disabled={loading}>
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}{t('codeEditor.singleTest') ?? '单测此例'}
                    </Button>
                  </div>
                  <p className="text-muted-foreground">{t('codeEditor.input') ?? '输入'}</p><WhitespaceBlock text={testCases[activeCase].input || (t('codeEditor.emptyMark') ?? '(空)')} className="text-foreground" dim={false} />
                  <p className="text-muted-foreground pt-0.5">{t('codeEditor.expected') ?? '期望'}</p><WhitespaceBlock text={testCases[activeCase].expected || (t('codeEditor.emptyMark') ?? '(空)')} className="text-emerald-600 dark:text-emerald-400" dim={false} />
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background/60 p-2 text-xs space-y-1.5">
                  <p className="font-semibold text-muted-foreground">{(t('codeEditor.customNote') ?? '自定义输入自测(由选中的 Case {n} 克隆,可改)').replace('{n}', String(activeCase + 1))}</p>
                  <Textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} rows={2} placeholder={t('codeEditor.stdinPlaceholder') ?? 'stdin(多行用回车)'} className="font-mono text-xs min-h-[2rem] resize-y border-input" spellCheck={false} />
                  <Textarea value={customExpected} onChange={(e) => setCustomExpected(e.target.value)} rows={2} placeholder={t('codeEditor.expectedPlaceholder') ?? '期望输出(可选)'} className="font-mono text-xs min-h-[2rem] resize-y border-input" spellCheck={false} />
                  <Button variant="outline" size="sm" className="gap-1" onClick={runCustom} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}{t('codeEditor.selfTest') ?? '自测'}
                  </Button>
                </div>
              )}
              {/* 执行动画:判题中光带 */}
              {loading && (
                <div className="relative h-1 overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 w-1/3 rounded-full bg-emerald-500 animate-[ideprog_1s_ease-in-out_infinite]" />
                </div>
              )}
              <CodeResult
                results={results}
                status={judgeStatus}
                testCasesCount={runMode === 'all' ? testCases.length : undefined}
                singleCaseIndex={runMode === 'single' && singleIndex != null ? singleIndex : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
