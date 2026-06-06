import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { OPTION_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'
import { Pencil, Star } from 'lucide-react'

const POINT_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
]

interface Props {
  question: Question
  selectedAnswer?: number | null
  showResult?: boolean
  onSelect?: (index: number) => void
  disabled?: boolean
  showEditLink?: boolean
  attemptCount?: number
  wrongCount?: number
  note?: string | null
  isFavorited?: boolean
  onToggleFavorite?: () => void
}

export function QuestionCard({ question, selectedAnswer, showResult, onSelect, disabled, showEditLink, attemptCount, wrongCount, note, isFavorited, onToggleFavorite }: Props) {
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
        {question.key_points && question.key_points.split(',').filter(Boolean).map((kp, i) => (
          <Badge key={i} variant="secondary" className={POINT_COLORS[i % POINT_COLORS.length]}>
            {kp.trim()}
          </Badge>
        ))}
        {attemptCount != null && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span>{t('practice.attempts')}: {attemptCount}</span>
            {wrongCount != null && wrongCount > 0 && (
              <span className="text-red-500">({t('practice.wrong')}: {wrongCount})</span>
            )}
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
      {showResult && note && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
          <span className="font-medium">{t('practice.note')}: </span>
          {note}
        </div>
      )}
      {(onToggleFavorite || (showResult && showEditLink)) && (
        <div className="flex items-center justify-between">
          <div>
            {onToggleFavorite && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleFavorite}
                className={isFavorited ? 'text-yellow-500 hover:text-yellow-600 border-yellow-300' : 'text-muted-foreground'}
              >
                {isFavorited ? (
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                ) : (
                  <Star className="h-3 w-3" />
                )}
                {isFavorited ? t('favorites.remove') : t('favorites.add')}
              </Button>
            )}
          </div>
          <div>
            {showResult && showEditLink && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/admin/questions/${question.id}/edit`}>
                  <Pencil className="h-3 w-3" />
                  {t('questions.reportError')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
