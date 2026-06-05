import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import { OPTION_LABELS } from '@/lib/constants'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  initialData?: Question
  onSubmit: (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => Promise<void>
  onCancel: () => void
}

export function QuestionForm({ initialData, onSubmit, onCancel }: Props) {
  const { t } = useT()
  const [questionText, setQuestionText] = useState(initialData?.question_text ?? '')
  const [options, setOptions] = useState<string[]>(initialData?.options ?? ['', ''])
  const [correctAnswer, setCorrectAnswer] = useState(initialData?.correct_answer ?? 0)
  const [category, setCategory] = useState(initialData?.category ?? '')
  const [subject, setSubject] = useState(initialData?.subject ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const addOption = () => setOptions([...options, ''])
  const removeOption = (index: number) => {
    if (options.length <= 2) return
    const newOptions = options.filter((_, i) => i !== index)
    setOptions(newOptions)
    if (correctAnswer === index) setCorrectAnswer(0)
    else if (correctAnswer > index) setCorrectAnswer(correctAnswer - 1)
  }
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!questionText.trim()) {
      setError(t('questions.questionRequired'))
      return
    }
    if (options.some((o) => !o.trim())) {
      setError(t('questions.optionsRequired'))
      return
    }
    if (correctAnswer < 0 || correctAnswer >= options.length) {
      setError(t('questions.correctRequired'))
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        question_text: questionText.trim(),
        options: options.map((o) => o.trim()),
        correct_answer: correctAnswer,
        category: category.trim() || null,
        subject: subject.trim() || null,
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject">{t('questions.subject')}</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('questions.subjectPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">{t('questions.categoryLabel')}</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('questions.categoryPlaceholder')}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('questions.optionLabel')}</Label>
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        {options.map((opt, index) => (
          <div key={index} className="flex gap-2 items-start">
            <div className="flex items-center gap-2 mt-2">
              <input
                type="radio"
                name="correctAnswer"
                checked={correctAnswer === index}
                onChange={() => setCorrectAnswer(index)}
                className="h-4 w-4"
              />
              <span className="text-xs font-medium w-5">{OPTION_LABELS[index]}</span>
            </div>
            <Input
              value={opt}
              onChange={(e) => updateOption(index, e.target.value)}
              placeholder={`${t('questions.optionPlaceholder')} ${OPTION_LABELS[index]}`}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={options.length <= 2}
              onClick={() => removeOption(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t('questions.correctHint')}</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('questions.saving') : initialData ? t('questions.update') : t('questions.create')}
        </Button>
      </div>
    </form>
  )
}
