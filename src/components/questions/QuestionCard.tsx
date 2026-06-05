import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { OPTION_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'
import { Pencil } from 'lucide-react'

interface Props {
  question: Question
  selectedAnswer?: number | null
  showResult?: boolean
  onSelect?: (index: number) => void
  disabled?: boolean
  showEditLink?: boolean
}

export function QuestionCard({ question, selectedAnswer, showResult, onSelect, disabled, showEditLink }: Props) {
  const { t } = useT()

  return (
    <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-3 lg:space-y-4">
      <h3 className="font-medium text-base lg:text-lg">{question.question_text}</h3>
      <div className="flex flex-wrap gap-1.5">
        {question.subject && (
          <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {question.subject}
          </span>
        )}
        {question.category && (
          <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {question.category}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selectedAnswer === index
          const isCorrect = index === question.correct_answer
          let optionClass = 'border-input hover:bg-accent'

          if (showResult) {
            if (isCorrect) {
              optionClass = 'border-green-500 bg-green-50 dark:bg-green-950'
            } else if (isSelected && !isCorrect) {
              optionClass = 'border-red-500 bg-red-50 dark:bg-red-950'
            }
          } else if (isSelected) {
            optionClass = 'border-primary bg-primary/10'
          }

          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              className={cn(
                'w-full flex items-center gap-2 lg:gap-3 rounded-lg border px-3 lg:px-4 py-2.5 lg:py-3 text-left text-sm transition-colors',
                optionClass,
                disabled && 'cursor-default',
              )}
              onClick={() => onSelect?.(index)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                {OPTION_LABELS[index]}
              </span>
              <span className="flex-1">{option}</span>
              {showResult && isCorrect && (
                <span className="shrink-0 text-green-600 text-xs font-medium">{t('practice.correct')}</span>
              )}
              {showResult && isSelected && !isCorrect && (
                <span className="shrink-0 text-red-600 text-xs font-medium">{t('practice.yourAnswer')}</span>
              )}
            </button>
          )
        })}
      </div>
      {showResult && question.analysis && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
          <span className="font-medium">{t('questions.analysis')}: </span>
          {question.analysis}
        </div>
      )}
      {showResult && showEditLink && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/questions/${question.id}/edit`}>
              <Pencil className="h-3 w-3" />
              {t('questions.reportError')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
