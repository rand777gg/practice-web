import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AiImportUpload } from '@/components/ai-import/AiImportUpload'
import { AiImportMetadata } from '@/components/ai-import/AiImportMetadata'
import { AiImportPreview } from '@/components/ai-import/AiImportPreview'
import { Spinner } from '@/components/ui/spinner'
import { DeepSeekParser, MinerUClient, getAiConfig, hasAiConfig, hasMineruToken, getMineruToken } from '@/lib/ai'
import type { MinerUMode } from '@/lib/ai/mineru'
import { ArrowLeft, ArrowRight, Play, CheckCircle, AlertCircle } from 'lucide-react'
import type { ParsedQuestion } from '@/lib/ai/types'

type Step = 'upload' | 'parsing' | 'metadata' | 'preview' | 'importing' | 'done'

export function Component() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [parseMsg, setParseMsg] = useState('')
  const [importCount, setImportCount] = useState(0)
  const [error, setError] = useState('')
  const [mineruMode, setMineruMode] = useState<MinerUMode>('lightweight')
  const [mineruToken, setMineruToken] = useState(getMineruToken)
  const [existingSubjects, setExistingSubjects] = useState<string[]>([])
  const [existingCategories, setExistingCategories] = useState<string[]>([])

  const aiConfigured = hasAiConfig()
  const mineruTokenConfigured = hasMineruToken()

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

  const handleFile = (f: File) => setFile(f)

  const startParse = async () => {
    if (!file) return
    if (mineruMode === 'precise' && !mineruToken.trim()) {
      setError('精准解析需要 MinerU Token')
      return
    }
    setStep('parsing')
    setError('')

    try {
      const mineru = new MinerUClient(mineruMode, mineruToken || undefined)
      const { markdown } = await mineru.uploadAndParse(file, (msg) => setParseMsg(msg))

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
      setStep('upload')
    }
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

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/questions"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">AI 导入题目</h1>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className={aiConfigured ? 'text-green-500' : 'text-orange-500'}>
          DeepSeek API {aiConfigured ? '✓ 已配置' : '✗ 未配置'}
        </span>
        <span className={mineruTokenConfigured ? 'text-green-500' : ''}>
          MinerU Token {mineruTokenConfigured ? '✓ 已配置' : '○ 可选'}
        </span>
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
              <div className="flex items-center gap-3 mb-4">
                <Label className="text-sm shrink-0">解析模式</Label>
                <div className="flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs transition-colors ${mineruMode === 'lightweight' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                    onClick={() => setMineruMode('lightweight')}
                  >轻量解析</button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs transition-colors ${mineruMode === 'precise' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                    onClick={() => setMineruMode('precise')}
                  >精准解析</button>
                </div>
              </div>
              {mineruMode === 'precise' && !mineruTokenConfigured && (
                <div className="mb-4">
                  <Label htmlFor="mineru-token" className="text-xs">MinerU Token</Label>
                  <Input
                    id="mineru-token"
                    value={mineruToken}
                    onChange={(e) => setMineruToken(e.target.value)}
                    placeholder="在 MinerU API 管理页面创建"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              )}
              {mineruMode === 'precise' && mineruTokenConfigured && (
                <p className="text-xs text-green-500 mb-4">MinerU Token 已通过环境变量配置 ✓</p>
              )}
              <AiImportUpload onFile={handleFile} disabled={!aiConfigured} />
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
              <Button onClick={startParse} disabled={!file || !aiConfigured} className="w-full mt-4">
                <Play className="h-4 w-4" />
                开始解析
              </Button>
            </>
          )}

          {/* Step 2: Parsing */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-muted-foreground">{parseMsg || '正在解析...'}</p>
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
              }} />
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
                <Button variant="outline" onClick={() => {
                  setStep('upload')
                  setFile(null)
                  setQuestions([])
                  setSubject('')
                  setCategory('')
                  setSelectedIds(new Set())
                }}>
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
