import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Plus, Trash2, Check, ChevronDown } from 'lucide-react'
import { OPTION_LABELS, QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { getDefaultAnswer } from '@/lib/answer-utils'
import type { Question, QuestionType, CorrectAnswer } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  initialData?: Question
  onSubmit: (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => Promise<void>
  onCancel: () => void
}

export function QuestionForm({ initialData, onSubmit, onCancel }: Props) {
  const { t } = useT()
  const [questionType, setQuestionType] = useState<QuestionType>(initialData?.question_type ?? 'single_choice')
  const [questionText, setQuestionText] = useState(initialData?.question_text ?? '')
  const [options, setOptions] = useState<string[]>(initialData?.options ?? ['', ''])
  const [correctAnswer, setCorrectAnswer] = useState<CorrectAnswer>(initialData?.correct_answer ?? 0)
  const [answerExplanation, setAnswerExplanation] = useState(initialData?.answer_explanation ?? '')
  const [category, setCategory] = useState(initialData?.category ?? '')
  const [subject, setSubject] = useState(initialData?.subject ?? '')
  const [analysis, setAnalysis] = useState(initialData?.analysis ?? '')
  const [keyPoints, setKeyPoints] = useState(initialData?.key_points ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const needsOptions = questionType === 'single_choice' || questionType === 'multi_select'
  const isChoiceType = needsOptions
  const isSingle = questionType === 'single_choice'
  const isMulti = questionType === 'multi_select'
  const isTrueFalse = questionType === 'true_false'
  const isFillBlank = questionType === 'fill_blank'
  const isShortAnswer = questionType === 'short_answer'
  const isAnalysis = questionType === 'analysis'

  const handleTypeChange = (t: QuestionType) => {
    setQuestionType(t)
    setCorrectAnswer(getDefaultAnswer(t))
    if (t === 'true_false') setOptions(['正确', '错误'])
    else if (t === 'fill_blank' || t === 'short_answer' || t === 'analysis') setOptions([])
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
      setCorrectAnswer(
        correctAnswer.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
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
    const arr = [...correctAnswer]
    const idx = arr.indexOf(index)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(index)
    setCorrectAnswer(arr)
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

    setIsSubmitting(true)
    try {
      await onSubmit({
        question_type: questionType,
        question_text: questionText.trim(),
        options: options.map((o) => o.trim()),
        correct_answer: correctAnswer,
        answer_explanation: answerExplanation.trim() || null,
        category: category.trim() || null,
        subject: subject.trim() || null,
        analysis: analysis.trim() || null,
        key_points: keyPoints.trim() || null,
      })
    } catch {
      setError(t('questions.saveFailed'))
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Question type selector */}
      <div className="space-y-2">
        <Label>题目类型</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between text-sm font-normal">
              {QUESTION_TYPE_LABELS[questionType]}
              <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
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

      {/* Question text */}
      <div className="space-y-2">
        <Label htmlFor="questionText">{t('questions.questionText')}</Label>
        <Textarea
          id="questionText"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder={t('questions.questionPlaceholder')}
          rows={3}
        />
      </div>

      {/* Subject & Category */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject">{t('questions.subject')}</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('questions.subjectPlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">{t('questions.categoryLabel')}</Label>
          <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('questions.categoryPlaceholder')} />
        </div>
      </div>

      {/* Options section (choice types only) */}
      {isChoiceType && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('questions.optionLabel')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {options.map((opt, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex items-center gap-2 mt-2">
                {isSingle ? (
                  <input type="radio" name="correctAnswer" checked={correctAnswer === index} onChange={() => setCorrectAnswer(index)} className="h-4 w-4" />
                ) : (
                  <input type="checkbox" checked={Array.isArray(correctAnswer) && correctAnswer.includes(index)} onChange={() => toggleMultiAnswer(index)} className="h-4 w-4" />
                )}
                <span className="text-xs font-medium w-5">{OPTION_LABELS[index]}</span>
              </div>
              <Input value={opt} onChange={(e) => updateOption(index, e.target.value)} placeholder={`${t('questions.optionPlaceholder')} ${OPTION_LABELS[index]}`} className="flex-1" />
              <Button type="button" variant="ghost" size="icon" disabled={options.length <= 2} onClick={() => removeOption(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{isSingle ? t('questions.correctHint') : '勾选所有正确答案'}</p>
        </div>
      )}

      {/* True/False answer */}
      {isTrueFalse && (
        <div className="space-y-2">
          <Label>正确答案</Label>
          <div className="flex gap-2">
            {['正确', '错误'].map((label, ti) => (
              <button
                key={label}
                type="button"
                className={`flex-1 h-10 rounded-md border text-sm font-medium transition-colors ${correctAnswer === (ti === 0) ? 'bg-green-500 border-green-500 text-white' : 'border-border hover:bg-accent'}`}
                onClick={() => setCorrectAnswer(ti === 0)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fill blank answer */}
      {isFillBlank && (
        <div className="space-y-2">
          <Label htmlFor="expectedAnswer">预期答案</Label>
          <Input id="expectedAnswer" value={typeof correctAnswer === 'string' ? correctAnswer : ''} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="预期的正确答案" />
        </div>
      )}

      {/* Short answer */}
      {isShortAnswer && (
        <div className="space-y-2">
          <Label htmlFor="acceptableAnswers">可接受答案</Label>
          <Textarea
            id="acceptableAnswers"
            value={Array.isArray(correctAnswer) ? correctAnswer.join('\n') : typeof correctAnswer === 'string' ? correctAnswer : ''}
            onChange={(e) => setCorrectAnswer(e.target.value.split('\n').filter(Boolean))}
            placeholder="每行一个可接受的答案（关键词匹配）"
            rows={3}
          />
        </div>
      )}

      {/* Analysis question - no answer needed */}

      {/* Answer explanation */}
      {['fill_blank','short_answer'].includes(questionType) && (
        <div className="space-y-2">
          <Label htmlFor="answerExplanation">答案解析</Label>
          <Textarea id="answerExplanation" value={answerExplanation} onChange={(e) => setAnswerExplanation(e.target.value)} placeholder="解释为什么这是正确答案..." rows={2} />
        </div>
      )}

      {/* Analysis */}
      <div className="space-y-2">
        <Label htmlFor="analysis">{t('questions.analysis')}</Label>
        <Textarea id="analysis" value={analysis} onChange={(e) => setAnalysis(e.target.value)} placeholder={t('questions.analysisPlaceholder')} rows={3} />
      </div>

      {/* Key points */}
      <div className="space-y-2">
        <Label htmlFor="keyPoints">{t('questions.keyPoints')}</Label>
        <Input id="keyPoints" value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} placeholder={t('questions.keyPointsPlaceholder')} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t('questions.cancel')}</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('questions.saving') : initialData ? t('questions.update') : t('questions.create')}
        </Button>
      </div>
    </form>
  )
}
