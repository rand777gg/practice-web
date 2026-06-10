import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ImportedQuestion } from '@/types'
import { useT } from '@/i18n/use-t'
import { Upload, Code2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

type ImportState = 'input' | 'preview' | 'importing' | 'done' | 'error'

	const JSON_SAMPLE = `\`\`\`json
  {
    "question_type": "single_choice",
    "question_text": "HTML 的全称是什么？",
    "options": [
      "Hyper Text Markup Language",
      "High Tech Modern Language",
      "Hyper Transfer Markup Language",
      "Home Tool Markup Language"
    ],
    "correct_answer": 0,
    "category": "前端基础",
    "subject": "计算机",
    "analysis": "HTML 是 Hyper Text Markup Language 的缩写。",
    "key_points": "HTML, Web基础"
  }
\`\`\`\`
const CSV_SAMPLE = `question_text,option_a,option_b,option_c,option_d,correct_answer,subject,key_points
HTML 的全称是什么？,Hyper Text Markup Language,High Tech Modern Language,Hyper Transfer Markup Language,Home Tool Markup Language,0,计算机,HTML; Web基础
CSS 的全称是什么？,Cascading Style Sheets,Computer Style System,Creative Style Sheets,Colorful Style Sheets,0,计算机,CSS; Web基础`

function parseQuestions(text: string, format: 'json' | 'csv'): { questions: ImportedQuestion[]; errors: string[] } {
  const errors: string[] = []

  if (format === 'json') {
    const raw = JSON.parse(text)
    const arr = Array.isArray(raw) ? raw : [raw]
    const questions = arr.map((item: Record<string, unknown>) => ({
      question_type: (item.question_type as ImportedQuestion['question_type']) ?? 'single_choice',
      question_text: String(item.question_text ?? ''),
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      correct_answer: (item.correct_answer ?? 0) as ImportedQuestion['correct_answer'],
      category: item.category ? String(item.category) : undefined,
      subject: item.subject ? String(item.subject) : undefined,
      analysis: item.analysis ? String(item.analysis) : undefined,
      key_points: item.key_points ? String(item.key_points) : undefined,
    }))
    return { questions, errors }
  }

  // CSV
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) {
    errors.push('CSV 必须包含标题行和至少一行数据')
    return { questions: [], errors }
  }
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows = lines.slice(1)

  const questions = rows.map((row, i) => {
    const cols = row.split(',').map((c) => c.trim())
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = cols[idx] ?? '' })

    const options = [obj.option_a, obj.option_b, obj.option_c, obj.option_d].filter(Boolean)
    if (options.length < 2) {
      errors.push(`第 ${i + 2} 行: 至少需要两个选项`)
    }

    return {
      question_type: 'single_choice' as const,
      question_text: obj.question_text ?? '',
      options,
      correct_answer: Number(obj.correct_answer ?? 0),
      category: obj.category || undefined,
      subject: obj.subject || undefined,
      analysis: obj.analysis || undefined,
      key_points: obj.key_points || undefined,
    }
  })

  return { questions: questions.filter((q) => q.question_text && q.options.length >= 2), errors }
}

export function QuestionImportDialog({ open, onClose, onImported }: Props) {
  const { t } = useT()
  const [state, setState] = useState<ImportState>('input')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [inputMode, setInputMode] = useState<'paste' | 'file'>('paste')
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<ImportedQuestion[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [showSample, setShowSample] = useState(false)

  const reset = () => {
    setState('input'); setParsed([]); setErrors([]); setMessage(''); setPasteText('')
  }

  const handleClose = () => { reset(); onClose() }

  const handleParse = () => {
    try {
      const { questions, errors: parseErrors } = parseQuestions(pasteText, format)
      if (questions.length === 0) {
        setErrors([...parseErrors, '未解析到有效题目'])
        setState('input')
        return
      }
      setParsed(questions)
      setErrors(parseErrors)
      setState('preview')
    } catch {
      setErrors([format === 'json' ? 'JSON 格式错误，请检查语法' : 'CSV 解析失败'])
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPasteText(text)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'json') setFormat('json')
    else setFormat('csv')
    try {
      const { questions, errors: parseErrors } = parseQuestions(text, ext === 'json' ? 'json' : 'csv')
      if (questions.length === 0) {
        setErrors([...parseErrors, '未解析到有效题目'])
        return
      }
      setParsed(questions)
      setErrors(parseErrors)
      setState('preview')
    } catch {
      setErrors([ext === 'json' ? 'JSON 格式错误' : 'CSV 解析失败'])
    }
  }

  const handleImport = async () => {
    setState('importing')
    const { error } = await supabase.from('questions').insert(
      parsed.map((q) => ({
        question_type: q.question_type ?? 'single_choice',
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        category: q.category ?? null,
        subject: q.subject ?? null,
        analysis: q.analysis ?? null,
        key_points: q.key_points ?? null,
      })),
    )
    if (error) { setMessage(error.message); setState('error') }
    else {
      setMessage(`成功导入 ${parsed.length} 道题目`)
      setState('done')
      onImported()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('questions.importTitle')}</DialogTitle>
          <DialogDescription>{t('questions.importDesc')}</DialogDescription>
        </DialogHeader>

        {state === 'input' && (
          <div className="space-y-4 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2">
              <Button variant={format === 'csv' ? 'default' : 'outline'} size="sm" onClick={() => setFormat('csv')}>CSV</Button>
              <Button variant={format === 'json' ? 'default' : 'outline'} size="sm" onClick={() => setFormat('json')}>JSON</Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowSample(!showSample)}>
                <Code2 className="h-3.5 w-3.5" />
                {showSample ? '隐藏' : '查看'}格式示例
              </Button>
            </div>

            {showSample && (
              <div className="space-y-3 min-w-0">
                <pre className="rounded-lg border bg-muted/30 p-3 text-xs overflow-x-auto max-h-44 font-mono leading-relaxed whitespace-pre-wrap break-all">
                  <code>{format === 'json' ? JSON_SAMPLE : CSV_SAMPLE}</code>
                </pre>
                {format === 'csv' && (
                  <div className="rounded-lg border overflow-x-auto max-w-full">
                    <Table className="w-max min-w-full">
                      <TableHeader>
                        <TableRow>
                          {CSV_SAMPLE.split('\n')[0].split(',').map((h, i) => (
                            <TableHead key={i} className="text-[10px] py-1.5 px-2">{h.trim()}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {CSV_SAMPLE.split('\n').slice(1).map((row, ri) => (
                          <TableRow key={ri}>
                            {row.split(',').map((cell, ci) => (
                              <TableCell key={ci} className="text-[10px] py-1 px-2 max-w-[120px] truncate">{cell.trim()}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'paste' | 'file')}>
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1">粘贴内容</TabsTrigger>
                <TabsTrigger value="file" className="flex-1">上传文件</TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="mt-3">
                <textarea
                  className="w-full h-48 text-xs font-mono p-3 rounded-lg border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={format === 'json'
                    ? '粘贴 JSON 数组...'
                    : 'question_text,option_a,option_b,option_c,option_d,correct_answer,category,subject,analysis,key_points\n...'}
                  spellCheck={false}
                />
                <Button onClick={handleParse} disabled={!pasteText.trim()} className="w-full mt-3">
                  解析预览
                </Button>
              </TabsContent>
              <TabsContent value="file" className="mt-3">
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors">
                  <input type="file" accept=".csv,.json" className="hidden" onChange={handleFile} />
                  <Upload className="h-6 w-6 text-muted-foreground/60" />
                  <span className="text-sm text-muted-foreground">点击选择 CSV 或 JSON 文件</span>
                </label>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {state === 'preview' && (
          <div className="space-y-4 min-w-0 overflow-hidden">
            <p className="text-sm">解析到 <strong>{parsed.length}</strong> 道有效题目</p>
            {errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive space-y-0.5 max-h-24 overflow-auto">
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <div className="max-h-56 overflow-y-auto space-y-2">
              {parsed.slice(0, 20).map((q, i) => (
                <div key={i} className="text-sm border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">{q.question_type}</span>
                    {q.subject && <span className="text-[10px] text-muted-foreground">{q.subject}</span>}
                  </div>
                  <p className="font-medium">{q.question_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {q.options.length} 个选项
                    {q.analysis && <> · 解析: {q.analysis.slice(0, 40)}{q.analysis.length > 40 ? '...' : ''}</>}
                  </p>
                </div>
              ))}
              {parsed.length > 20 && <p className="text-xs text-muted-foreground text-center">... 还有 {parsed.length - 20} 道题目</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>返回修改</Button>
              <Button onClick={handleImport}>导入 {parsed.length} 道题目</Button>
            </DialogFooter>
          </div>
        )}

        {state === 'importing' && (
          <div className="flex justify-center py-8"><Spinner /></div>
        )}

        {(state === 'done' || state === 'error') && (
          <div className="space-y-4">
            <div className={`rounded-md p-3 text-sm ${state === 'done' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-destructive/10 text-destructive'}`}>
              {message}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>关闭</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
