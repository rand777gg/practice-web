import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import {
  Plus, Trash2, Check, ChevronDown, Sparkles, Save, X,
} from 'lucide-react'
import { OPTION_LABELS, QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { getDefaultAnswer } from '@/lib/answer-utils'
import type { Question, QuestionType, CorrectAnswer } from '@/types'
import { generateKeyPoints, hasAiConfig, DeepSeekParser } from '@/lib/ai'
import { getAiConfig } from '@/lib/ai/config'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

interface Props {
  initialData?: Question
  onSubmit: (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => Promise<void>
  onCancel: () => void
}

export function QuestionForm({ initialData, onSubmit, onCancel }: Props) {
  const { t } = useT()
  const { isEnabled } = useSettingsStore()
  const [questionType, setQuestionType] = useState<QuestionType>(initialData?.question_type ?? 'single_choice')
  const [questionText, setQuestionText] = useState(initialData?.question_text ?? '')
  const [options, setOptions] = useState<string[]>(initialData?.options ?? ['', ''])
  const [correctAnswer, setCorrectAnswer] = useState<CorrectAnswer>(initialData?.correct_answer ?? 0)
  const [categories, setCategories] = useState<string[]>(
    initialData?.categories?.length ? initialData.categories : initialData?.category ? [initialData.category] : []
  )
  const [categoryInput, setCategoryInput] = useState('')
  const [subject, setSubject] = useState(initialData?.subject ?? '')
  const [analysis, setAnalysis] = useState(initialData?.analysis ?? '')
  const [keyPoints, setKeyPoints] = useState(initialData?.key_points ?? '')
  const [seqNumber, setSeqNumber] = useState(initialData?.seq_number ?? '')
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [keyPointsGlow, setKeyPointsGlow] = useState(false)
  const [keyPointsFade, setKeyPointsFade] = useState(false)
  const [keyPointsOpacity, setKeyPointsOpacity] = useState(1)
  const [keyPointsAnimating, setKeyPointsAnimating] = useState(false)
  const [keyPointsLoading, setKeyPointsLoading] = useState(false)
  const [stemExtracting, setStemExtracting] = useState(false)
  const [stemGlow, setStemGlow] = useState(false)
  const [stemFade, setStemFade] = useState(false)
  const typewriterRef = useRef<{ text: string; timer: ReturnType<typeof setInterval> | null }>({ text: '', timer: null })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Existing subjects/categories for autocomplete
  const [existingSubjects, setExistingSubjects] = useState<string[]>([])
  const [existingCategories, setExistingCategories] = useState<string[]>([])
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const subjectFiltered = existingSubjects.filter((s) => !subject || s.includes(subject)).slice(0, 8)
  const categoryFiltered = existingCategories.filter((c) => {
    if (categories.includes(c)) return false
    if (!categoryInput) return true
    return c.includes(categoryInput)
  }).slice(0, 8)

  useEffect(() => {
    supabase.from('questions').select('subject, category, categories').then(({ data }) => {
      const subs = new Set<string>(); const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
        if (row.categories) {
          for (const c of row.categories as string[]) {
            if (c) cats.add(c)
          }
        }
      }
      setExistingSubjects([...subs].sort())
      setExistingCategories([...cats].sort())
    })
  }, [])

  useEffect(() => {
    return () => {
      if (typewriterRef.current.timer) clearInterval(typewriterRef.current.timer)
    }
  }, [])

  const needsOptions = questionType === 'single_choice' || questionType === 'multi_select'
  const isChoiceType = needsOptions
  const isSingle = questionType === 'single_choice'
  const isMulti = questionType === 'multi_select'
  const isTrueFalse = questionType === 'true_false'
  const isJudgeCorrect = questionType === 'judge_correct'
  const isFillBlank = questionType === 'fill_blank'
  const isShortAnswer = questionType === 'short_answer'
  const isAnalysis = questionType === 'analysis'

  const handleTypeChange = (t: QuestionType) => {
    setQuestionType(t)
    setCorrectAnswer(getDefaultAnswer(t))
    if (t === 'true_false') setOptions(['正确', '错误'])
    else if (t === 'judge_correct' || t === 'fill_blank' || t === 'short_answer' || t === 'analysis') setOptions([])
    else if (options.length < 2) setOptions(['', ''])
  }

  const addOption = () => setOptions([...options, ''])
  const removeOption = (index: number) => {
    if (options.length <= 2) return
    const newOptions = options.filter((_, i) => i !== index)
    setOptions(newOptions)
    if (isSingle && typeof correctAnswer === 'number') {
      if (correctAnswer === index) setCorrectAnswer(0)
      else if (correctAnswer > index) setCorrectAnswer(correctAnswer - 1)
    }
    if (isMulti && Array.isArray(correctAnswer)) {
      const arr = correctAnswer as number[]
      setCorrectAnswer(
        arr.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
      )
    }
  }
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const toggleMultiAnswer = (index: number) => {
    if (!Array.isArray(correctAnswer)) return
    const arr: number[] = [...correctAnswer as number[]]
    const idx = arr.indexOf(index)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(index)
    setCorrectAnswer(arr)
  }

  const prevQuestionTextRef = useRef<string | null>(null)

  const handleExtractStem = async () => {
    if (!questionText.trim()) return
    prevQuestionTextRef.current = questionText
    setStemExtracting(true)
    setStemGlow(true)
    try {
      const config = getAiConfig()
      if (!config.apiKey) return
      const parser = new DeepSeekParser(config as any)
      const result = await (parser as any).extractStem?.(questionText.trim()) ??
        await (async () => {
          const { generateText } = await import('ai')
          const { createDeepSeek } = await import('@ai-sdk/deepseek')
          const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
          const model = client(config.model || 'deepseek-chat')
          const { text } = await generateText({
            model,
            system: '你是一个题目格式化助手。只提取题干部分，去掉所有选项（A. B. C. D. ①②③④等）和分析/解析内容。直接返回提取后的纯题干，不要加任何额外说明。',
            prompt: questionText.trim(),
            temperature: 0.1,
          })
          return text.trim()
        })()
      if (result && result !== questionText.trim()) setQuestionText(result)
    } catch { /* ignore */ }
    setStemExtracting(false)
    setTimeout(() => {
      setStemFade(true)
      requestAnimationFrame(() => {
        setStemGlow(false)
        setTimeout(() => setStemFade(false), 1500)
      })
    }, 300)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!questionText.trim()) { setError(t('questions.questionRequired')); return }

    if (needsOptions) {
      if (options.some((o) => !o.trim())) { setError(t('questions.optionsRequired')); return }
      if (isSingle && (typeof correctAnswer !== 'number' || correctAnswer < 0 || correctAnswer >= options.length)) {
        setError(t('questions.correctRequired')); return
      }
      if (isMulti && (!Array.isArray(correctAnswer) || correctAnswer.length === 0)) {
        setError('请至少选择一个正确答案'); return
      }
    }

    if (isJudgeCorrect && correctAnswer !== true && !String(correctAnswer).trim()) {
      setError('请填写修正后的正确表述'); return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        question_type: questionType,
        question_text: questionText.trim(),
        options: options.map((o) => o.trim()),
        correct_answer: correctAnswer,
        answer_explanation: null,
        category: categories[0] ?? null,
        categories,
        subject: subject.trim() || null,
        analysis: analysis.trim() || null,
        key_points: keyPoints.trim() || null,
        seq_number: seqNumber ? Number(seqNumber) : null,
      })
    } catch {
      setError(t('questions.saveFailed'))
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — question content */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t('questions.questionText')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <MarkdownEditor
                  value={questionText}
                  onChange={setQuestionText}
                  placeholder={t('questions.questionPlaceholder')}
                  minHeight="160px"
                />
                {hasAiConfig() && (
                  <div className="absolute right-1 bottom-1 flex gap-0.5">
                    {prevQuestionTextRef.current && (
                      <Button type="button" variant="ghost" size="icon"
                        className="h-7 w-7"
                        onClick={() => { setQuestionText(prevQuestionTextRef.current!); prevQuestionTextRef.current = null }}
                        title="还原"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7"
                      disabled={stemExtracting || !questionText.trim()}
                      onClick={handleExtractStem}
                      title="AI 提取题干"
                    >
                      <Sparkles className={`h-3.5 w-3.5 ${stemExtracting ? 'animate-pulse' : ''}`} />
                    </Button>
                  </div>
                )}
                {(stemGlow || stemFade) && (
                  <div className={cn(
                    'absolute inset-0 rounded-lg pointer-events-none transition-[border-color,box-shadow] duration-1000',
                    stemGlow && '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]',
                    stemFade && 'border-2 border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
                  )} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Options (choice types) */}
          {isChoiceType && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{t('questions.optionLabel')}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isSingle ? t('questions.correctHint') : '勾选所有正确答案'}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5 mr-1" />添加选项
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {options.map((opt, index) => {
                  const isChecked = isSingle
                    ? correctAnswer === index
                    : Array.isArray(correctAnswer) && (correctAnswer as number[]).includes(index)
                  return (
                    <div key={index} className="flex items-center gap-3 group">
                      <button
                        type="button"
                        onClick={() => isSingle ? setCorrectAnswer(index) : toggleMultiAnswer(index)}
                        className={cn(
                          'shrink-0 w-8 h-8 rounded-md border-2 flex items-center justify-center transition-colors',
                          isChecked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30 hover:border-primary/50',
                          isSingle && 'rounded-full',
                        )}
                      >
                        {isChecked && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <span className="text-xs font-semibold text-muted-foreground w-5 text-center shrink-0">
                        {OPTION_LABELS[index]}
                      </span>
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(index, e.target.value)}
                        placeholder={`选项 ${OPTION_LABELS[index]}`}
                        className="flex-1"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={options.length <= 2}
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* True/False */}
          {isTrueFalse && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">正确答案</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant={correctAnswer === true ? 'default' : 'outline'}
                    className={cn('h-12 text-sm font-medium', correctAnswer === true && 'bg-green-600 hover:bg-green-700')}
                    onClick={() => setCorrectAnswer(true)}>
                    <Check className="h-4 w-4 mr-1.5" />正确
                  </Button>
                  <Button type="button" variant={correctAnswer === false ? 'default' : 'outline'}
                    className={cn('h-12 text-sm font-medium', correctAnswer === false && 'bg-red-600 hover:bg-red-700')}
                    onClick={() => setCorrectAnswer(false)}>错误</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Judge Correct */}
          {isJudgeCorrect && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">判断对错</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant={correctAnswer === true ? 'default' : 'outline'}
                    className={cn('h-12 text-sm font-medium', correctAnswer === true && 'bg-green-600 hover:bg-green-700')}
                    onClick={() => setCorrectAnswer(true)}>
                    <Check className="h-4 w-4 mr-1.5" />正确
                  </Button>
                  <Button type="button" variant={correctAnswer !== true ? 'default' : 'outline'}
                    className={cn('h-12 text-sm font-medium', correctAnswer !== true && 'bg-red-600 hover:bg-red-700')}
                    onClick={() => setCorrectAnswer('')}>错误</Button>
                </div>
                {correctAnswer !== true && (
                  <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                    <Label htmlFor="correction" className="text-destructive">修正后的正确表述</Label>
                    <Input id="correction" value={typeof correctAnswer === 'string' ? correctAnswer : ''}
                      onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="输入修正后的正确表述，例如：将XX改为YY" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Fill blank / Short answer */}
          {(isFillBlank || isShortAnswer) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{isFillBlank ? '预期答案' : '可接受答案'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isFillBlank && (
                  <Input value={typeof correctAnswer === 'string' ? correctAnswer : ''}
                    onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="预期的正确答案" />
                )}
                {isShortAnswer && (
                  <Textarea value={Array.isArray(correctAnswer) ? correctAnswer.join('\n') : typeof correctAnswer === 'string' ? correctAnswer : ''}
                    onChange={(e) => setCorrectAnswer(e.target.value.split('\n').filter(Boolean))}
                    placeholder="每行一个可接受的答案（关键词匹配）" rows={4} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Analysis question — reference answer */}
          {isAnalysis && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">参考解析</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={analysis}
                  onChange={(e) => setAnalysis(e.target.value)}
                  placeholder="输入参考答案或解析思路..."
                  rows={5}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — metadata */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="space-y-2 flex-1">
                  <Label>题目类型</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between text-sm font-normal">
                        {QUESTION_TYPE_LABELS[questionType]}
                        <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                      {QUESTION_TYPE_OPTIONS.map((o) => (
                        <DropdownMenuItem key={o.value} onClick={() => handleTypeChange(o.value)}>
                          {QUESTION_TYPE_LABELS[o.value]}
                          {questionType === o.value && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2 w-20">
                  <Label>编号</Label>
                  <Input type="number" value={seqNumber} onChange={(e) => setSeqNumber(e.target.value)}
                    placeholder="#" className="text-sm text-center" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">{t('questions.subject')} <span className="text-muted-foreground font-normal">(选填)</span></Label>
                <div className="relative">
                  <Input id="subject" value={subject} onChange={(e) => { setSubject(e.target.value); setSubjectOpen(true) }}
                    onFocus={() => setSubjectOpen(true)} onBlur={() => setTimeout(() => setSubjectOpen(false), 150)}
                    placeholder={t('questions.subjectPlaceholder')} autoComplete="off" />
                  {subject && <button type="button" onClick={() => setSubject('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                  {subjectOpen && subjectFiltered.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md">
                      {subjectFiltered.map((s) => (
                        <button key={s} type="button" className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent first:rounded-t-md last:rounded-b-md"
                          onMouseDown={() => { setSubject(s); setSubjectOpen(false) }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">{t('questions.categoryLabel')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      {c}
                      <button type="button" onClick={() => setCategories((prev) => prev.filter((x) => x !== c))} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative">
                  <Input id="category" value={categoryInput} onChange={(e) => { setCategoryInput(e.target.value); setCategoryOpen(true) }}
                    onFocus={() => setCategoryOpen(true)} onBlur={() => setTimeout(() => setCategoryOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = categoryInput.trim()
                        if (v && !categories.includes(v)) setCategories((prev) => [...prev, v])
                        setCategoryInput('')
                      }
                    }}
                    placeholder="如：2022年真题, 2023年真题" autoComplete="off" />
                  {categoryInput && <button type="button" onClick={() => setCategoryInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                  {categoryOpen && categoryFiltered.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md">
                      {categoryFiltered.map((c) => (
                        <button key={c} type="button" className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent first:rounded-t-md last:rounded-b-md"
                          onMouseDown={() => { setCategories((prev) => prev.includes(c) ? prev : [...prev, c]); setCategoryInput(''); setCategoryOpen(false) }}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4 cursor-pointer select-none"
              onClick={() => setAnalysisOpen(!analysisOpen)}>
              <CardTitle className="text-sm flex items-center justify-between">
                {t('questions.analysis')} & {t('questions.keyPoints')}
                <span className="text-muted-foreground text-xs">{analysisOpen ? '▾' : '▸'}</span>
              </CardTitle>
            </CardHeader>
            {analysisOpen && (
              <CardContent className="pb-3 px-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('questions.analysis')} (选填)</Label>
                  <Textarea id="analysis" value={analysis} onChange={(e) => setAnalysis(e.target.value)}
                    placeholder={t('questions.analysisPlaceholder')} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('questions.keyPoints')} (选填)</Label>
                  <div className="relative">
                    <Input id="keyPoints" value={keyPoints}
                      onChange={(e) => { setKeyPoints(e.target.value); setKeyPointsOpacity(1); setKeyPointsAnimating(false) }}
                      placeholder={t('questions.keyPointsPlaceholder')}
                      className={cn('pr-10 transition-all duration-500',
                        keyPointsGlow && '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]',
                        keyPointsFade && 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
                        keyPointsAnimating && 'text-transparent select-none',
                      )}
                      style={keyPointsAnimating ? undefined : { opacity: keyPointsOpacity }} />
                    {keyPointsAnimating && (
                      <div className="absolute inset-0 flex items-center px-3 pr-10 pointer-events-none overflow-hidden text-sm" aria-hidden="true">
                        <span className="whitespace-pre">
                          {[...keyPoints].map((ch, i) => (
                            <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.03}s` }}>{ch}</span>
                          ))}
                        </span>
                      </div>
                    )}
                    {hasAiConfig() && isEnabled('keypoints') && (
                      <Button type="button" variant="ghost" size="icon"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                        disabled={keyPointsLoading}
                        onClick={async () => {
                          if (!questionText.trim()) return
                          setKeyPointsGlow(true); setKeyPointsLoading(true); setKeyPointsAnimating(true); setKeyPoints('')
                          try {
                            let answerStr = ''
                            if (isChoiceType && typeof correctAnswer === 'number') answerStr = options[correctAnswer] ?? ''
                            else if (isChoiceType && Array.isArray(correctAnswer)) answerStr = (correctAnswer as number[]).map(i => options[i]).join('、')
                            else if (isTrueFalse) answerStr = correctAnswer ? '正确' : '错误'
                            else if (isJudgeCorrect) answerStr = correctAnswer === true ? '正确' : `修正：${correctAnswer}`
                            else if (typeof correctAnswer === 'string') answerStr = correctAnswer
                            else if (Array.isArray(correctAnswer)) answerStr = correctAnswer.join('；')
                            const result = await generateKeyPoints({
                              questionText: questionText.trim(),
                              questionType: QUESTION_TYPE_LABELS[questionType] || questionType,
                              options: isChoiceType ? options.filter(o => o.trim()) : undefined,
                              correctAnswer: answerStr || undefined,
                              analysis: analysis.trim() || undefined,
                            })
                            if (typewriterRef.current.timer) clearTimeout(typewriterRef.current.timer)
                            const len = result.length; setKeyPointsOpacity(0.3); let i = 0
                            const tick = () => {
                              i++; const progress = Math.min(i / Math.max(len, 1), 1)
                              setKeyPoints(result.slice(0, i)); setKeyPointsOpacity(0.3 + progress * 0.7)
                              if (i >= len) { typewriterRef.current.timer = null; setKeyPointsOpacity(1); setTimeout(() => { setKeyPointsFade(true); requestAnimationFrame(() => { setKeyPointsGlow(false); setTimeout(() => { setKeyPointsFade(false); setKeyPointsAnimating(false) }, 1500) }) }, 500); return }
                              const ch = result[i]; const baseDelay = 25; const randomDelay = Math.random() * 55; const punctDelay = /[，,。；;、]/.test(ch) ? 80 : 0
                              typewriterRef.current.timer = setTimeout(tick, baseDelay + randomDelay + punctDelay)
                            }
                            typewriterRef.current.timer = setTimeout(tick, 60)
                          } catch { /* ignore */ }
                          setKeyPointsLoading(false)
                        }}
                        title="AI 生成知识点">
                        <Sparkles className={cn('h-4 w-4', keyPointsLoading && 'animate-pulse')} />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>{t('questions.cancel')}</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><span className="h-4 w-4 mr-1 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('questions.saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{initialData ? t('questions.update') : t('questions.create')}</>}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
