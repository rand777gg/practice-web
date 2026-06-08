import { useState, useEffect, useRef } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { PdfViewer } from '@/components/ai-import/PdfViewer'
import {
  DeepSeekParser, MinerUClient, getAiConfig, hasAiConfig,
  getMinerUToken, setMinerUToken, getMinerUModelVersion, setMinerUModelVersion,
} from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
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

  const { isEnabled } = useSettingsStore()
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
    setParseResult(null)
    setParsingDone(false)
    setParsePage(0)
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
    const result = await mineru.uploadAndParse(file, { pageRanges: pageRanges || undefined }, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
    setParseResult(result)
    setParsingDone(true)
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
    } else if (file) {
      const result = await mineru.uploadAndParsePrecision(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      setParseResult(result)
      setParsingDone(true)
    }
  }

  const [parseResult, setParseResult] = useState<{ markdown: string; fileName: string; jsonData?: string } | null>(null)
  const [parsingDone, setParsingDone] = useState(false)
  const [parsePage, setParsePage] = useState(0)
  const [showSplitView, setShowSplitView] = useState(false)
  const [activePage, setActivePage] = useState(1)
  const [activeBbox, setActiveBbox] = useState<[number, number, number, number] | null>(null)
  const [activeMdIdx, setActiveMdIdx] = useState<number | null>(null)
  const mdRef = useRef<HTMLDivElement>(null)
  const CHARS_PER_PAGE = 3000
  const pdfUrl = file ? URL.createObjectURL(file) : files.length > 0 ? URL.createObjectURL(files[0]) : null

  const extractQuestions = async (markdown: string) => {
    setParseMsg('AI 正在提取题目...')
    const parser = new DeepSeekParser(getAiConfig())
    const result = await parser.parseDocument(markdown)

    setQuestions(result.questions)
    setSelectedIds(new Set(result.questions.map((_, i) => i)))
    setStep('preview')
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/questions"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">AI 智能解析<span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">BETA</span><a href="https://mineru.net" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground ml-1 hover:underline">由 MinerU 提供解析</a></h1>
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
                          { key: 'json', label: 'JSON (含坐标)' },
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
                  </div>
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
                    {pdfUrl && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowSplitView(!showSplitView)}>
                        {showSplitView ? '隐藏原文' : '对照原文'}
                      </button>
                    )}
                  </div>

                  <div className={`grid gap-4 ${showSplitView && pdfUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {showSplitView && pdfUrl && (
                      <Card className="border-0 shadow-none">
                        <CardContent className="p-3">
                          <PdfViewer pdfUrl={pdfUrl} jsonData={parseResult.jsonData}
                            activePage={activePage} activeBbox={activeBbox} onPageChange={setActivePage}
                            onBlockClick={(block) => {
                              const blocks = parseBlocks(parseResult.jsonData!)
                              const idx = matchMarkdownToPdf(parseResult.markdown, blocks).findIndex(
                                s => s.bbox && s.bbox[0] === block.bbox[0] && s.bbox[1] === block.bbox[1]
                              )
                              if (idx >= 0) {
                                setActiveMdIdx(idx)
                                setActivePage(block.page_num + 1)
                                setActiveBbox(block.bbox)
                                setTimeout(() => {
                                  mdRef.current?.querySelector(`[data-md-idx="${idx}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }, 50)
                              }
                            }}
                          />
                        </CardContent>
                      </Card>
                    )}
                    <Card className="border-0 shadow-none">
                      <CardContent className="py-4 space-y-2">
                        <ScrollArea className="bg-muted/50 rounded-lg p-3 max-h-[500px]">
                          {showSplitView && parseResult.jsonData ? (
                            <div ref={mdRef}>
                              <ClickableMarkdown
                                markdown={parseResult.markdown}
                                jsonData={parseResult.jsonData}
                                activeIdx={activeMdIdx}
                                onNavigate={(page, bbox, idx) => { setActivePage(page); setActiveBbox(bbox); setActiveMdIdx(idx) }}
                              />
                            </div>
                          ) : (
                            <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed">
                              {(() => {
                                const start = parsePage * CHARS_PER_PAGE
                                return parseResult.markdown.slice(start, start + CHARS_PER_PAGE)
                              })()}
                            </pre>
                          )}
                        </ScrollArea>
                        {!showSplitView && (() => {
                          const totalPages = Math.ceil(parseResult.markdown.length / CHARS_PER_PAGE)
                          if (totalPages <= 1) return null
                          return (
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <Button variant="ghost" size="sm" className="h-6 text-xs"
                                disabled={parsePage === 0}
                                onClick={() => setParsePage(p => p - 1)}>
                                上一页
                              </Button>
                              <span className="text-xs text-muted-foreground tabular-nums">{parsePage + 1} / {totalPages}</span>
                              <Button variant="ghost" size="sm" className="h-6 text-xs"
                                disabled={parsePage >= totalPages - 1}
                                onClick={() => setParsePage(p => p + 1)}>
                                下一页
                              </Button>
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setParsingDone(false); setParseResult(null) }}>
                      重新解析
                    </Button>
                    <Button size="sm" onClick={() => extractQuestions(parseResult.markdown)}>
                      <ArrowRight className="h-4 w-4" />
                      AI 提取题目
                    </Button>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

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
                <Button variant="outline" onClick={() => setStep('preview')}>
                  <ArrowLeft className="h-4 w-4" /> 返回
                </Button>
                <Button onClick={() => { goPreview() }}>
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

type PdfBlock = { page_num: number; bbox: [number, number, number, number]; content?: string; type?: string }

function parseBlocks(jsonData: string): PdfBlock[] {
  try {
    const data = JSON.parse(jsonData)
    const extract = (arr: unknown[]): PdfBlock[] => {
      const result: PdfBlock[] = []
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const obj = item as Record<string, unknown>
        if (obj.page_num !== undefined && obj.bbox) {
          result.push({ page_num: obj.page_num as number, bbox: obj.bbox as [number, number, number, number], content: obj.content as string | undefined, type: obj.type as string | undefined })
        }
        if (Array.isArray(obj.children)) result.push(...extract(obj.children as unknown[]))
      }
      return result
    }
    return Array.isArray(data) ? extract(data) : []
  } catch { return [] }
}

function normalize(s: string) { return s.replace(/[#*\s\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() }

function matchMarkdownToPdf(md: string, blocks: PdfBlock[]): { text: string; page: number; bbox: [number, number, number, number] | null }[] {
  const paragraphs = md.split(/\n\n+/).filter(p => p.trim())
  return paragraphs.map(para => {
    const norm = normalize(para)
    let best: PdfBlock | null = null; let bestScore = 0
    for (const b of blocks) {
      if (!b.content) continue
      const bNorm = normalize(b.content)
      if (bNorm.length < 3) continue
      const overlap = bNorm.split(' ').filter(w => norm.includes(w)).length
      const score = overlap / Math.max(bNorm.split(' ').length, 1)
      if (score > bestScore && score > 0.3) { bestScore = score; best = b }
    }
    return { text: para, page: (best?.page_num ?? 0) + 1, bbox: best?.bbox ?? null }
  })
}

function ClickableMarkdown({ markdown, jsonData, activeIdx, onNavigate }: { markdown: string; jsonData: string; activeIdx: number | null; onNavigate: (page: number, bbox: [number, number, number, number] | null, idx: number) => void }) {
  const blocks = parseBlocks(jsonData)
  const sections = matchMarkdownToPdf(markdown, blocks)

  return (
    <div className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
      {sections.map((sec, i) => (
        <span
          key={i}
          data-md-idx={i}
          className={`block cursor-pointer rounded px-1 py-0.5 transition-colors ${sec.bbox ? 'hover:bg-amber-100 dark:hover:bg-amber-900/20' : ''} ${activeIdx === i ? 'bg-blue-100 dark:bg-blue-900/30 ring-1 ring-blue-400' : ''}`}
          onClick={() => { if (sec.bbox) onNavigate(sec.page, sec.bbox, i) }}
          title={sec.bbox ? `第 ${sec.page} 页 — 点击定位` : undefined}
        >
          {sec.text}
        </span>
      ))}
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
  if (msg.includes('上传') || msg.includes('批量任务')) activeIdx = 0
  else if (msg.includes('MinerU') || msg.includes('解析') || msg.includes('Batch')) activeIdx = 1
  else if (msg.includes('AI') || msg.includes('提取')) activeIdx = 2

  const stateLabel = (s: unknown) => {
    if (s === 'done') return '已完成'
    if (s === 'failed') return '失败'
    if (s === 'running') return '处理中'
    if (s === 'pending') return '排队中'
    if (s === 'converting') return '转换中'
    return String(s)
  }
  const stateColor = (s: unknown) => {
    if (s === 'done') return 'text-green-600 bg-green-100 dark:bg-green-900/30'
    if (s === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-900/30'
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
      {status && (
        <Card className="border-0 shadow-none">
          <CardContent className="py-6 space-y-3 text-[11px]">
            <p className="font-medium text-muted-foreground">MinerU API 响应</p>

            {/* Basic info table */}
            <table className="w-full border-collapse">
              <tbody>
                {status.taskId && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Task ID</td><td className="py-1 font-mono break-all">{status.taskId as string}</td></tr>}
                {status.batchId && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Batch ID</td><td className="py-1 font-mono break-all">{status.batchId as string}</td></tr>}
                {status.dataId && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Data ID</td><td className="py-1 font-mono break-all">{status.dataId as string}</td></tr>}
                {status.code !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Code</td><td className={`py-1 ${status.code === 0 ? 'text-green-600' : 'text-red-500'}`}>{String(status.code)}{status.msg ? ` — ${status.msg}` : ''}</td></tr>}
                {status.state !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">State</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColor(status.state)}`}>{stateLabel(status.state)}</span></td></tr>}
                {status.markdownUrl && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Markdown URL</td><td className="py-1 font-mono break-all text-[10px]">{status.markdownUrl as string}</td></tr>}
                {status.fullZipUrl && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Full ZIP URL</td><td className="py-1 font-mono break-all text-[10px]">{status.fullZipUrl as string}</td></tr>}
                {status.errMsg && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Error</td><td className="py-1 text-red-500">{status.errMsg as string}</td></tr>}
                {status.extractProgress && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Pages</td><td className="py-1">{(status.extractProgress as Record<string, number>).extractedPages} / {(status.extractProgress as Record<string, number>).totalPages}</td></tr>}
              </tbody>
            </table>

            {/* File list for batch */}
            {status.files && (status.files as Array<Record<string, unknown>>).length > 0 && (
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
