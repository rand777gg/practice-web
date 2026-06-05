import { cn } from '@/lib/utils'
import { OPTION_LABELS } from '@/lib/constants'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  question: Question
  selectedAnswer?: number | null
  showResult?: boolean
  onSelect?: (index: number) => void
  disabled?: boolean
}

export function QuestionCard({ question, selectedAnswer, showResult, onSelect, disabled }: Props) {
  const { t } = useT()

  return (
    <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-3 lg:space-y-4">
      <h3 className="font-medium text-base lg:text-lg">{question.question_text}</h3>
      {question.category && (
        <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {question.category}
        </span>
      )}
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
    </div>
  )
}
