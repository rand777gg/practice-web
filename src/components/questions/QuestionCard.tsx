import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { OPTION_LABELS, QUESTION_TYPE_LABELS, TYPE_COLORS } from '@/lib/constants'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Question, CorrectAnswer } from '@/types'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { useT } from '@/i18n/use-t'
import { Check, Pencil, Star, Sparkles, ThumbsDown, HelpCircle } from 'lucide-react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'

const BLANK_RE = new RegExp('_{2,}', 'g')

function MultiYearBadge({ yearCats }: { yearCats: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 cursor-pointer select-none"
          onClick={() => setOpen(!open)}
        >
          {yearCats.length}年真题
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-auto max-w-[calc(100vw-2rem)] px-3 py-2 text-xs">
        <p className="text-muted-foreground mb-1.5">该题在以下年份出现过：</p>
        <div className="flex flex-wrap gap-1">
          {yearCats.map((y) => (
            <span key={y} className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 font-medium whitespace-nowrap">{y}</span>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

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
  selectedAnswer?: CorrectAnswer | null
  showResult?: boolean
  onSelect?: (answer: CorrectAnswer) => void
  disabled?: boolean
  showEditLink?: boolean
  attemptCount?: number
  wrongCount?: number
  note?: string | null
  isFavorited?: boolean
  onToggleFavorite?: () => void
  onMarkTooEasy?: () => void
  onMarkUnsure?: () => void
  onVerify?: () => void
}

export const QuestionCard = memo(function QuestionCard({ question, selectedAnswer, showResult, onSelect, disabled, showEditLink, attemptCount, wrongCount, note, isFavorited, onToggleFavorite, onMarkTooEasy, onMarkUnsure, onVerify }: Props) {
  const { t } = useT()
  const type = question.question_type
  const isSingle = type === 'single_choice'
  const isMulti = type === 'multi_select'
  const isTrueFalse = type === 'true_false'
  const isFillBlank = type === 'fill_blank'
  const isShort = type === 'short_answer'
  const isAnalysis = type === 'analysis'
  const isJudgeCorrect = type === 'judge_correct'
  const isTextInput = isFillBlank || isShort || isAnalysis
  const correct = isAnswerCorrect(selectedAnswer, question.correct_answer, type, question.allow_unordered)
  const typeLabel = QUESTION_TYPE_LABELS[type]

  return (
    <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-3 lg:space-y-4">
      <MarkdownRenderer content={question.question_text} className="font-medium text-base lg:text-lg" />
      <div className="flex flex-wrap gap-1.5">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type] || 'bg-muted text-muted-foreground'}`}>{typeLabel}</span>
        {question.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs">
            <Check className="h-3 w-3" />已验证
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
            待验证
          </span>
        )}
        {question.subject && (
          <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {question.subject}
          </span>
        )}
        {(() => {
          const cats = question.categories?.length ? question.categories : question.category ? [question.category] : []
          const yearPattern = /^\d{4}年真题$/
          const yearCats = cats.filter((c) => yearPattern.test(c))
          // Multiple year categories → show "N年真题" badge, tap/hover to see details
          if (yearCats.length >= 2) {
            const otherCats = cats.filter((c) => !yearPattern.test(c))
            return (
              <>
                <MultiYearBadge yearCats={yearCats} />
                {otherCats.map((cat) =>
                  cat === 'AI生成' ? (
                    <HoverCard key="AI生成" openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <span className="ai-badge ai-badge-dark">
                          <span className="gemini-star"><Sparkles className="w-full h-full" /></span>
                          <span className="badge-text">AI生成</span>
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent side="bottom" className="w-auto px-3 py-2 text-xs">
                        <p>{t('ai.disclaimer')}</p>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>
                  )
                )}
              </>
            )
          }
          // Default: show all categories as individual badges
          return cats.map((cat) =>
            cat === 'AI生成' ? (
              <HoverCard key="AI生成" openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <span className="ai-badge ai-badge-dark">
                    <span className="gemini-star"><Sparkles className="w-full h-full" /></span>
                    <span className="badge-text">AI生成</span>
                  </span>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" className="w-auto px-3 py-2 text-xs">
                  <p>{t('ai.disclaimer')}</p>
                </HoverCardContent>
              </HoverCard>
            ) : (
              <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>
            )
          )
        })()}
        {question.key_points && question.key_points.split(',').filter(Boolean).map((kp, i) => (
          <Badge key={i} variant="secondary" className={POINT_COLORS[i % POINT_COLORS.length]}>{kp.trim()}</Badge>
        ))}
        {attemptCount != null && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span>{t('practice.attempts')}: {attemptCount}</span>
            {wrongCount != null && wrongCount > 0 && <span className="text-red-500">({t('practice.wrong')}: {wrongCount})</span>}
          </span>
        )}
      </div>

      {/* Choice options (single / multi) */}
      {(isSingle || isMulti) && (
        <div className="space-y-2">
          {question.options.map((option, index) => {
            const isSelected = isSingle
              ? selectedAnswer === index
              : Array.isArray(selectedAnswer) && (selectedAnswer as number[]).includes(index)
            const isCorrectOption = isSingle
              ? index === question.correct_answer
              : Array.isArray(question.correct_answer) && (question.correct_answer as number[]).includes(index)
            let optionClass = 'border-input hover:bg-accent'

            if (showResult) {
              if (isCorrectOption) optionClass = 'border-green-500 bg-green-50 dark:bg-green-950'
              else if (isSelected && !isCorrectOption) optionClass = 'border-red-500 bg-red-50 dark:bg-red-950'
            } else if (isSelected) {
              optionClass = 'border-primary ring-2 ring-primary/30'
            }

            return (
              <button
                key={index}
                type="button"
                disabled={disabled}
                className={cn(
                  'w-full flex items-center gap-2 lg:gap-3 rounded-lg border px-3 lg:px-4 py-2.5 lg:py-3 text-left text-sm transition-colors',
                  optionClass, disabled && 'cursor-default',
                )}
                onClick={() => {
                  if (isMulti) {
                    const arr: number[] = Array.isArray(selectedAnswer) ? [...selectedAnswer as number[]] : []
                    const idx = arr.indexOf(index)
                    if (idx >= 0) arr.splice(idx, 1)
                    else arr.push(index)
                    onSelect?.(arr)
                  } else {
                    onSelect?.(index)
                  }
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                  {OPTION_LABELS[index]}
                </span>
                <span className="flex-1">{option}</span>
                {showResult && isCorrectOption && <span className="shrink-0 text-green-600 text-xs font-medium">{t('practice.correct')}</span>}
                {showResult && isSelected && !isCorrectOption && <span className="shrink-0 text-red-600 text-xs font-medium">{t('practice.yourAnswer')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* True/False buttons */}
      {isTrueFalse && (
        <div className="flex gap-2">
          {['正确', '错误'].map((label, ti) => {
            const isSelected = selectedAnswer === (ti === 0)
            const isCorrectOption = question.correct_answer === (ti === 0)
            let cls = 'border-input hover:bg-accent'
            if (showResult) {
              if (isCorrectOption) cls = 'border-green-500 bg-green-50 dark:bg-green-950'
              else if (isSelected && !isCorrectOption) cls = 'border-red-500 bg-red-50 dark:bg-red-950'
            } else if (isSelected) cls = 'border-primary ring-2 ring-primary/30'
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                className={cn('flex-1 h-12 rounded-lg border text-sm font-medium transition-colors', cls)}
                onClick={() => onSelect?.(ti === 0)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Judge & Correct */}
      {isJudgeCorrect && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {['正确', '错误'].map((label, ti) => {
              const isSelected = ti === 0 ? selectedAnswer === true : selectedAnswer !== true && selectedAnswer != null
              const isCorrectAnswer = ti === 0 ? question.correct_answer === true : question.correct_answer !== true
              let cls = 'border-input hover:bg-accent'
              if (showResult) {
                if (isCorrectAnswer) cls = 'border-green-500 bg-green-50 dark:bg-green-950'
                else if (isSelected && !isCorrectAnswer) cls = 'border-red-500 bg-red-50 dark:bg-red-950'
              } else if (isSelected) cls = 'border-primary ring-2 ring-primary/30'
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled || showResult}
                  className={cn('flex-1 h-12 rounded-lg border text-sm font-medium transition-colors', cls)}
                  onClick={() => onSelect?.(ti === 0 ? true : '')}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {selectedAnswer !== true && selectedAnswer != null && (
            <Input
              value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
              onChange={(e) => onSelect?.(e.target.value)}
              disabled={disabled || showResult}
              placeholder="输入修正后的正确表述"
            />
          )}
        </div>
      )}

      {/* Text input (fill blank / short answer / analysis) */}
      {isTextInput && (
        <div>
          {isAnalysis ? (
            <Textarea
              value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
              onChange={(e) => onSelect?.(e.target.value)}
              disabled={disabled || showResult}
              placeholder="输入你的答案..."
              rows={4}
            />
          ) : isFillBlank ? (() => {
            const blankCount = (question.question_text.match(BLANK_RE) || ['____']).length
            const userAnswers = Array.isArray(selectedAnswer) ? selectedAnswer as string[] : selectedAnswer ? [String(selectedAnswer)] : Array(blankCount).fill('')
            return (
              <div className="space-y-2">
                {Array.from({ length: blankCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">第{i + 1}空</span>
                    <Input
                      value={userAnswers[i] || ''}
                      onChange={(e) => {
                        const next = [...userAnswers]
                        next[i] = e.target.value
                        onSelect?.(next)
                      }}
                      disabled={disabled || showResult}
                      placeholder={`输入第${i + 1}个空`}
                    />
                  </div>
                ))}
              </div>
            )
          })() : (
            <Input
              value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
              onChange={(e) => onSelect?.(e.target.value)}
              disabled={disabled || showResult}
              placeholder="输入简答答案"
            />
          )}
        </div>
      )}

      {/* Result display */}
      {showResult && (
        <>
          {isJudgeCorrect && selectedAnswer != null && (
            <div className={cn('rounded-lg p-3 text-sm', correct ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-red-50 dark:bg-red-950 text-red-700')}>
              <p><span className="font-medium">{question.correct_answer === true ? '该说法正确' : '该说法错误'}</span></p>
              {question.correct_answer !== true && (
                <p className="mt-1"><span className="font-medium">修正: </span>{String(question.correct_answer)}</p>
              )}
            </div>
          )}
          {isTextInput && selectedAnswer != null && (
            <div className={cn('rounded-lg p-3 text-sm', correct ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-red-50 dark:bg-red-950 text-red-700')}>
              <p><span className="font-medium">{t('practice.yourAnswer')}: </span>
                {Array.isArray(selectedAnswer) ? selectedAnswer.join('、') : String(selectedAnswer)}
              </p>
              {!isAnalysis && !correct && (
                <p className="mt-1">
                  <span className="font-medium">{t('practice.correct')}: </span>
                  {(() => {
                    const raw = question.correct_answer
                    const items = Array.isArray(raw) ? raw : [String(raw)]
                    return items.map(a => String(a).split(/[;；]/).map(s => s.trim()).join(' / ')).join('、')
                  })()}
                </p>
              )}
              {isAnalysis && <p className="text-xs text-muted-foreground mt-1">分析题需人工批改</p>}
            </div>
          )}
          {question.answer_explanation && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">解析: </span>{question.answer_explanation}
            </div>
          )}
          {question.analysis && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">{t('questions.analysis')}: </span>{question.analysis}
            </div>
          )}
          {note ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">{t('practice.note')}: </span>
              <MarkdownRenderer content={note} />
            </div>
          ) : <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed invisible">placeholder</div>}
        </>
      )}

      {(onToggleFavorite || onMarkTooEasy || onMarkUnsure || showResult) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <Button variant="outline" size="sm" onClick={onToggleFavorite} className={isFavorited ? 'text-yellow-500 hover:text-yellow-600 border-yellow-300' : 'text-muted-foreground'}>
              {isFavorited ? <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /> : <Star className="h-3 w-3" />}
              {isFavorited ? t('favorites.remove') : t('favorites.add')}
            </Button>
          )}
          {onMarkTooEasy && (
            <Button variant="outline" size="sm" onClick={onMarkTooEasy} className="text-muted-foreground hover:text-green-600 hover:border-green-400">
              <ThumbsDown className="h-3 w-3 mr-1" />太简单
            </Button>
          )}
          {onMarkUnsure && (
            <Button variant="outline" size="sm" onClick={onMarkUnsure} className="text-muted-foreground hover:text-orange-600 hover:border-orange-400">
              <HelpCircle className="h-3 w-3 mr-1" />不确定
            </Button>
          )}
          </div>
          {showResult && (
            <div className="flex items-center gap-1">
              {!question.verified && onVerify && (
                <Button variant="outline" size="sm" onClick={onVerify}>
                  <Check className="h-3 w-3 mr-1" />确认验证
                </Button>
              )}
              {showEditLink && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/admin/questions/${question.id}/edit?from=/practice`}>
                    <Pencil className="h-3 w-3" />{t('questions.reportError')}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
