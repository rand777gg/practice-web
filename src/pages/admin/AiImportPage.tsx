import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { AiImportUpload } from '@/components/ai-import/AiImportUpload'
import { AiImportPreview } from '@/components/ai-import/AiImportPreview'
import { Spinner } from '@/components/ui/spinner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PdfMarkdownViewer } from '@/components/ai-import/PdfMarkdownViewer'
import {
  DeepSeekParser, MinerUClient, getAiConfig, hasAiConfig,
  getMinerUToken, setMinerUToken, getMinerUModelVersion, setMinerUModelVersion,
  generateQuestions, generateFromText,
} from '@/lib/ai'
import { extractFileText } from '@/lib/file-text'
import { getPrompt, setPrompt, resetPrompt } from '@/stores/prompt-store'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import type { ParsedQuestion, MinerUModelVersion } from '@/lib/ai/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { ArrowLeft, ArrowRight, Check, CheckCircle, AlertCircle, ChevronDown, Clock, Play, Trash2, Upload, X } from 'lucide-react'

type Step = 'upload' | 'parsing' | 'metadata' | 'preview' | 'importing' | 'done'
type ParseMode = 'lightweight' | 'precision' | 'generate'

export function Component() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [parseMsg, setParseMsg] = useState('')
  const [parseStatus, setParseStatus] = useState<Record<string, unknown> | null>(null)
  const [importCount, setImportCount] = useState(0)
  const [error, setError] = useState('')
  const [existingSubjects, setExistingSubjects] = useState<string[]>([])
  const [existingCategories, setExistingCategories] = useState<string[]>([])

  // MinerU precision parsing settings
  const [parseMode, setParseMode] = useState<ParseMode>('lightweight')
  const [modelVersion, setModelVersion] = useState<MinerUModelVersion>(getMinerUModelVersion())
  const [mineruToken, setMineruTokenState] = useState(getMinerUToken())
  const [enableOcr, setEnableOcr] = useState(false)
  const [enableFormula, setEnableFormula] = useState(true)
  const [enableTable, setEnableTable] = useState(true)
  const [batchMode, setBatchMode] = useState(false)
  const [useR2Upload, setUseR2Upload] = useState(true)
  const [manualPdfUrl, setManualPdfUrl] = useState('')
  const [r2Pdfs, setR2Pdfs] = useState<{ key: string; url: string; size: number }[]>([])
  const [pageRanges, setPageRanges] = useState('')
  const [extraFormats, setExtraFormats] = useState<string[]>([])

  // Load existing PDFs from R2
  useEffect(() => {
    supabase.functions.invoke('r2-list', { body: { prefix: 'pdf/' } })
      .then(({ data }) => { if (data?.files) setR2Pdfs(data.files) })
      .catch(() => {})
  }, [])

  const [noCache, setNoCache] = useState(false)
  const [cacheTolerance, setCacheTolerance] = useState('')
  const [dataId, setDataId] = useState('')

  // AI Generate state
  const [genSubject, setGenSubject] = useState('')
  const [genTypes, setGenTypes] = useState<Set<string>>(new Set(['single_choice']))
  const [genCount, setGenCount] = useState(5)
  const [genTopic, setGenTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genFile, setGenFile] = useState<File | null>(null)
  const [genFileText, setGenFileText] = useState('')
  const [extracting, setExtracting] = useState(false)

  // Manual import state

  // Custom prompts
  const [extractPrompt, setExtractPrompt] = useState(() => getPrompt('extract'))
  const [generateDocPrompt, setGenerateDocPrompt] = useState(() => getPrompt('generate_doc'))
  const basePromptRef = useRef(generateDocPrompt)

  const { isEnabled, setSidebarCollapsed } = useSettingsStore()
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<{ id: number; file_name: string; markdown: string; json_data: string | null; questions_json: string | null; status_json: string | null; page_ranges: string | null; pdf_total_pages: number | null; mode: string; created_at: string }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [dedupHistoryIds, setDedupHistoryIds] = useState<Set<number>>(new Set())

  // Inject dedup context into prompt when selection changes
  useEffect(() => {
    const dedupRecords = history.filter((h) => dedupHistoryIds.has(h.id) && h.questions_json)
    if (dedupRecords.length === 0) {
      setGenerateDocPrompt(basePromptRef.current)
      return
    }
    const dedupText = `\n\n⚠️ 重要：以下是你之前根据相同资料生成过的题目，请务必避免重复，不要生成与以下题目相同或高度相似的题目：\n${
      dedupRecords.map((h, i) => `【历史记录${i + 1}】${h.questions_json}`).join('\n')
    }`
    setGenerateDocPrompt(basePromptRef.current + dedupText)
  }, [dedupHistoryIds, history])

  const user = useAuthStore((s) => s.user)

  const loadHistoryList = async () => {
    if (!user) return
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('parse_history')
      .select('id, file_name, markdown, json_data, questions_json, status_json, page_ranges, pdf_total_pages, mode, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('loadHistoryList error:', error)
      setHistoryError(error.message || '加载失败')
    }
    setHistory(data ?? [])
    setHistoryLoading(false)
  }

  const saveToHistory = async (record: { fileName: string; markdown: string; jsonData?: string; questions?: ParsedQuestion[]; mode: string; pageRanges?: string; extraFormats?: string[]; pdfTotalPages?: number }) => {
    if (!user) return
    await supabase.from('parse_history').insert({
      user_id: user.id,
      file_name: record.fileName,
      markdown: record.markdown,
      json_data: record.jsonData || null,
      questions_json: record.questions ? JSON.stringify(record.questions) : null,
      mode: record.mode,
      status_json: parseStatus ? JSON.stringify(parseStatus) : null,
      page_ranges: record.pageRanges || null,
      extra_formats: record.extraFormats?.length ? JSON.stringify(record.extraFormats) : null,
      pdf_total_pages: record.pdfTotalPages || null,
    })
  }

  const loadHistory = async (id: number) => {
    const entry = history.find(h => h.id === id)
    if (entry) {
      setParseResult({ markdown: entry.markdown, fileName: entry.file_name, jsonData: entry.json_data || undefined })
      if (entry.questions_json) {
        try { setQuestions(JSON.parse(entry.questions_json)) } catch { /* ignore */ }
      }
      if (entry.page_ranges) setPageRanges(entry.page_ranges)
      if (entry.mode === 'precision' || entry.mode === 'lightweight' || entry.mode === 'generate') {
        setParseMode(entry.mode)
      }
      if (entry.status_json) {
        try { setParseStatus(JSON.parse(entry.status_json)) } catch { /* ignore */ }
      } else {
        setParseStatus(null)
      }
      setShowHistory(false)
      // If questions were already generated, go straight to preview
      if (entry.questions_json) {
        setStep('preview')
      } else {
        setParseMsg('已从历史记录加载')
        setParsingDone(true)
        setStep('parsing')
      }
    }
  }

  const deleteHistory = async (id: number) => {
    await supabase.from('parse_history').delete().eq('id', id)
    setHistory(prev => prev.filter(h => h.id !== id))
  }

  const aiConfigured = hasAiConfig()
  const precisionReady = parseMode === 'lightweight' || (parseMode === 'precision' && !!mineruToken)
  const genReady = parseMode === 'generate' && !!genSubject && genTypes.size > 0 && aiConfigured
  const canStart = parseMode === 'generate'
    ? genReady
    : !!manualPdfUrl && precisionReady
      ? true
      : parseMode === 'precision'
        ? (batchMode ? files.length > 0 : !!file) && aiConfigured && precisionReady
        : !!file && aiConfigured

  useEffect(() => {
    async function loadMeta() {
      const { data } = await supabase.from('questions').select('subject, category')
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setExistingSubjects([...subs].sort())
      setExistingCategories([...cats].sort())
    }
    loadMeta()
  }, [])

  useEffect(() => {
    if (user) loadHistoryList()
  }, [user?.id])

  const handleFile = (f: File) => { setFile(f); setFiles([]) }
  const handleFiles = (fs: File[]) => { setFiles(fs); setFile(null) }

  const handleTokenChange = (token: string) => {
    setMineruTokenState(token)
    setMinerUToken(token)
  }

  const handleModelChange = (model: MinerUModelVersion) => {
    setModelVersion(model)
    setMinerUModelVersion(model)
  }

  const startParse = async () => {
    setStep('parsing')
    setError('')
    setParseResult(null)
    setParsingDone(false)
    setParsePage(0)
    setQuestions([])
    setParseStatus({ state: 'connecting' })

    try {
      if (manualPdfUrl) {
        await runUrlParse()
      } else if (parseMode === 'precision') {
        await runPrecisionParse()
      } else {
        await runLightweightParse()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
      setStep('upload')
    }
  }

  const runUrlParse = async () => {
    const mineru = new MinerUClient()
    const options = {
      token: mineruToken,
      modelVersion,
      isOcr: enableOcr,
      enableFormula,
      enableTable,
      language: 'ch',
      pageRanges: pageRanges || undefined,
      extraFormats: extraFormats.length > 0 ? extraFormats : undefined,
      noCache: noCache || undefined,
      cacheTolerance: cacheTolerance ? Number(cacheTolerance) : undefined,
    }
    setParseMsg('正在创建解析任务...')
    const task = await mineru.createTask(manualPdfUrl, options)
    setParseStatus({ ...task, state: 'running' } as unknown as Record<string, unknown>)

    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const pollResult = await mineru.pollTask(task.taskId, options.token)
      setParseStatus(pollResult as unknown as Record<string, unknown>)
      if (pollResult.state === 'done' && pollResult.fullZipUrl) {
        setParseMsg('正在提取解析结果...')
        const { fetchZipAndExtractFiles } = await import('@/lib/ai/mineru')
        const { markdown, jsonData } = await fetchZipAndExtractFiles(pollResult.fullZipUrl)
        setParseResult({ markdown, fileName: manualPdfUrl.split('/').pop() || 'document', jsonData })
        setParsingDone(true)
        saveToHistory({ fileName: manualPdfUrl.split('/').pop() || 'document', markdown, jsonData, mode: 'precision', pageRanges: pageRanges || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (pollResult as any)?.extractProgress?.totalPages })
        return
      }
      if (pollResult.state === 'failed') throw new Error(`解析失败: ${(pollResult as any).errMsg}`)
      if (i % 5 === 0) setParseMsg(`精准解析中... ${pollResult.state}`)
    }
    throw new Error('解析超时')
  }

  const runLightweightParse = async () => {
    if (!file) return
    const mineru = new MinerUClient()
    const result = await mineru.uploadAndParse(file, { pageRanges: pageRanges || undefined }, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
    setParseResult(result)
    setParsingDone(true)
    saveToHistory({ fileName: file!.name, markdown: result.markdown, jsonData: result.jsonData, mode: 'lightweight', pageRanges: pageRanges || undefined, pdfTotalPages: (parseStatus as any)?.extractProgress?.totalPages })
  }

  const runPrecisionParse = async () => {
    const mineru = new MinerUClient()
    const options = {
      token: mineruToken,
      modelVersion,
      isOcr: enableOcr,
      enableFormula,
      enableTable,
      language: 'ch',
      pageRanges: pageRanges || undefined,
      extraFormats: extraFormats.length > 0 ? extraFormats : undefined,
      noCache: noCache || undefined,
      cacheTolerance: cacheTolerance ? Number(cacheTolerance) : undefined,
      dataId: dataId || undefined,
    }

    if (batchMode && files.length > 0) {
      const results = await mineru.uploadAndParseBatchPrecision(files, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      if (results.length === 0) {
        setError('所有文件解析失败')
        setStep('upload')
        return
      }
      const mergedMd = results.map(r => `## ${r.fileName}\n\n${r.markdown}`).join('\n\n---\n\n')
      setParseResult({ markdown: mergedMd, fileName: files.map(f => f.name).join(', '), jsonData: results[0]?.jsonData })
      setParsingDone(true)
      saveToHistory({ fileName: files.map(f => f.name).join(', '), markdown: mergedMd, jsonData: results[0]?.jsonData, mode: 'precision', pageRanges: pageRanges || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (parseStatus as any)?.extractProgress?.totalPages })
    } else if (file) {
      const result = useR2Upload
        ? await mineru.uploadAndParsePrecisionR2(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
        : await mineru.uploadAndParsePrecision(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      setParseResult(result)
      setParsingDone(true)
      saveToHistory({ fileName: file.name, markdown: result.markdown, jsonData: result.jsonData, mode: 'precision', pageRanges: pageRanges || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (parseStatus as any)?.extractProgress?.totalPages })
    }
  }

  const [parseResult, setParseResult] = useState<{ markdown: string; fileName: string; jsonData?: string } | null>(null)
  const [parsingDone, setParsingDone] = useState(false)
  const [parsePage, setParsePage] = useState(0)
  const [showSplitView, setShowSplitView] = useState(false)
  const CHARS_PER_PAGE = 3000
  const pdfUrl = file ? URL.createObjectURL(file) : files.length > 0 ? URL.createObjectURL(files[0]) : null

  const extractQuestions = async (markdown: string) => {
    setParseMsg('AI 正在提取题目...')
    const parser = new DeepSeekParser(getAiConfig())
    const result = await parser.parseDocument(markdown, extractPrompt)

    setQuestions(result.questions)
    setSelectedIds(new Set(result.questions.map((_, i) => i)))
    setStep('preview')
    if (parseResult) {
      saveToHistory({ fileName: parseResult.fileName, markdown: parseResult.markdown, jsonData: parseResult.jsonData, questions: result.questions, mode: parseMode === 'lightweight' ? 'lightweight' : 'precision' })
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      let result
      if (genFileText) {
        result = await generateFromText({
          documentText: genFileText,
          subject: genSubject || undefined,
          questionTypes: [...genTypes],
          count: genCount,
        }, generateDocPrompt)
      } else {
        result = await generateQuestions({
          subject: genSubject,
          questionTypes: [...genTypes],
          count: genCount,
          topicDescription: genTopic || undefined,
        }, generateDocPrompt)
      }
      const questions = genTopic
        ? result.questions.map((q) => ({ ...q, key_points: genTopic }))
        : result.questions
      setQuestions(questions)
      setSelectedIds(new Set(questions.map((_, i) => i)))
      setSubject(genSubject)
      setCategory('AI生成')
      setStep('preview')
      if (genFile) {
        saveToHistory({ fileName: genFile.name, markdown: genFileText, questions, mode: 'generate' })
      } else {
        saveToHistory({ fileName: genSubject || '手动生成', markdown: genTopic || '', questions, mode: 'generate' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenFile = async (f: File) => {
    setGenFile(f)
    setExtracting(true)
    setError('')
    try {
      const text = await extractFileText(f)
      setGenFileText(text)
      // Auto-select history records with same file name for dedup
      const matched = history.filter((h) => h.file_name === f.name && h.questions_json)
      if (matched.length > 0) setDedupHistoryIds(new Set(matched.map((h) => h.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件读取失败')
      setGenFile(null)
    } finally {
      setExtracting(false)
    }
  }

  const startImport = async () => {
    setStep('importing')
    const toImport = questions.filter((_, i) => selectedIds.has(i))

    try {
      const { error: insertErr } = await supabase.from('questions').insert(
        toImport.map((q) => ({
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer as any,
          category: category ? (Array.isArray(category) ? category[0] : category) : null,
          categories: category ? (Array.isArray(category) ? category : [category]) : [],
          subject: subject || null,
          analysis: q.analysis?.trim() || null,
          key_points: q.key_points?.trim() || null,
          answer_explanation: null,
          seq_number: null,
          import_mode: parseMode,
        })),
      )

      if (insertErr) throw insertErr
      setImportCount(toImport.length)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
      setStep('preview')
    }
  }

  const toggleSelect = (i: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(questions.map((_, i) => i)))
    }
  }

  const changeQuestion = (i: number, q: ParsedQuestion) => {
    setQuestions((prev) => prev.map((p, idx) => idx === i ? q : p))
  }

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
    setSelectedIds((prev) => {
      const next = new Set<number>()
      for (const id of prev) {
        if (id < i) next.add(id)
        else if (id > i) next.add(id - 1)
      }
      return next
    })
  }

  const resetState = () => {
    setStep('upload')
    setFile(null)
    setFiles([])
    setQuestions([])
    setSubject('')
    setCategory('')
    setSelectedIds(new Set())
    setGenSubject('')
    setGenTypes(new Set(['single_choice']))
    setGenCount(5)
    setGenTopic('')
    setGenerating(false)
    setGenFile(null)
    setGenFileText('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/questions"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">AI 智能解析</h1>
        <Button variant="ghost" size="sm" className="gap-1 text-xs ml-auto" onClick={() => setShowHistory(!showHistory)}>
          <Clock className="h-3.5 w-3.5" />
          历史记录{history.length > 0 ? ` (${history.length})` : ''}
        </Button>
      </div>

      <div className={cn(
        'grid transition-all duration-300 ease-out',
        showHistory ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}>
        <div className="overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardContent className="py-3">
              {historyError ? (
                <p className="text-xs text-destructive text-center py-4">加载失败: {historyError}</p>
              ) : historyLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">加载中...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">暂无历史记录</p>
              ) : (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">文件名</TableHead>
                    <TableHead className="text-xs w-[72px]">模式</TableHead>
                    <TableHead className="text-xs w-[70px]">页码</TableHead>
                    <TableHead className="text-xs w-[52px]">题目</TableHead>
                    <TableHead className="text-xs w-[72px]">状态</TableHead>
                    <TableHead className="text-xs w-[130px]">时间</TableHead>
                    <TableHead className="text-xs w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => {
                    const qCount = h.questions_json ? (() => { try { return (JSON.parse(h.questions_json) as unknown[]).length } catch { return 0 } })() : 0
                    const statusText = h.status_json ? (() => { try { const s = JSON.parse(h.status_json); return stateLabel2(s.state) } catch { return '' } })() : ''
                    const statusColor = h.status_json ? (() => { try { const s = JSON.parse(h.status_json); return stateColor2(s.state) } catch { return 'text-muted-foreground' } })() : 'text-muted-foreground'
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs py-2">
                          <button type="button" className="text-left hover:underline underline-offset-2 font-medium max-w-[300px] truncate block" onClick={() => loadHistory(h.id)}>
                            {h.file_name}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">
                          {{lightweight: '轻量', precision: '精准', generate: '生成'}[h.mode] || h.mode}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground font-mono whitespace-nowrap">
                          {h.page_ranges ? `${h.page_ranges}` : '全部'}{h.pdf_total_pages ? ` / ${h.pdf_total_pages}页` : ''}
                        </TableCell>
                        <TableCell className="text-xs py-2 tabular-nums">
                          {qCount > 0 ? (
                            <button type="button" className="hover:underline underline-offset-2 font-medium text-primary" onClick={() => {
                              if (h.questions_json) {
                                try { setQuestions(JSON.parse(h.questions_json)) } catch { /* ignore */ }
                                setSelectedIds(new Set())
                                setStep('preview')
                                setShowHistory(false)
                              }
                            }}>
                              {qCount}
                            </button>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          {statusText ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor}`}>{statusText}</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(h.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <div className="flex items-center gap-0.5">
                            {h.json_data && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  sessionStorage.setItem('pdf_test_json', h.json_data!)
                                  sessionStorage.setItem('pdf_test_md', h.markdown)
                                  sessionStorage.removeItem('pdf_test_url')
                                  window.open('/admin/pdf-test', '_blank')
                                }}>
                                <Play className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteHistory(h.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {!aiConfigured && (
        <Card className="border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10">
          <CardContent className="py-3 text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            请在 EdgeOne 环境变量中配置 VITE_DEEPSEEK_API_KEY
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-6 space-y-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <>
              {/* Parse mode selection */}
              <Tabs value={parseMode} onValueChange={(v) => { setParseMode(v as ParseMode); if (v === 'lightweight') setBatchMode(false) }}>
                <TabsList>
                  <TabsTrigger value="lightweight">轻量解析</TabsTrigger>
                  {isEnabled('mineru') && (
                    <TabsTrigger value="precision">精准解析</TabsTrigger>
                  )}
                  <TabsTrigger value="generate">AI 生成</TabsTrigger>
                </TabsList>
              </Tabs>

              {parseMode === 'lightweight' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">单文件 ≤ 10MB、≤ 20 页，无需 Token。</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">指定页数</label>
                    <Input
                      placeholder="如: 1-10,15-20 (留空=全部)"
                      value={pageRanges}
                      onChange={(e) => setPageRanges(e.target.value)}
                      className="h-7 text-xs max-w-[220px]"
                    />
                  </div>
                </div>
              )}
              {parseMode === 'precision' && (
                <p className="text-xs text-muted-foreground">单文件 ≤ 200MB、≤ 200 页，批量最多 200 个文件。需配置 MinerU Token。</p>
              )}

              {/* Precision mode settings */}
              {parseMode === 'precision' && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div>
                    <label className="text-sm font-medium">MinerU Token</label>
                    <Input
                      type="password"
                      className="mt-1"
                      placeholder="输入 MinerU API Token"
                      value={mineruToken}
                      onChange={(e) => handleTokenChange(e.target.value)}
                    />
                    {!mineruToken && (
                      <p className="text-xs text-muted-foreground mt-1">
                        可在 MinerU API 管理页面创建 Token。也可通过 VITE_MINERU_TOKEN 环境变量配置。
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch
                        checked={batchMode}
                        onCheckedChange={(v) => { setBatchMode(v); setFile(null); setFiles([]) }}
                      />
                      <span className="text-xs">批量模式</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          模型版本: {modelVersion}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup value={modelVersion} onValueChange={(v) => handleModelChange(v as MinerUModelVersion)}>
                          <DropdownMenuRadioItem value="vlm">vlm</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="pipeline">pipeline</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="MinerU-HTML">MinerU-HTML</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          识别选项
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuCheckboxItem checked={enableFormula} onCheckedChange={setEnableFormula}>
                          公式识别
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={enableTable} onCheckedChange={setEnableTable}>
                          表格识别
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={enableOcr} onCheckedChange={setEnableOcr}>
                          OCR
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          导出格式{extraFormats.length > 0 ? ` (${extraFormats.length})` : ''}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {[
                          { key: 'docx', label: 'DOCX' },
                          { key: 'html', label: 'HTML' },
                          { key: 'latex', label: 'LaTeX' },
                        ].map((fmt) => (
                          <DropdownMenuCheckboxItem
                            key={fmt.key}
                            checked={extraFormats.includes(fmt.key)}
                            onCheckedChange={(v) => {
                              setExtraFormats((prev) =>
                                v ? [...prev, fmt.key] : prev.filter((x) => x !== fmt.key),
                              )
                            }}
                          >
                            {fmt.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground whitespace-nowrap">
                        指定页数{batchMode ? ' (所有文件)' : ''}
                      </label>
                      <Input
                        placeholder="如: 1-10,15-20"
                        value={pageRanges}
                        onChange={(e) => setPageRanges(e.target.value)}
                        className="h-7 text-xs w-[160px]"
                      />
                    </div>
                    {!batchMode && (
                      <>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch checked={noCache} onCheckedChange={setNoCache} />
                          <span className="text-xs">绕过缓存</span>
                        </label>
                        {!noCache && (
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">缓存容忍</label>
                            <Input
                              type="number"
                              placeholder="900s"
                              value={cacheTolerance}
                              onChange={(e) => setCacheTolerance(e.target.value)}
                              className="h-7 text-xs w-[70px]"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">数据 ID</label>
                          <Input
                            placeholder="业务标识"
                            value={dataId}
                            onChange={(e) => setDataId(e.target.value)}
                            className="h-7 text-xs w-[100px]"
                          />
                        </div>
                      </>
                    )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-sm">使用 R2 上传</p>
                      <p className="text-xs text-muted-foreground">大文件（＞50MB）通过 Cloudflare R2 上传，无大小限制</p>
                    </div>
                    <Switch checked={useR2Upload} onCheckedChange={setUseR2Upload} />
                  </div>
                  </div>
                </div>
              )}

              {parseMode === 'generate' ? (
                <div className="space-y-5">
                  <p className="text-xs text-muted-foreground">上传原始资料，AI 直接阅读文献并生成练习题。支持 PDF、Word、TXT。</p>

                  {/* File upload */}
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">上传资料文件</p>
                        {genFile && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => { setGenFile(null); setGenFileText('') }}>
                            <X className="h-3 w-3 mr-1" />移除文件
                          </Button>
                        )}
                      </div>
                      {genFile ? (
                        <div className="flex items-center gap-3 bg-muted/40 rounded-lg border p-3">
                          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{genFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {extracting ? '提取中...' : `已提取 ${genFileText.length} 字符`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors">
                          <input type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGenFile(f) }} />
                          <Upload className="h-5 w-5 text-muted-foreground/60" />
                          <span className="text-sm text-muted-foreground">点击选择文件，或拖拽到此处</span>
                          <span className="text-xs text-muted-foreground/50">PDF、Word (.docx)、TXT</span>
                        </label>
                      )}
                      {extracting && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Spinner /> 正在提取文本...
                        </div>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {genFileText && !extracting && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1 font-medium">预览提取内容</summary>
                            <pre className="mt-1 p-3 bg-muted/50 rounded-lg border max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{genFileText.slice(0, 2000)}{genFileText.length > 2000 ? '\n\n... 内容过长，已截断预览' : ''}</pre>
                          </details>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1 font-medium">
                            避免重复 {dedupHistoryIds.size > 0 ? `(已选 ${dedupHistoryIds.size})` : ''}
                          </summary>
                          {history.filter((h) => h.questions_json).length === 0 ? (
                            <p className="text-muted-foreground py-1">暂无历史生成记录</p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-0.5 mt-1 rounded border p-1.5">
                              {history.filter((h) => h.questions_json).map((h) => (
                                <label key={h.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5">
                                  <input type="checkbox" checked={dedupHistoryIds.has(h.id)}
                                    onChange={() => {
                                      setDedupHistoryIds((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(h.id)) next.delete(h.id)
                                        else next.add(h.id)
                                        return next
                                      })
                                    }}
                                    className="rounded shrink-0" />
                                  <span className="truncate flex-1">{h.file_name}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(h.created_at).toLocaleDateString()}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {dedupHistoryIds.size > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">✓ 已将 {dedupHistoryIds.size} 条历史题目的题干加入提示词，AI 将避免重复</p>
                          )}
                        </details>
                      </div>
                    </CardContent>
                  </Card>

                  <PromptEditor label="提示词" value={generateDocPrompt}
                    onChange={(v) => { setGenerateDocPrompt(v); setPrompt('generate_doc', v) }}
                    onReset={() => setGenerateDocPrompt(resetPrompt('generate_doc'))}
                  />

                  {/* Config */}
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">学科 <span className="text-muted-foreground font-normal text-xs">(选填)</span></label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between text-sm font-normal">
                                {genSubject || '选择学科'}
                                <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                              <DropdownMenuItem onClick={() => setGenSubject('')}>
                                <span className="text-muted-foreground">不限学科</span>
                                {!genSubject && <Check className="h-4 w-4 ml-auto" />}
                              </DropdownMenuItem>
                              {existingSubjects.map((s) => (
                                <DropdownMenuItem key={s} onClick={() => setGenSubject(s)}>
                                  {s}
                                  {genSubject === s && <Check className="h-4 w-4 ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">题目数量</label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between text-sm font-normal">
                                {genCount} 题
                                <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {[1, 3, 5, 10, 15, 20, 25, 30].map((n) => (
                                <DropdownMenuItem key={n} onClick={() => setGenCount(n)}>
                                  {n} 题
                                  {genCount === n && <Check className="h-4 w-4 ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">题型 <span className="text-muted-foreground font-normal text-xs">(至少选一个)</span></label>
                        <div className="flex flex-wrap gap-2">
                          {QUESTION_TYPE_OPTIONS.map((t) => {
                            const selected = genTypes.has(t.value)
                            return (
                              <Button
                                key={t.value}
                                type="button"
                                variant={selected ? 'default' : 'outline'}
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setGenTypes((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(t.value)) {
                                      if (next.size > 1) next.delete(t.value)
                                    } else {
                                      next.add(t.value)
                                    }
                                    return next
                                  })
                                }}
                              >
                                {t.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">知识点范围</label>
                        <Input placeholder="如：三段论、假言推理、选言推理"
                          value={genTopic} onChange={(e) => setGenTopic(e.target.value)} />
                      </div>
                    </CardContent>
                  </Card>

                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">PDF URL <span className="text-muted-foreground font-normal text-xs">(选填，直接填入 URL 无需上传)</span></label>
                    <div className="flex gap-2">
                      <Input placeholder="https://example.com/document.pdf" value={manualPdfUrl}
                        onChange={(e) => { setManualPdfUrl(e.target.value); if (e.target.value) { setFile(null); setFiles([]) } }}
                        className="h-9 text-sm flex-1" />
                      {r2Pdfs.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-1 text-xs">
                              R2 已有 <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto max-w-md">
                            {r2Pdfs.map((f) => (
                              <DropdownMenuItem key={f.key} className="flex items-center gap-1" onClick={() => { setManualPdfUrl(f.url); setFile(null); setFiles([]) }}>
                                <span className="truncate text-xs">{f.key.replace('pdf/', '')}</span>
                                <span className="ml-2 text-[10px] text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                                <a href={f.url} target="_blank" rel="noopener noreferrer"
                                  className="ml-auto shrink-0 text-[10px] text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}>预览</a>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <AiImportUpload
                    onFile={handleFile}
                    onFiles={handleFiles}
                    disabled={!aiConfigured || (parseMode === 'precision' && !mineruToken)}
                    multiple={parseMode === 'precision' && batchMode}
                  />
                </>
              )}

              {error && <p className="text-sm text-destructive mt-2">{error}</p>}

              {parseMode === 'generate' ? (
                <Button onClick={handleGenerate} disabled={!canStart || generating} className="w-full mt-4">
                  {generating ? (
                    <>
                      <Spinner />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      生成题目
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={startParse} disabled={!canStart} className="w-full mt-4">
                  <Play className="h-4 w-4" />
                  {parseMode === 'precision' ? '开始精准解析' : '开始解析'}
                </Button>
              )}
            </>
          )}

          {/* Step 2: Parsing */}
          {step === 'parsing' && (
            <div className="space-y-4">
              <ParsingProgress msg={parseMsg} status={parseStatus} />

              {parsingDone && parseResult && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium">解析结果</p>
                      <span className="text-xs text-muted-foreground">{parseResult.fileName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {pdfUrl && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => {
                          const next = !showSplitView
                          setShowSplitView(next)
                          if (next) setSidebarCollapsed(true)
                        }}>
                          {showSplitView ? '隐藏原文' : '对照原文'}
                        </button>
                      )}
                    </div>
                  </div>

                  {pdfUrl && parseResult.jsonData ? (
                    <Card className="border-0 shadow-none">
                      <CardContent className="p-0 h-[calc(100vh-120px)]">
                        <PdfMarkdownViewer pdfUrl={pdfUrl} jsonData={parseResult.jsonData} markdown={parseResult.markdown} pageRanges={pageRanges}>
                          <button type="button" className="text-[10px] underline text-muted-foreground hover:text-foreground" onClick={() => {
                            sessionStorage.setItem('pdf_test_url', pdfUrl)
                            sessionStorage.setItem('pdf_test_json', parseResult.jsonData!)
                            sessionStorage.setItem('pdf_test_md', parseResult.markdown)
                            window.open('/admin/pdf-test', '_blank')
                          }}>
                            调试
                          </button>
                        </PdfMarkdownViewer>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-0 shadow-none">
                      <CardContent className="py-4 space-y-2">
                        <p className="text-xs text-muted-foreground">MinerU 解析结果</p>
                        <ScrollArea className="bg-muted/50 rounded-lg p-3 h-[calc(100vh-120px)]">
                          <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed">
                            {(() => {
                              const start = parsePage * CHARS_PER_PAGE
                              return parseResult.markdown.slice(start, start + CHARS_PER_PAGE)
                            })()}
                          </pre>
                        </ScrollArea>
                        {(() => {
                          const totalPages = Math.ceil(parseResult.markdown.length / CHARS_PER_PAGE)
                          if (totalPages <= 1) return null
                          return (
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={parsePage === 0} onClick={() => setParsePage(p => p - 1)}>上一页</Button>
                              <span className="text-xs text-muted-foreground tabular-nums">{parsePage + 1} / {totalPages}</span>
                              <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={parsePage >= totalPages - 1} onClick={() => setParsePage(p => p + 1)}>下一页</Button>
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setParsingDone(false); setParseResult(null) }}>
                      重新解析
                    </Button>
                    <Button size="sm" onClick={() => extractQuestions(parseResult.markdown)}>
                      <ArrowRight className="h-4 w-4" />
                      AI 提取题目
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <PromptEditor
                      label="提取题目"
                      value={extractPrompt}
                      onChange={(v) => { setExtractPrompt(v); setPrompt('extract', v) }}
                      onReset={() => setExtractPrompt(resetPrompt('extract'))}
                    />
                    <PromptEditor
                      label="根据资料生成"
                      value={generateDocPrompt}
                      onChange={(v) => { setGenerateDocPrompt(v); setPrompt('generate_doc', v) }}
                      onReset={() => setGenerateDocPrompt(resetPrompt('generate_doc'))}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && (
            <>
              <AiImportPreview
                questions={questions}
                selectedIds={selectedIds}
                subject={subject}
                category={category}
                existingSubjects={existingSubjects}
                existingCategories={existingCategories}
                onSubjectChange={setSubject}
                onCategoryChange={setCategory}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onChangeQuestion={changeQuestion}
                onRemoveQuestion={removeQuestion}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  <ArrowLeft className="h-4 w-4" /> 返回
                </Button>
                <Button onClick={startImport} disabled={selectedIds.size === 0}>
                  导入选中 ({selectedIds.size})
                </Button>
              </div>
            </>
          )}

          {/* Step 5: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-muted-foreground">正在导入题目...</p>
            </div>
          )}

          {/* Step 6: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="text-lg font-semibold">导入完成</p>
                <p className="text-sm text-muted-foreground">成功导入 {importCount} 道题目</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetState}>
                  继续导入
                </Button>
                <Button asChild>
                  <Link to="/admin/questions">返回题目管理</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PromptEditor({ label, value, onChange, onReset }: { label: string; value: string; onChange: (v: string) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <button type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium"
          onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} 提示词 {label && `— ${label}`}
        </button>
        {open && (
          <>
            <textarea
              className="w-full h-40 text-xs font-mono p-3 rounded-lg border bg-muted/30 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
            />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onReset}>
                恢复默认
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SkeletonRow({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-4 rounded bg-muted/50 ${w}`} />
}

function s(v: unknown): string { return v != null ? String(v) : '' }

function stateLabel2(s: unknown) {
  if (s === 'done') return '已完成'
  if (s === 'failed') return '失败'
  if (s === 'running') return '处理中'
  if (s === 'pending') return '排队中'
  if (s === 'converting') return '转换中'
  return s ? String(s) : ''
}

function stateColor2(s: unknown) {
  if (s === 'done') return 'text-green-600 bg-green-100 dark:bg-green-900/30'
  if (s === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-900/30'
  return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30'
}

function ParsingProgress({ msg, status }: { msg: string; status: Record<string, unknown> | null }) {
  const steps = [
    { label: '上传文档', key: 'upload' },
    { label: '文档解析', key: 'mineru' },
    { label: 'AI 提取', key: 'ai' },
  ]

  let activeIdx = -1
  if (msg.includes('上传') || msg.includes('批量任务')) activeIdx = 0
  else if (msg.includes('MinerU') || msg.includes('解析') || msg.includes('Batch')) activeIdx = 1
  else if (msg.includes('AI') || msg.includes('提取')) activeIdx = 2

  const stateLabel = (s: unknown) => {
    if (s === 'done') return '已完成'
    if (s === 'failed') return '失败'
    if (s === 'running') return '处理中'
    if (s === 'pending') return '排队中'
    if (s === 'converting') return '转换中'
    if (s === 'connecting') return '连接中'
    return String(s)
  }
  const stateColor = (s: unknown) => {
    if (s === 'done') return 'text-green-600 bg-green-100 dark:bg-green-900/30'
    if (s === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-900/30'
    if (s === 'connecting') return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
    return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30'
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: Progress card */}
      <Card className="border-0 shadow-none">
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center w-full max-w-xs">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1 last:flex-[0]">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                      ${i <= activeIdx ? 'bg-primary text-primary-foreground scale-110 shadow-md' : 'bg-muted text-muted-foreground'}`}>
                      {i < activeIdx ? '✓' : i + 1}
                    </div>
                    <span className={`text-[10px] whitespace-nowrap transition-colors duration-500
                      ${i <= activeIdx ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 mt-[-12px] rounded bg-muted transition-all duration-700">
                      <div className="h-full rounded bg-primary transition-all duration-700 ease-out"
                        style={{ width: i < activeIdx ? '100%' : i === activeIdx ? '50%' : '0%' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm font-medium shimmer-text">{msg || '正在解析...'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Right: Response data card */}
      <Card className="border-0 shadow-none">
        <CardContent className="py-6 space-y-3 text-[11px]">
          <p className="font-medium text-muted-foreground">MinerU API 响应</p>

          {!status ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow w="w-3/4" />
              <SkeletonRow w="w-1/2" />
              <SkeletonRow />
              <SkeletonRow w="w-2/3" />
            </div>
          ) : (
            <>
              {/* Basic info table */}
              <table className="w-full border-collapse">
                <tbody>
                  {s(status.taskId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Task ID</td><td className="py-1 font-mono break-all">{s(status.taskId)}</td></tr>}
                  {s(status.batchId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Batch ID</td><td className="py-1 font-mono break-all">{s(status.batchId)}</td></tr>}
                  {s(status.dataId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Data ID</td><td className="py-1 font-mono break-all">{s(status.dataId)}</td></tr>}
                  {status.code !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Code</td><td className={`py-1 ${(status.code as number) === 0 ? 'text-green-600' : 'text-red-500'}`}>{s(status.code)}{status.msg ? ` — ${s(status.msg)}` : ''}</td></tr>}
                  {status.state !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">State</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColor(status.state)}`}>{stateLabel(status.state)}</span></td></tr>}
                  {s(status.markdownUrl) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Markdown URL</td><td className="py-1 font-mono break-all text-[10px]">{s(status.markdownUrl)}</td></tr>}
                  {s(status.fullZipUrl) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">ZIP URL</td><td className="py-1 font-mono break-all text-[10px]">{s(status.fullZipUrl)}</td></tr>}
                  {s(status.errMsg) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Error</td><td className="py-1 text-red-500">{s(status.errMsg)}</td></tr>}
                  {status.extractProgress ? <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Pages</td><td className="py-1">{s((status.extractProgress as Record<string, number>).extractedPages)} / {s((status.extractProgress as Record<string, number>).totalPages)}</td></tr> : null}
                </tbody>
              </table>

              {/* File list for batch */}
              {s(status.files) && (status.files as Array<Record<string, unknown>>).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1.5">文件列表</p>
                  <table className="w-full border-collapse text-[10px]">
                    <thead><tr className="text-muted-foreground text-left"><th className="py-0.5 pr-2 font-normal">文件</th><th className="py-0.5 pr-2 font-normal">状态</th><th className="py-0.5 font-normal">Data ID</th></tr></thead>
                    <tbody>
                      {(status.files as Array<Record<string, unknown>>).map((f: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-1 pr-2 max-w-[120px] truncate">{f.fileName as string}</td>
                          <td className="py-1 pr-2"><span className={`px-1 py-0.5 rounded text-[10px] ${stateColor(f.state)}`}>{stateLabel(f.state)}</span></td>
                          <td className="py-1 font-mono text-[10px] text-muted-foreground">{f.dataId ? String(f.dataId) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


