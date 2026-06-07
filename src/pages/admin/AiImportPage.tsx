import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { AiImportUpload } from '@/components/ai-import/AiImportUpload'
import { AiImportMetadata } from '@/components/ai-import/AiImportMetadata'
import { AiImportPreview } from '@/components/ai-import/AiImportPreview'
import { Spinner } from '@/components/ui/spinner'
import {
  DeepSeekParser, MinerUClient, getAiConfig, hasAiConfig,
  getMinerUToken, setMinerUToken, getMinerUModelVersion, setMinerUModelVersion,
} from '@/lib/ai'
import type { ParsedQuestion, MinerUModelVersion } from '@/lib/ai/types'
import { ArrowLeft, ArrowRight, Play, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'

type Step = 'upload' | 'parsing' | 'metadata' | 'preview' | 'importing' | 'done'
type ParseMode = 'lightweight' | 'precision'

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
  const [pageRanges, setPageRanges] = useState('')
  const [extraFormats, setExtraFormats] = useState<string[]>([])
  const [noCache, setNoCache] = useState(false)
  const [cacheTolerance, setCacheTolerance] = useState('')
  const [dataId, setDataId] = useState('')

  const aiConfigured = hasAiConfig()
  const precisionReady = parseMode === 'lightweight' || (parseMode === 'precision' && !!mineruToken)
  const canStart = parseMode === 'precision'
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
    setQuestions([])

    try {
      if (parseMode === 'precision') {
        await runPrecisionParse()
      } else {
        await runLightweightParse()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
      setStep('upload')
    }
  }

  const runLightweightParse = async () => {
    if (!file) return
    const mineru = new MinerUClient()
    const { markdown } = await mineru.uploadAndParse(file, { pageRanges: pageRanges || undefined }, (msg) => setParseMsg(msg))
    await extractQuestions(markdown)
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
      // Merge all markdowns
      const mergedMd = results.map(r => `## ${r.fileName}\n\n${r.markdown}`).join('\n\n---\n\n')
      await extractQuestions(mergedMd)
    } else if (file) {
      const { markdown } = await mineru.uploadAndParsePrecision(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      await extractQuestions(markdown)
    }
  }

  const extractQuestions = async (markdown: string) => {
    setParseMsg('AI 正在提取题目...')
    const parser = new DeepSeekParser(getAiConfig())
    const result = await parser.parseDocument(markdown)

    if (result.questions.length === 0) {
      setError('文档中未发现有效题目')
      setStep('upload')
      return
    }

    setQuestions(result.questions)
    setSelectedIds(new Set(result.questions.map((_, i) => i)))
    setStep('metadata')
  }

  const goPreview = () => setStep('preview')

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
          category: category || null,
          subject: subject || null,
          analysis: q.analysis ?? null,
          key_points: q.key_points ?? null,
          answer_explanation: q.answer_explanation ?? null,
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
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/questions"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">AI 智能解析<span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">BETA</span></h1>
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
                  <TabsTrigger value="precision">精准解析</TabsTrigger>
                </TabsList>
              </Tabs>

              {parseMode === 'lightweight' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">支持 PDF、DOCX，单文件 ≤ 10MB、≤ 20 页，无需 Token。</p>
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
                <p className="text-xs text-muted-foreground">支持 PDF/DOCX/PPT/XLS/图片/HTML，单文件 ≤ 200MB、≤ 200 页，支持批量最多 200 个文件。需配置 MinerU Token。</p>
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

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Switch
                        checked={batchMode}
                        onCheckedChange={(v) => { setBatchMode(v); setFile(null); setFiles([]) }}
                      />
                      批量模式
                    </label>

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
                          高级选项
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
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground whitespace-nowrap">
                        指定页数{batchMode ? ' (所有文件)' : ''}
                      </label>
                      <Input
                        placeholder="如: 1-10,15-20"
                        value={pageRanges}
                        onChange={(e) => setPageRanges(e.target.value)}
                        className="h-7 text-xs w-[180px]"
                      />
                    </div>
                    {!batchMode && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">数据ID</label>
                        <Input
                          placeholder="业务标识"
                          value={dataId}
                          onChange={(e) => setDataId(e.target.value)}
                          className="h-7 text-xs w-[120px]"
                        />
                      </div>
                    )}
                  </div>

                  {!batchMode && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Switch checked={noCache} onCheckedChange={setNoCache} />
                        <span className="text-xs">绕过缓存</span>
                      </label>
                      {!noCache && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">缓存容忍(秒)</label>
                          <Input
                            type="number"
                            placeholder="900"
                            value={cacheTolerance}
                            onChange={(e) => setCacheTolerance(e.target.value)}
                            className="h-7 text-xs w-[80px]"
                          />
                        </div>
                      )}
                    </div>
                  )}

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
              )}

              <AiImportUpload
                onFile={handleFile}
                onFiles={handleFiles}
                disabled={!aiConfigured || (parseMode === 'precision' && !mineruToken)}
                multiple={parseMode === 'precision' && batchMode}
              />

              {error && <p className="text-sm text-destructive mt-2">{error}</p>}

              <Button onClick={startParse} disabled={!canStart} className="w-full mt-4">
                <Play className="h-4 w-4" />
                {parseMode === 'precision' ? '开始精准解析' : '开始解析'}
              </Button>
            </>
          )}

          {/* Step 2: Parsing */}
          {step === 'parsing' && <ParsingProgress msg={parseMsg} status={parseStatus} />}

          {/* Step 3: Metadata */}
          {step === 'metadata' && (
            <>
              <AiImportMetadata
                subject={subject}
                category={category}
                existingSubjects={existingSubjects}
                existingCategories={existingCategories}
                onChange={(f, v) => {
                  if (f === 'subject') setSubject(v)
                  else setCategory(v)
                }}
              />
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  <ArrowLeft className="h-4 w-4" /> 返回
                </Button>
                <Button onClick={goPreview}>
                  下一步 <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && (
            <>
              <AiImportPreview
                questions={questions}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onChangeQuestion={changeQuestion}
                onRemoveQuestion={removeQuestion}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep('metadata')}>
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

function ParsingProgress({ msg, status }: { msg: string; status: Record<string, unknown> | null }) {
  const steps = [
    { label: '上传文档', key: 'upload' },
    { label: '文档解析', key: 'mineru' },
    { label: 'AI 提取', key: 'ai' },
  ]

  let activeIdx = -1
  if (msg.includes('上传')) activeIdx = 0
  else if (msg.includes('MinerU') || msg.includes('解析')) activeIdx = 1
  else if (msg.includes('AI') || msg.includes('提取')) activeIdx = 2

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="flex items-center w-full max-w-xs">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-[0]">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                ${i <= activeIdx
                  ? 'bg-primary text-primary-foreground scale-110 shadow-md'
                  : 'bg-muted text-muted-foreground'}`}
              >
                {i < activeIdx ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap transition-colors duration-500
                ${i <= activeIdx ? 'text-primary font-medium' : 'text-muted-foreground'}`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 mt-[-12px] rounded bg-muted transition-all duration-700">
                <div
                  className="h-full rounded bg-primary transition-all duration-700 ease-out"
                  style={{ width: i < activeIdx ? '100%' : i === activeIdx ? '50%' : '0%' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium shimmer-text">
        {msg || '正在解析...'}
      </p>

      {/* MinerU API response status */}
      {status && (
        <div className="w-full max-w-md mt-2">
          <div className="text-[10px] text-muted-foreground mb-1">MinerU 响应</div>
          <pre className="text-[10px] bg-muted/50 rounded-lg p-3 max-h-[200px] overflow-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(status, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
