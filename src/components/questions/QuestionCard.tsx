import { memo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Kbd } from '@/components/ui/kbd'
import { OPTION_LABELS, QUESTION_TYPE_LABELS, TYPE_COLORS, POINT_COLORS } from '@/lib/constants'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Question, CorrectAnswer, CodingAnswer, CaseAnswer, CaseQuestion, TestCase, ExampleCase } from '@/types'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { useT } from '@/i18n/use-t'
import { Check, Pencil, Star, Sparkles, ThumbsDown, HelpCircle, TriangleAlert } from 'lucide-react'
import { CodeEditor } from '@/components/practice/CodeEditor'
import { CodeResult } from '@/components/practice/CodeResult'
import { useCodeSubmission } from '@/hooks/use-code-submission'

import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'

const BLANK_RE = new RegExp('_{2,}', 'g')

const rowBase = 'transition-[opacity,transform] duration-500 ease-out'

function isCaseAnswer(x: CorrectAnswer | null | undefined): x is CaseAnswer {
  return !!x && typeof x === 'object' && !Array.isArray(x) && 'subs' in (x as object)
}

/** 小题参考答案的文本化 (用于结果区展示) */
function subAnswerLabel(sub: CaseQuestion): string {
  const a = sub.answer
  switch (sub.type) {
    case 'single_choice': return OPTION_LABELS[a as number] ?? String(a)
    case 'multi_select': return Array.isArray(a) ? (a as number[]).map((i) => OPTION_LABELS[i] ?? '?').join('、') : String(a)
    case 'true_false': return a ? '正确' : '错误'
    case 'judge_correct': return a === true ? '正确' : `错误，修正：${String(a)}`
    case 'fill_blank':
    case 'short_answer': return Array.isArray(a) ? a.map(String).join('；') : String(a ?? '')
    default: return String(a ?? '')
  }
}

/** 案例分析题: 单个小题的作答控件 + 结果态逐小题批改 */
function CaseSubBlock({ sub, index, value, showResult, disabled, onChange }: {
  sub: CaseQuestion
  index: number
  value: CorrectAnswer | null | undefined
  showResult?: boolean
  disabled?: boolean
  onChange: (v: CorrectAnswer) => void
}) {
  const type = sub.type
  const isSingle = type === 'single_choice'
  const isMulti = type === 'multi_select'
  const choice = isSingle || isMulti
  const isTrueFalse = type === 'true_false'
  const isJudge = type === 'judge_correct'
  const isFill = type === 'fill_blank'
  const isShort = type === 'short_answer'
  const subCorrect = showResult ? isAnswerCorrect(value, sub.answer, type) : null
  const mark = (correct: boolean) =>
    correct ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950'
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-sm font-semibold text-muted-foreground">({index + 1})</span>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start gap-2">
            <MarkdownRenderer content={sub.text} className="flex-1 text-sm" />
            {showResult && subCorrect !== null && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${subCorrect ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                {subCorrect ? '正确' : '错误'}
              </span>
            )}
          </div>

          {choice && (
            <div className="space-y-1.5">
              {sub.options.map((opt, oi) => {
                const selected = isSingle ? value === oi : Array.isArray(value) && (value as number[]).includes(oi)
                const isCorrectOpt = isSingle
                  ? sub.answer === oi
                  : Array.isArray(sub.answer) && (sub.answer as number[]).includes(oi)
                let cls = 'border-input hover:bg-accent'
                if (showResult) {
                  if (isCorrectOpt) cls = mark(true)
                  else if (selected && !isCorrectOpt) cls = mark(false)
                } else if (selected) cls = 'border-primary ring-2 ring-primary/30'
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={disabled || showResult}
                    className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${cls}`}
                    onClick={() => {
                      if (isMulti) {
                        const arr: number[] = Array.isArray(value) ? [...(value as number[])] : []
                        onChange(arr.includes(oi) ? arr.filter((x) => x !== oi) : [...arr, oi])
                      } else onChange(oi)
                    }}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium">
                      {OPTION_LABELS[oi]}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {showResult && isCorrectOpt && <span className="shrink-0 text-xs font-medium text-green-600">✓</span>}
                  </button>
                )
              })}
            </div>
          )}

          {(isTrueFalse || isJudge) && (
            <div className="flex gap-2">
              {[true, false].map((v) => {
                const selected = isTrueFalse ? value === v : v ? value === true : value != null && value !== true
                const isCorrectOpt = sub.answer === v || (isJudge && sub.answer !== true && !v)
                let cls = 'border-input hover:bg-accent'
                if (showResult) cls = isCorrectOpt ? mark(true) : selected && !isCorrectOpt ? mark(false) : 'border-input'
                else if (selected) cls = 'border-primary ring-2 ring-primary/30'
                return (
                  <button key={String(v)} type="button" disabled={disabled || showResult}
                    className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${cls}`}
                    onClick={() => onChange(v ? true : (isJudge ? '' : false))}>
                    {v ? '正确' : '错误'}
                  </button>
                )
              })}
            </div>
          )}
          {isJudge && value != null && value !== true && (
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              value={typeof value === 'string' ? value : ''}
              disabled={disabled || showResult}
              onChange={(e) => onChange(e.target.value)}
              placeholder="输入修正后的正确表述"
            />
          )}

          {isFill && (
            <div className="space-y-1.5">
              {Array.from({ length: Math.max(1, (sub.text.match(BLANK_RE) || ['___']).length) }).map((_, bi) => {
                const arr: string[] = Array.isArray(value) ? (value as string[]) : value != null ? [String(value)] : new Array(Math.max(1, (sub.text.match(BLANK_RE) || ['___']).length)).fill('')
                const corArr = Array.isArray(sub.answer) ? (sub.answer as string[]) : [String(sub.answer ?? '')]
                const ok = showResult && String(arr[bi] ?? '').trim().toLowerCase() === String(corArr[bi] ?? '').trim().toLowerCase()
                return (
                  <div key={bi} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs text-muted-foreground">第{bi + 1}空</span>
                    <input
                      className={`h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${ok === true ? 'border-green-500' : ok === false ? 'border-red-500' : 'border-input'}`}
                      value={arr[bi] ?? ''}
                      disabled={disabled || showResult}
                      onChange={(e) => {
                        const next = [...(Array.isArray(value) ? (value as string[]) : [])]
                        next[bi] = e.target.value
                        onChange(next)
                      }}
                      placeholder={`答案 ${bi + 1}`}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {isShort && (
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              value={typeof value === 'string' ? value : ''}
              disabled={disabled || showResult}
              onChange={(e) => onChange(e.target.value)}
              placeholder="输入简答答案"
            />
          )}

          {showResult && subCorrect !== null && !subCorrect && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="font-medium">正确答案: </span>
              {subAnswerLabel(sub)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
  onFlagIssue?: () => void
  unsureKbd?: string
  favoriteKbd?: string
  tooEasyKbd?: string
  flagIssueKbd?: string

}

export const QuestionCard = memo(function QuestionCard({ question, selectedAnswer, showResult, onSelect, disabled, showEditLink, attemptCount, wrongCount, note, isFavorited, onToggleFavorite, onMarkTooEasy, onMarkUnsure, onVerify, onFlagIssue, unsureKbd, favoriteKbd, tooEasyKbd, flagIssueKbd }: Props) {
  const { t } = useT()
  const [visible, setVisible] = useState(false)
  // 底部操作按钮(收藏/太简单/不确定/标记问题): <sm 折叠成纯图标,点击后展开图标+文字; ≥sm 恒展开。与题目管理顶部按钮同款动画。
  const [expandedOp, setExpandedOp] = useState<string | null>(null)
  const opBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setVisible(false)
    setExpandedOp(null)
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [question.id])
  useEffect(() => {
    if (expandedOp === null) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (opBarRef.current && !opBarRef.current.contains(e.target as Node)) setExpandedOp(null)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [expandedOp])
  const handleOp = (key: string, action: () => void) => () => {
    // 桌面(≥640px,与 sm: 断点一致)始终直接执行;移动端先展开文字,已展开再点击才执行
    if (window.innerWidth >= 640) return action()
    if (expandedOp === key) {
      setExpandedOp(null)
      return action()
    }
    setExpandedOp(key)
  }
  const opShared = 'shrink-0 gap-0 transition-all duration-300 ease-out sm:px-3 sm:gap-2'
  const opExpanded = 'px-3 gap-2'
  const opCollapsed = 'px-1.5'
  const opLabel = (isOpen: boolean) =>
    `whitespace-nowrap overflow-hidden transition-all duration-300 ease-out sm:max-w-[12rem] sm:opacity-100 sm:pl-2 ${isOpen ? 'max-w-[12rem] opacity-100 pl-2' : 'max-w-0 opacity-0 pl-0'}`

  const { submit, loading: codingLoading, results: codingResults, judgeStatus } = useCodeSubmission(question.id)
  const [editableTestCases, setEditableTestCases] = useState<TestCase[]>([])
  const codingAnswer = selectedAnswer && typeof selectedAnswer === 'object' && 'code' in (selectedAnswer as unknown as Record<string, unknown>) ? selectedAnswer as CodingAnswer : null
  const type = question.question_type
  const isSingle = type === 'single_choice'
  const isMulti = type === 'multi_select'
  const isTrueFalse = type === 'true_false'
  const isFillBlank = type === 'fill_blank'
  const isShort = type === 'short_answer'
  const isAnalysis = type === 'analysis'
  const isJudgeCorrect = type === 'judge_correct'
  const isCoding = type === 'coding'
  const isCase = type === 'case_analysis'

  useEffect(() => {
    if (isCoding && question.test_cases?.length) {
      setEditableTestCases([...question.test_cases])
    }
  }, [question.id, isCoding, question.test_cases])
  const isTextInput = isFillBlank || isShort || isAnalysis
  const correct = isAnswerCorrect(selectedAnswer, question.correct_answer, type, question.allow_unordered, question.unordered_blanks, question.case_questions)
  const caseSubs = question.case_questions ?? []
  const caseAnswer = isCaseAnswer(selectedAnswer) ? selectedAnswer : { subs: [] as { id: string; value: CorrectAnswer }[] }
  const setCaseSub = (subId: string, value: CorrectAnswer) => {
    if (!onSelect) return
    onSelect({ subs: [...caseAnswer.subs.filter((s) => s.id !== subId), { id: subId, value }] })
  }
  const caseResults = isCase
    ? caseSubs.map((sub) => ({
        sub,
        ok: isAnswerCorrect(caseAnswer.subs.find((x) => x.id === sub.id)?.value, sub.answer, sub.type),
      }))
    : []
  const caseCorrectCount = caseResults.filter((r) => r.ok).length
  const typeLabel = QUESTION_TYPE_LABELS[type]
  const row = (delay: number) => ({ className: cn(rowBase, visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'), style: { transitionDelay: `${delay}ms` } })

  return (
    <div className="relative rounded-xl border bg-card p-4 lg:p-6 space-y-3 lg:space-y-4">

      {question.issue_flag && question.issue_flag !== 'none' && (
        <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
          question.issue_flag === 'confirmed'
            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900')}>
          <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{question.issue_flag === 'confirmed' ? '本题已确认存在问题,正在修正中,请谨慎作答' : '本题疑似存在问题,正在核查中,请谨慎作答'}</p>
            {question.issue_note && <p className="mt-0.5 opacity-80 whitespace-pre-wrap">{question.issue_note}</p>}
          </div>
        </div>
      )}

      <div {...row(100)}>
        <MarkdownRenderer content={question.question_text} className="font-medium text-base lg:text-lg" />
      </div>
      <div className={cn('flex flex-wrap gap-1.5', row(200).className)} style={row(200).style}>
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
      <div {...row(300)}>
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
            const blankCount = (question.question_text.match(BLANK_RE) || ['___']).length
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

      {/* Coding — LeetCode-style examples */}
      {isCoding && question.examples?.length! > 0 && (
        <div className="space-y-2">
          {((question.examples ?? []) as ExampleCase[]).map((ex, i) => (
            <div key={i} className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-medium text-xs text-muted-foreground">示例 {i + 1}</p>
              <p><span className="font-medium">输入：</span><code className="text-xs bg-muted px-1 rounded">{ex.input}</code></p>
              <p><span className="font-medium">输出：</span><code className="text-xs bg-muted px-1 rounded">{ex.expected}</code></p>
              {ex.explanation && <p><span className="font-medium">解释：</span>{ex.explanation}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Coding editor */}
      {isCoding && (
        <div className="space-y-3">
          <CodeEditor
            initialCode={codingAnswer?.code ?? ''}
            initialLanguage={codingAnswer?.language ?? 'javascript'}
            executionMode={question.execution_mode ?? 'stdio'}
            loading={codingLoading}
            disabled={showResult}
            testCases={editableTestCases.length > 0 ? editableTestCases : (question.test_cases ?? []) as TestCase[]}
            onTestCasesChange={showResult ? undefined : setEditableTestCases}
            onSubmit={async (code, language) => {
              const testCases = editableTestCases.length > 0 ? editableTestCases : (question.test_cases ?? []) as TestCase[]
              const result = await submit(
                code, language,
                testCases,
                question.runtime_config,
                (question.execution_mode as 'stdio' | 'function') ?? 'stdio',
              )
              if (result) {
                onSelect?.({ code, language, allPassed: result.allPassed } as CodingAnswer)
              }
            }}
          />
          <CodeResult results={codingResults} status={judgeStatus} />
        </div>
      )}

      {/* 案例分析题: 案例材料已在题干的 question_text 渲染, 下方逐个渲染共用材料的小题 */}
      {isCase && (
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground">
            {caseSubs.length > 0 && !showResult ? '阅读上方案例材料，回答下列小题（小题分别判分）。' : ''}
            {showResult && (
              <span
                className={cn(
                  'font-medium',
                  caseCorrectCount > 0 && caseCorrectCount === caseSubs.length
                    ? 'text-green-600 dark:text-green-400'
                    : caseCorrectCount > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-500',
                )}
              >
                本题共 {caseSubs.length} 小题，答对 {caseCorrectCount} 题
              </span>
            )}
          </p>
          {caseSubs.map((sub, si) => {
            const value = caseAnswer.subs.find((s) => s.id === sub.id)?.value
            return (
              <CaseSubBlock
                key={sub.id}
                sub={sub}
                index={si}
                value={value}
                showResult={showResult}
                disabled={disabled}
                onChange={(v) => setCaseSub(sub.id, v)}
              />
            )
          })}
        </div>
      )}
      </div>

      {/* Result display */}
      <div {...row(400)}>
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
          {isCoding && codingAnswer != null && (
            <div className={cn('rounded-lg p-3 text-sm', correct ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-red-50 dark:bg-red-950 text-red-700')}>
              <p className="font-medium">{correct ? (t('practice.codeEditor.passed') ?? '全部通过') : (t('practice.codeEditor.failed') ?? '未通过')}</p>
              {codingAnswer.code && (
                <pre className="mt-2 p-2 rounded bg-black/10 dark:bg-white/10 text-xs font-mono overflow-x-auto max-h-32">{codingAnswer.code}</pre>
              )}
              {codingResults && <div className="mt-2"><CodeResult results={codingResults} status={judgeStatus} /></div>}
            </div>
          )}
          {question.answer_explanation && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">解析: </span>
              <MarkdownRenderer content={question.answer_explanation} />
            </div>
          )}
          {question.analysis && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">{t('questions.analysis')}: </span>
              <MarkdownRenderer content={question.analysis} />
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
      </div>

      {/* pt 让操作按钮与上方选项/解析拉开间距;不用 mt 以避免与卡片 space-y 冲突 */}
      <div {...row(500)} className={cn(row(500).className, 'pt-2.5 sm:pt-3.5')} style={row(500).style}>
      {(onToggleFavorite || onMarkTooEasy || onMarkUnsure || onFlagIssue || showResult) && (
        <div ref={opBarRef} className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
          {onToggleFavorite && (
            <Button variant="outline" size="sm" onClick={handleOp('fav', onToggleFavorite)}
              className={cn(opShared, isFavorited ? 'text-yellow-500 hover:text-yellow-600 border-yellow-300' : 'text-muted-foreground', expandedOp === 'fav' ? opExpanded : opCollapsed)}>
              <Star className={cn('h-4 w-4 shrink-0', isFavorited && 'fill-yellow-500 text-yellow-500')} />
              <span className={opLabel(expandedOp === 'fav')}>
                {isFavorited ? t('favorites.remove') : t('favorites.add')}{favoriteKbd && <Kbd className="ml-1">{favoriteKbd}</Kbd>}
              </span>
            </Button>
          )}
          {onMarkTooEasy && (
            <Button variant="outline" size="sm" onClick={handleOp('tooEasy', onMarkTooEasy)}
              className={cn(opShared, 'text-muted-foreground hover:text-green-600 hover:border-green-400', expandedOp === 'tooEasy' ? opExpanded : opCollapsed)}>
              <ThumbsDown className="h-4 w-4 shrink-0" />
              <span className={opLabel(expandedOp === 'tooEasy')}>太简单{tooEasyKbd && <Kbd className="ml-1">{tooEasyKbd}</Kbd>}</span>
            </Button>
          )}
          {onMarkUnsure && (
            <Button variant="outline" size="sm" onClick={handleOp('unsure', onMarkUnsure)}
              className={cn(opShared, 'text-muted-foreground hover:text-orange-600 hover:border-orange-400', expandedOp === 'unsure' ? opExpanded : opCollapsed)}>
              <HelpCircle className="h-4 w-4 shrink-0" />
              <span className={opLabel(expandedOp === 'unsure')}>不确定{unsureKbd && <Kbd className="ml-1">{unsureKbd}</Kbd>}</span>
            </Button>
          )}
          {onFlagIssue && (
            <Button variant="outline" size="sm" onClick={handleOp('flag', onFlagIssue)}
              className={cn(opShared,
                question.issue_flag === 'confirmed'
                  ? 'text-red-600 hover:text-red-700 border-red-300 dark:text-red-400 dark:border-red-800'
                  : question.issue_flag === 'suspected'
                    ? 'text-amber-600 hover:text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800'
                    : 'text-muted-foreground hover:text-amber-600 hover:border-amber-400',
                expandedOp === 'flag' ? opExpanded : opCollapsed)}>
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span className={opLabel(expandedOp === 'flag')}>
                {question.issue_flag && question.issue_flag !== 'none' ? '修改标记' : '标记问题'}
                {flagIssueKbd && <Kbd className="ml-1">{flagIssueKbd}</Kbd>}
              </span>
            </Button>
          )}
          </div>
          {showResult && (
            <div className="flex flex-wrap items-center gap-1.5">
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
    </div>
  )
})
