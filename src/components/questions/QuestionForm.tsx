import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Plus, Trash2, Check, ChevronDown, RotateCcw, Sparkles, Save, X, Wand2,
} from 'lucide-react'
import { OPTION_LABELS, QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS, CASE_SUB_TYPE_OPTIONS } from '@/lib/constants'
import { getDefaultAnswer } from '@/lib/answer-utils'
import type { Question, QuestionType, CorrectAnswer, CaseQuestion, TestCase, RuntimeConfig, ExampleCase } from '@/types'
import { generateKeyPoints, hasAiConfig, DeepSeekParser } from '@/lib/ai'
import { getAiConfig } from '@/lib/ai/config'
import { useSettingsStore } from '@/stores/settings-store'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useT } from '@/i18n/use-t'
import { cn, normalizeChineseText } from '@/lib/utils'

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
  const [verified, setVerified] = useState(initialData?.verified ?? false)
  const [issueFlag, setIssueFlag] = useState<'none' | 'suspected' | 'confirmed'>(initialData?.issue_flag ?? 'none')
  const [issueNote, setIssueNote] = useState(initialData?.issue_note ?? '')
  const [allowUnordered, setAllowUnordered] = useState(initialData?.allow_unordered ?? false)
  const [unorderedBlanks, setUnorderedBlanks] = useState<number[]>(initialData?.unordered_blanks ?? [])
  const [analysisOpen, setAnalysisOpen] = useState(true)
  const analysisRef = useRef<HTMLTextAreaElement>(null)
  const questionTextRef = useRef<HTMLTextAreaElement>(null)
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

  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [newSubjectInput, setNewSubjectInput] = useState('')
  const [allKeyPoints, setAllKeyPoints] = useState<string[]>([])

  const availableSubjects = subject && !subjects.includes(subject)
    ? [...subjects, subject].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    : [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN'))

  // Fetch key points filtered by subject
  useEffect(() => {
    supabase.rpc('get_question_meta', { p_subject: subject || null }).then(({ data, error }: { data: { key_points: string[] } | null; error: unknown }) => {
      if (!error && data?.key_points) setAllKeyPoints(data.key_points)
      else setAllKeyPoints([])
    })
  }, [subject])

  // Update filtered categories when subject changes
  useEffect(() => {
    updateFilteredCategories(subject)
  }, [subject, updateFilteredCategories])

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
  const isCoding = questionType === 'coding'

  const [testCases, setTestCases] = useState<TestCase[]>(
    initialData?.test_cases?.length ? initialData.test_cases : [{ input: '', expected: '' }],
  )
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(
    initialData?.runtime_config ?? { timeout_ms: 2000, memory_mb: 256 },
  )
  const [executionMode, setExecutionMode] = useState<'stdio' | 'function'>(
    initialData?.execution_mode ?? 'stdio',
  )
  const [examples, setExamples] = useState<ExampleCase[]>(
    initialData?.examples?.length ? initialData.examples : [],
  )

  // === 案例分析题: 正文题干为案例材料, 小题列表存于 case_questions ===
  const isCaseAnalysis = questionType === 'case_analysis'
  const [caseQuestions, setCaseQuestions] = useState<CaseQuestion[]>(
    initialData?.case_questions?.length
      ? initialData.case_questions.map((c) => ({
          ...c,
          options: [...(c.options ?? [])],
          answer: c.answer ?? getDefaultAnswer(c.type),
        }))
      : [],
  )
  const newSubId = () =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

  const defaultSubAnswer = (subType: QuestionType): CorrectAnswer => {
    switch (subType) {
      case 'single_choice': return 0
      case 'multi_select': return []
      case 'true_false': return true
      case 'judge_correct': return true
      case 'fill_blank': return [] as string[]
      case 'short_answer': return [] as string[]
      default: return 0
    }
  }

  const newBlankSub = (subType: QuestionType = 'single_choice'): CaseQuestion => ({
    id: newSubId(),
    type: subType,
    text: '',
    options: subType === 'single_choice' || subType === 'multi_select' ? ['', ''] : [],
    answer: defaultSubAnswer(subType),
  })

  const patchSub = (id: string, patch: Partial<CaseQuestion>) =>
    setCaseQuestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addSub = (subType: QuestionType = 'single_choice') =>
    setCaseQuestions((prev) => [...prev, newBlankSub(subType)])
  const removeSub = (id: string) =>
    setCaseQuestions((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))
  const changeSubType = (id: string, subType: QuestionType) => {
    const sub = caseQuestions.find((s) => s.id === id)
    if (!sub || sub.type === subType) return
    const choice = subType === 'single_choice' || subType === 'multi_select'
    const wasChoice = sub.type === 'single_choice' || sub.type === 'multi_select'
    setCaseQuestions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              type: subType,
              options: choice ? (wasChoice && s.options.length >= 2 ? s.options : ['', '']) : [],
              answer: defaultSubAnswer(subType),
            }
          : s,
      ),
    )
  }
  const patchSubOptions = (id: string, index: number, value: string) =>
    setCaseQuestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, options: s.options.map((o, i) => (i === index ? value : o)) } : s)),
    )
  const addSubOption = (id: string) =>
    setCaseQuestions((prev) => prev.map((s) => (s.id === id ? { ...s, options: [...s.options, ''] } : s)))
  const removeSubOption = (id: string, index: number) =>
    setCaseQuestions((prev) =>
      prev.map((s) => {
        if (s.id !== id || s.options.length <= 2) return s
        const options = s.options.filter((_, i) => i !== index)
        let answer = s.answer
        if (s.type === 'single_choice' && typeof answer === 'number') {
          if (answer === index) answer = 0
          else if (answer > index) answer = answer - 1
        }
        if (s.type === 'multi_select' && Array.isArray(answer)) {
          const arr = answer as number[]
          answer = arr.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
        }
        return { ...s, options, answer }
      }),
    )
  const setSubSingleAnswer = (id: string, index: number) => patchSub(id, { answer: index })
  const toggleSubMultiAnswer = (id: string, index: number) =>
    setCaseQuestions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const cur = Array.isArray(s.answer) ? (s.answer as number[]) : []
        const next = cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index]
        return { ...s, answer: next }
      }),
    )
  const patchSubText = (id: string, value: string) => {
    const sub = caseQuestions.find((s) => s.id === id)
    if (!sub) return
    patchSub(id, { text: value })
    // 填空题: 空数变化时同步答案数组长度
    if (sub.type === 'fill_blank') {
      const n = Math.max(1, (value.match(/_{2,}/g) || []).length)
      const arr = Array.isArray(sub.answer) ? (sub.answer as string[]) : []
      if (arr.length !== n) {
        const next = Array.from({ length: n }, (_, i) => arr[i] ?? '')
        setCaseQuestions((prev) => prev.map((s) => (s.id === id ? { ...s, answer: next } : s)))
      }
    }
  }
  const patchSubFill = (id: string, index: number, value: string) =>
    setCaseQuestions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const arr = [...(Array.isArray(s.answer) ? (s.answer as string[]) : [])]
        arr[index] = value
        return { ...s, answer: arr }
      }),
    )
  const patchSubShort = (id: string, value: string) => patchSub(id, { answer: value.split('\n').filter(Boolean) })

  const validCaseQuestions = (): string | null => {
    if (caseQuestions.length === 0) return '请至少添加一个小题'
    for (const sub of caseQuestions) {
      if (!sub.text.trim()) return '存在小题未填写小问内容'
      const choice = sub.type === 'single_choice' || sub.type === 'multi_select'
      if (choice) {
        if (sub.options.length < 2 || sub.options.some((o) => !o.trim())) return '选择题小题需要至少两个非空选项'
        if (sub.type === 'single_choice' && (typeof sub.answer !== 'number' || sub.answer < 0 || sub.answer >= sub.options.length))
          return '请为每个单选题小题标记正确答案'
        if (sub.type === 'multi_select' && (!Array.isArray(sub.answer) || sub.answer.length === 0)) return '请为每个多选题小题至少勾选一个正确答案'
      }
      if (sub.type === 'judge_correct' && sub.answer !== true && !String(sub.answer).trim()) return '判断改错小题标记错误时需填写修正表述'
      if (sub.type === 'fill_blank' && Array.isArray(sub.answer) && sub.answer.some((a) => !String(a).trim())) return '存在填空题小题未填答案'
      if (sub.type === 'short_answer' && Array.isArray(sub.answer) && sub.answer.length === 0) return '存在简答题小题未填可接受答案'
    }
    return null
  }

  const handleTypeChange = (t: QuestionType) => {
    setQuestionType(t)
    setCorrectAnswer(getDefaultAnswer(t))
    setAllowUnordered(false)
    if (t === 'true_false') setOptions(['正确', '错误'])
    else if (t === 'judge_correct' || t === 'fill_blank' || t === 'short_answer' || t === 'analysis' || t === 'coding') setOptions([])
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
            system: '你是一个题目格式化助手。你的任务是保留题目的完整题干内容，只删除选项部分和分析/解析部分。\n\n规则：\n1. 保留题干的所有正文叙述，一字不改，包括背景材料、情境描述、设问句等\n2. 删除以 A. B. C. D. 或 ①②③④ 等编号开头的选项行\n3. 删除"解析："、"分析："、"答案："等开头的解析内容\n4. 直接输出完整题干，不要总结、缩写或添加任何说明',
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

  const insertAtCursor = (text: string) => {
    const el = questionTextRef.current
    if (!el) return setQuestionText((prev) => prev + text)
    const start = el.selectionStart; const end = el.selectionEnd
    const before = questionText.slice(0, start); const after = questionText.slice(end)
    const next = before + text + after
    setQuestionText(next)
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + text.length; el.focus() })
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

    if (isCaseAnalysis) {
      const subErr = validCaseQuestions()
      if (subErr) { setError(subErr); return }
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
        verified,
        issue_flag: issueFlag,
        issue_note: issueFlag === 'none' ? null : (issueNote.trim() || null),
        flagged_at: issueFlag === 'none' ? null : (initialData?.flagged_at ?? new Date().toISOString()),
        allow_unordered: allowUnordered,
        unordered_blanks: unorderedBlanks.length > 0 && unorderedBlanks[0] !== -1 ? unorderedBlanks : null,
        import_mode: initialData?.import_mode ?? 'manual',
        source_page: initialData?.source_page ?? null,
        test_cases: isCoding ? testCases : undefined,
        runtime_config: isCoding ? runtimeConfig : undefined,
        execution_mode: isCoding ? executionMode : undefined,
        examples: isCoding ? examples : undefined,
        case_questions: isCaseAnalysis
          ? caseQuestions.map((sub) => ({
              ...sub,
              text: sub.text.trim(),
              options: (sub.options ?? []).map((o) => o.trim()),
            }))
          : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Save question failed:', err)
      setError(`${t('questions.saveFailed')}: ${msg}`)
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
            <CardContent className="space-y-2">
              <MarkdownEditor
                textareaRef={questionTextRef}
                value={questionText}
                onChange={setQuestionText}
                placeholder={t('questions.questionPlaceholder')}
                extraToolbarButtons={
                  <>
                    <span className="text-muted-foreground/40 text-xs mx-0.5">|</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground text-xs font-mono"
                      title="插入下划线" onClick={() => insertAtCursor('___')}>_</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground text-xs"
                      title="插入「」" onClick={() => insertAtCursor('「」')}>「」</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground text-xs"
                      title="插入『』" onClick={() => insertAtCursor('『』')}>『』</Button>
                  </>
                }
                bottomButtons={
                  <>
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7"
                      disabled={!questionText.trim()}
                      onClick={() => setQuestionText(normalizeChineseText(questionText))}
                      title="文字标准化"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                    </Button>
                    {hasAiConfig() && (
                      <>
                        {prevQuestionTextRef.current && (
                          <Button type="button" variant="ghost" size="icon"
                            className="h-7 w-7"
                            onClick={() => { setQuestionText(prevQuestionTextRef.current!); prevQuestionTextRef.current = null }}
                            title="还原"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
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
                      </>
                    )}
                  </>
                }
                overlay={
                  (stemGlow || stemFade) ? (
                    <div className={cn(
                      'absolute inset-0 rounded-lg pointer-events-none transition-[border-color,box-shadow] duration-1000',
                      stemGlow && '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]',
                      stemFade && 'border-2 border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
                    )} />
                  ) : undefined
                }
              />
            </CardContent>
          </Card>

          {/* Case analysis: 正文题干即案例材料, 此处维护若干共用材料的小题 */}
          {isCaseAnalysis && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">案例分析小题</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">每个小题共用上方案例材料, 作答时逐个小题判分、按小题展开计分</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addSub()}>
                    <Plus className="h-3.5 w-3.5 mr-1" />添加小题
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {caseQuestions.length === 0 && (
                  <p className="text-sm text-muted-foreground">还没有小题, 点击右上角「添加小题」开始编写。</p>
                )}
                {caseQuestions.map((sub, si) => {
                  const choice = sub.type === 'single_choice' || sub.type === 'multi_select'
                  const subIsSingle = sub.type === 'single_choice'
                  const blanksN = sub.type === 'fill_blank'
                    ? Math.max(1, (sub.text.match(/_{2,}/g) || []).length)
                    : 0
                  return (
                    <div key={sub.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">第 {si + 1} 小题</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                              {QUESTION_TYPE_LABELS[sub.type]}
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {CASE_SUB_TYPE_OPTIONS.map((o) => (
                              <DropdownMenuItem key={o.value} onClick={() => changeSubType(sub.id, o.value)}>
                                {QUESTION_TYPE_LABELS[o.value]}
                                {sub.type === o.value && <Check className="h-4 w-4 ml-auto" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={caseQuestions.length <= 1}
                          onClick={() => removeSub(sub.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <Textarea
                        value={sub.text}
                        onChange={(e) => patchSubText(sub.id, e.target.value)}
                        placeholder="小问内容, 如: 结合材料, 分析小米 2016 年陷入低谷的原因"
                        className="text-sm min-h-[56px]"
                      />

                      {choice && (
                        <div className="space-y-1.5 pt-0.5">
                          {sub.options.map((opt, oi) => {
                            const checked = subIsSingle
                              ? sub.answer === oi
                              : Array.isArray(sub.answer) && (sub.answer as number[]).includes(oi)
                            return (
                              <div key={oi} className="flex items-center gap-2 group">
                                <button
                                  type="button"
                                  onClick={() => subIsSingle ? setSubSingleAnswer(sub.id, oi) : toggleSubMultiAnswer(sub.id, oi)}
                                  className={cn(
                                    'shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors',
                                    checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50',
                                    subIsSingle && 'rounded-full',
                                  )}
                                >
                                  {checked && <Check className="h-3.5 w-3.5" />}
                                </button>
                                <span className="text-xs font-semibold text-muted-foreground w-4 text-center shrink-0">{OPTION_LABELS[oi]}</span>
                                <Input
                                  value={opt}
                                  onChange={(e) => patchSubOptions(sub.id, oi, e.target.value)}
                                  placeholder={`选项 ${OPTION_LABELS[oi]}`}
                                  className="flex-1 h-8 text-sm"
                                />
                                <Button
                                  type="button" variant="ghost" size="icon"
                                  className="shrink-0 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  disabled={sub.options.length <= 2}
                                  onClick={() => removeSubOption(sub.id, oi)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </div>
                            )
                          })}
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addSubOption(sub.id)}>
                            <Plus className="h-3 w-3 mr-1" />添加选项
                          </Button>
                        </div>
                      )}

                      {(sub.type === 'true_false') && (
                        <div className="flex gap-2 pt-0.5">
                          {[true, false].map((v) => (
                            <Button key={String(v)} type="button" size="sm"
                              variant={sub.answer === v ? 'default' : 'outline'}
                              className={cn('h-8 flex-1 text-sm', sub.answer === v && v && 'bg-green-600 hover:bg-green-700', sub.answer === v && !v && 'bg-red-600 hover:bg-red-700')}
                              onClick={() => patchSub(sub.id, { answer: v })}
                            >
                              {v ? '正确' : '错误'}
                            </Button>
                          ))}
                        </div>
                      )}

                      {sub.type === 'judge_correct' && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex gap-2">
                            <Button type="button" size="sm"
                              variant={sub.answer === true ? 'default' : 'outline'}
                              className={cn('h-8 flex-1 text-sm', sub.answer === true && 'bg-green-600 hover:bg-green-700')}
                              onClick={() => patchSub(sub.id, { answer: true })}
                            >正确</Button>
                            <Button type="button" size="sm"
                              variant={sub.answer !== true ? 'default' : 'outline'}
                              className={cn('h-8 flex-1 text-sm', sub.answer !== true && 'bg-red-600 hover:bg-red-700')}
                              onClick={() => patchSub(sub.id, { answer: '' })}
                            >错误</Button>
                          </div>
                          {sub.answer !== true && (
                            <Input
                              value={typeof sub.answer === 'string' ? sub.answer : ''}
                              onChange={(e) => patchSub(sub.id, { answer: e.target.value })}
                              placeholder="修正后的正确表述"
                              className="h-8 text-sm"
                            />
                          )}
                        </div>
                      )}

                      {sub.type === 'fill_blank' && (
                        <div className="space-y-1 pt-0.5">
                          {Array.from({ length: blanksN }).map((_, bi) => {
                            const arr = Array.isArray(sub.answer) ? (sub.answer as string[]) : []
                            return (
                              <div key={bi} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground shrink-0 w-10">第{bi + 1}空</span>
                                <Input
                                  value={arr[bi] ?? ''}
                                  onChange={(e) => patchSubFill(sub.id, bi, e.target.value)}
                                  placeholder={`答案${bi + 1}; 近似答案用; 分隔`}
                                  className="h-8 text-sm"
                                />
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {sub.type === 'short_answer' && (
                        <Textarea
                          value={Array.isArray(sub.answer) ? (sub.answer as string[]).join('\n') : ''}
                          onChange={(e) => patchSubShort(sub.id, e.target.value)}
                          placeholder="每行一个可接受的答案 (关键词包含即判对)"
                          rows={2}
                          className="text-sm"
                        />
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

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
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-3.5 w-3.5 mr-1" />添加选项
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      className="h-7 text-xs"
                      disabled={options.every(o => !o.trim())}
                      onClick={() => setOptions(options.map(normalizeChineseText))}
                      title="标准化全部选项文字"
                    >
                      <Wand2 className="h-3 w-3 mr-1" />标准化
                    </Button>
                  </div>
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
                {isFillBlank && (() => {
                  const blankCount = (questionText.match(/_{2,}/g) || ['___']).length
                  const answers = Array.isArray(correctAnswer) ? correctAnswer as string[] : blankCount > 1 ? [] : [String(correctAnswer ?? '')]
                  return (
                    <>
                      <div className="space-y-2">
                        {Array.from({ length: blankCount }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground shrink-0 w-10">第{i + 1}空</span>
                            <Input value={answers[i] || ''}
                              onChange={(e) => {
                                const next = [...answers]
                                next[i] = e.target.value
                                setCorrectAnswer(blankCount > 1 ? next : next[0] || '')
                              }}
                              placeholder={`答案${i + 1}；多个近似答案用；分隔`}
                            />
                          </div>
                        ))}
                        <p className="text-[11px] text-muted-foreground">多个近似答案用分号（；）分隔，如：React；React.js；ReactJS</p>
                      </div>
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm">允许无序答案</Label>
                            <p className="text-xs text-muted-foreground">启用后，所选空的答案顺序不影响判分</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm"
                              className="h-7 text-xs"
                              disabled={answers.every(a => !a)}
                              onClick={() => {
                                const normalized = answers.map(normalizeChineseText)
                                setCorrectAnswer(blankCount > 1 ? normalized : normalized[0] || '')
                              }}
                            >
                              <Wand2 className="h-3 w-3 mr-1" />标准化
                            </Button>
                            <Switch checked={allowUnordered} onCheckedChange={(v) => { setAllowUnordered(v); if (!v) setUnorderedBlanks([]) }} />
                          </div>
                        </div>
                        {allowUnordered && blankCount > 1 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">无序空位：</span>
                            <button
                              type="button"
                              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${unorderedBlanks.length === 0 && unorderedBlanks[0] !== -1 ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                              onClick={() => setUnorderedBlanks(unorderedBlanks[0] === -1 ? [] : [-1])}
                            >全选</button>
                            {Array.from({ length: blankCount }).map((_, i) => {
                              const label = (answers[i] || '').split(/[;；]/)[0]?.trim() || `空${i + 1}`
                              const isAll = unorderedBlanks.length === 0
                              const isNone = unorderedBlanks[0] === -1
                              const on = isAll || unorderedBlanks.includes(i)
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  className={`text-[10px] px-2 h-5 rounded border transition-colors truncate max-w-[80px] ${on ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                                  title={answers[i] || `空${i + 1}`}
                                  onClick={() => {
                                    if (isAll) {
                                      setUnorderedBlanks(Array.from({ length: blankCount }, (_, j) => j).filter(j => j !== i))
                                    } else if (isNone) {
                                      setUnorderedBlanks([i])
                                    } else if (unorderedBlanks.includes(i)) {
                                      const next = unorderedBlanks.filter(j => j !== i)
                                      setUnorderedBlanks(next.length === 0 ? [-1] : next.length === blankCount ? [] : next)
                                    } else {
                                      const next = [...unorderedBlanks, i].sort((a, b) => a - b)
                                      setUnorderedBlanks(next.length === blankCount ? [] : next)
                                    }
                                  }}
                                >{label}</button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
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

          {/* Coding — test cases */}
          {isCoding && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">评测配置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={executionMode === 'stdio' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setExecutionMode('stdio')}
                  >
                    stdin/stdout 模式
                  </Button>
                  <Button
                    type="button"
                    variant={executionMode === 'function' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setExecutionMode('function')}
                  >
                    函数调用模式
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {executionMode === 'function'
                    ? '用户定义 function solution(...)，测试用例 input 为 JSON 参数数组，框架自动调用并比对返回值。'
                    : '用户使用 input()/console.log 读写标准输入输出，测试用例比对 stdout。'}
                </p>
                <div className="flex gap-4 items-end">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs">超时 (ms)</Label>
                    <Input
                      type="number"
                      value={runtimeConfig.timeout_ms ?? 2000}
                      onChange={(e) => setRuntimeConfig({ ...runtimeConfig, timeout_ms: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs">内存限制 (MB)</Label>
                    <Input
                      type="number"
                      value={runtimeConfig.memory_mb ?? 256}
                      onChange={(e) => setRuntimeConfig({ ...runtimeConfig, memory_mb: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {testCases.map((tc, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-xs text-muted-foreground w-5 pt-2.5">#{i + 1}</span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={tc.input}
                        onChange={(e) => {
                          const next = [...testCases]
                          next[i] = { ...next[i], input: e.target.value }
                          setTestCases(next)
                        }}
                        placeholder="输入 (stdin)"
                        className="text-xs font-mono"
                      />
                      <Input
                        value={tc.expected}
                        onChange={(e) => {
                          const next = [...testCases]
                          next[i] = { ...next[i], expected: e.target.value }
                          setTestCases(next)
                        }}
                        placeholder="期望输出 (stdout)"
                        className="text-xs font-mono"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 mt-1"
                      onClick={() => setTestCases(testCases.filter((_, j) => j !== i))}
                      disabled={testCases.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTestCases([...testCases, { input: '', expected: '' }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  添加测试用例
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Coding — visible examples (LeetCode-style Example 1/2/3) */}
          {isCoding && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">题目示例（对用户可见）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {examples.map((ex, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-xs text-muted-foreground w-5 pt-2.5">#{i + 1}</span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={ex.input}
                        onChange={(e) => {
                          const next = [...examples]
                          next[i] = { ...next[i], input: e.target.value }
                          setExamples(next)
                        }}
                        placeholder="JSON 参数，如 [[2,7,11,15],9]"
                        className="text-xs font-mono"
                      />
                      <Input
                        value={ex.expected}
                        onChange={(e) => {
                          const next = [...examples]
                          next[i] = { ...next[i], expected: e.target.value }
                          setExamples(next)
                        }}
                        placeholder="期望输出，如 [0,1]"
                        className="text-xs font-mono"
                      />
                      <Input
                        value={ex.explanation || ''}
                        onChange={(e) => {
                          const next = [...examples]
                          next[i] = { ...next[i], explanation: e.target.value || undefined }
                          setExamples(next)
                        }}
                        placeholder="解释（可选），如 因为 nums[0] + nums[1] == 9"
                        className="text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 mt-1"
                      onClick={() => setExamples(examples.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExamples([...examples, { input: '', expected: '' }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  添加示例
                </Button>
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

              <div className="flex items-center justify-between pt-1">
                <div>
                  <Label className="text-sm">人工验证</Label>
                  <p className="text-xs text-muted-foreground">标记该题目已通过人工审核</p>
                </div>
                <Switch checked={verified} onCheckedChange={setVerified} />
              </div>

              <div className="space-y-2 pt-1 border-t">
                <Label className="text-sm">问题标记</Label>
                <p className="text-xs text-muted-foreground">发现题目有错但来不及修改时,先打标待处理</p>
                <div className="flex gap-1.5">
                  {([['none', '无'], ['suspected', '疑似有错'], ['confirmed', '已确认有错']] as const).map(([val, label]) => (
                    <Button key={val} type="button" size="sm" variant={issueFlag === val ? 'default' : 'outline'}
                      className={issueFlag === 'suspected' && issueFlag === val ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : issueFlag === 'confirmed' && issueFlag === val ? 'bg-red-500 hover:bg-red-600 text-white border-red-500' : ''}
                      onClick={() => setIssueFlag(val)}>
                      {label}
                    </Button>
                  ))}
                </div>
                {issueFlag !== 'none' && (
                  <Textarea value={issueNote} onChange={(e) => setIssueNote(e.target.value)}
                    placeholder="简要记录问题所在,方便以后修改(如:选项C答案有误 / 解析与答案不符)"
                    className="text-sm min-h-[70px]" />
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('questions.subject')} <span className="text-muted-foreground font-normal">(选填)</span></Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-sm font-normal">
                      {subject || t('questions.subjectPlaceholder')}
                      <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Input value={newSubjectInput} onChange={(e) => setNewSubjectInput(e.target.value)}
                        placeholder="新建学科" className="h-7 text-xs"
                        onKeyDown={(e) => { if (e.key === 'Enter' && newSubjectInput.trim()) { setSubject(newSubjectInput.trim()); setNewSubjectInput('') } }} />
                      <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0"
                        disabled={!newSubjectInput.trim()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => { setSubject(newSubjectInput.trim()); setNewSubjectInput('') }}>新建</Button>
                    </div>
                    <DropdownMenuItem onClick={() => setSubject('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!subject && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    {availableSubjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setSubject(s)}>
                        {s}
                        {subject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2">
                <Label>{t('questions.categoryLabel')}</Label>
                {categories.length > 0 && (
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
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-sm font-normal">
                      {categories.length ? `${categories.length} 个分类` : '选择或新建分类'}
                      <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Input value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)}
                        placeholder="新建分类" className="h-7 text-xs"
                        onKeyDown={(e) => { if (e.key === 'Enter' && categoryInput.trim()) { setCategories((prev) => prev.includes(categoryInput.trim()) ? prev : [...prev, categoryInput.trim()]); setCategoryInput('') } }} />
                      <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0"
                        disabled={!categoryInput.trim()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => { setCategories((prev) => prev.includes(categoryInput.trim()) ? prev : [...prev, categoryInput.trim()]); setCategoryInput('') }}>新建</Button>
                    </div>
                    {filteredCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setCategories((prev) => prev.includes(c) ? prev : [...prev, c])}>
                        {c}
                        {categories.includes(c) && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  <MarkdownEditor
                    textareaRef={analysisRef}
                    value={analysis}
                    onChange={setAnalysis}
                    placeholder={t('questions.analysisPlaceholder')}
                    hideImageTools
                    hidePreview
                    minHeight="100px"
                    extraToolbarButtons={
                      <Button type="button" variant="ghost" size="icon"
                        className="h-7 w-7"
                        disabled={!analysis.trim()}
                        onClick={() => setAnalysis(normalizeChineseText(analysis))}
                        title="文字标准化"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('questions.keyPoints')} (选填)</Label>
                  <div className="relative">
                    <Input id="keyPoints" value={keyPoints}
                      onChange={(e) => { setKeyPoints(e.target.value); setKeyPointsOpacity(1); setKeyPointsAnimating(false) }}
                      placeholder={t('questions.keyPointsPlaceholder')}
                      className={cn('pr-16 transition-all duration-500',
                        keyPointsGlow && '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]',
                        keyPointsFade && 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
                        keyPointsAnimating && 'text-transparent select-none',
                      )}
                      style={keyPointsAnimating ? undefined : { opacity: keyPointsOpacity }} />
                    {keyPointsAnimating && (
                      <div className="absolute inset-0 flex items-center px-3 pr-16 pointer-events-none overflow-hidden text-sm" aria-hidden="true">
                        <span className="whitespace-pre">
                          {[...keyPoints].map((ch, i) => (
                            <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.03}s` }}>{ch}</span>
                          ))}
                        </span>
                      </div>
                    )}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      {allKeyPoints.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="选择已有知识点">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                            {allKeyPoints.map((kp) => (
                              <DropdownMenuItem key={kp} onClick={() => setKeyPoints(kp)}>
                                {kp}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {hasAiConfig() && isEnabled('keypoints') && (
                        <Button type="button" variant="ghost" size="icon"
                          className="h-7 w-7"
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
