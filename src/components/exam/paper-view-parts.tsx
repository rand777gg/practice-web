/**
 * 试卷渲染共享件 (paper-view-parts): 供 PaperPreview(单栏整卷 / 批改卷) 与
 * PaperSpreadView(双页分页视图) 共同使用的「原子渲染块」——题目正文/选项/填空/批改
 * 徽标/解析条/装饰层(装订线/密封条/水印)/页脚。两套视图必须用完全相同的 JSX 渲染
 * 同一个题目, 双页视图的「DOM 实测分页」依赖两侧高度一致。
 */
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import type { ExamTemplateLayout } from '@/lib/paper-layout'
import type { CodingAnswer, CorrectAnswer, Question } from '@/types'
import {
  blankCount,
  DASH,
  isBlankAnswer,
  optionMark,
  type PaperGrade,
} from './paper-view-core'

export type { PaperGrade } from './paper-view-core'

export function GradeMark({ isCorrect }: { isCorrect: boolean | null }) {
  const { t } = useT()
  if (isCorrect === null) {
    return (
      <span
        className="mt-1 shrink-0 rounded-full bg-muted px-1.5 text-[10px] leading-5 text-muted-foreground"
        title={t('paperReview.manual')}
      >
        {t('paperReview.manualShort')}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'mt-1 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white',
        isCorrect ? 'bg-emerald-500' : 'bg-red-500',
      )}
      title={isCorrect ? t('exam.correct') : t('paperReview.incorrect')}
    >
      {isCorrect ? '✓' : '✗'}
    </span>
  )
}

export function AnswerText({ q, value }: { q: Question; value: CorrectAnswer | null }) {
  const { t } = useT()
  if (value === null || value === undefined) return <>{DASH}</>
  if (typeof value === 'object' && !Array.isArray(value) && 'code' in (value as object)) {
    const code = (value as CodingAnswer).code?.trim()
    if (!code) return <>{DASH}</>
    return (
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-relaxed">
        {code}
      </pre>
    )
  }
  switch (q.question_type) {
    case 'single_choice':
      return <>{OPTION_LABELS[value as number] ?? DASH}</>
    case 'multi_select': {
      const arr = (value as number[]) ?? []
      return <>{arr.length ? arr.map((i) => OPTION_LABELS[i] ?? '?').join('、') : DASH}</>
    }
    case 'true_false':
      return <>{value ? t('paper.correct') : t('paper.wrong')}</>
    case 'judge_correct':
      return <>{value === true ? t('paper.correct') : String(value)}</>
    case 'fill_blank':
    case 'short_answer':
      return <>{Array.isArray(value) ? value.join('、') : String(value)}</>
    default:
      return <>{String(value)}</>
  }
}

export function GradeBar({ q, grade, answer }: { q: Question; grade: PaperGrade; answer: CorrectAnswer | null }) {
  const { t } = useT()
  const exp = grade.explanation ?? q.answer_explanation ?? q.analysis
  const unanswered = isBlankAnswer(answer)
  const ok = grade.isCorrect
  const isCoding = q.question_type === 'coding'

  return (
    <div
      className={cn(
        'paper-no-print mt-2 space-y-1 border-l-2 pl-2 text-xs',
        ok === null ? 'border-muted-foreground/40' : ok ? 'border-emerald-500/60' : 'border-red-500/60',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-muted-foreground">
          {t('paperReview.yourAnswer')}{' '}
          <span className={cn('font-medium', ok === false ? 'text-red-500' : 'text-foreground')}>
            {unanswered ? t('paperReview.unanswered') : <AnswerText q={q} value={answer} />}
          </span>
        </span>
        {ok !== true && (
          <span className="text-muted-foreground">
            {isCoding ? t('paperReview.referenceAnswer') : t('paperReview.correctAnswer')}{' '}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              <AnswerText q={q} value={grade.correctAnswer} />
            </span>
          </span>
        )}
      </div>
      {exp && (
        <details className="group">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            {t('paperReview.explanation')}
          </summary>
          <MarkdownRenderer content={exp} className="paper-md mt-1 text-muted-foreground" />
        </details>
      )}
    </div>
  )
}

/**
 * 题目作答/批改主体(题干下方的选项、填空、判断、文本框…)。
 * 与 PaperPreview 的 <li> 一起构成一个完整题目原子块, 双页视图分页时整体搬移。
 */
export function QuestionBody({
  q,
  answer,
  onSet,
  readOnly,
  grade,
  optionStyle,
}: {
  q: Question
  answer: CorrectAnswer | null
  onSet: (a: CorrectAnswer) => void
  readOnly?: boolean
  grade?: PaperGrade
  /** 选项区文本块样式 (questionOption inline style), 应用在选项文字外层 */
  optionStyle?: Record<string, string>
}) {
  const { t } = useT()
  const cursor = readOnly ? 'cursor-default' : 'cursor-pointer'

  if (q.question_type === 'single_choice' || q.question_type === 'multi_select') {
    const isMulti = q.question_type === 'multi_select'
    const selected = isMulti
      ? Array.isArray(answer)
        ? (answer as number[])
        : []
      : typeof answer === 'number'
        ? [answer as number]
        : []
    const twoCol = q.options.every((o) => o.length <= 28) && q.options.length > 2
    return (
      <div className={cn('mt-2 grid gap-x-6 gap-y-1', twoCol ? 'grid-cols-2' : 'grid-cols-1')}>
        {q.options.map((opt, i) => {
          const checked = selected.includes(i)
          const mark = grade ? optionMark(grade.correctAnswer, i, checked, isMulti) : null
          return (
            <button
              key={i}
              type="button"
              disabled={readOnly}
              onClick={() => {
                if (isMulti) {
                  onSet(checked ? selected.filter((x) => x !== i) : [...selected, i])
                } else {
                  onSet(i)
                }
              }}
              className={cn('flex items-start gap-2 text-left', cursor, readOnly ? '' : 'hover:text-primary')}
            >
              <span
                className={cn(
                  'mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center border border-foreground/50 text-[10px] leading-none',
                  isMulti ? 'rounded-sm' : 'rounded-full',
                  mark === 'correct' && 'border-emerald-500 bg-emerald-500 text-white',
                  mark === 'wrong' && 'border-red-500 bg-red-500 text-white',
                  mark === null && checked && 'border-transparent bg-foreground text-background',
                )}
              >
                {mark === 'correct' ? '✓' : mark === 'wrong' ? '✗' : checked && isMulti ? '✓' : ''}
              </span>
              <span style={optionStyle} className={cn('shrink-0 font-medium', mark === 'correct' && 'text-emerald-600 dark:text-emerald-400')}>
                {OPTION_LABELS[i]}.
              </span>
              <span style={optionStyle} className={cn('min-w-0', mark === 'wrong' && 'text-red-500 line-through')}>{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (q.question_type === 'true_false' || q.question_type === 'judge_correct') {
    const answered = answer !== null && answer !== undefined
    const isTrue = answer === true
    const isWrong = answered && !isTrue
    const correctIsTrue = grade ? grade.correctAnswer === true : null
    return (
      <div className="mt-2 space-y-2">
        <div className="flex gap-4">
          {[true, false].map((v) => {
            const on = v ? isTrue : isWrong
            const mark = correctIsTrue === null ? null : correctIsTrue === v ? 'correct' : on ? 'wrong' : null
            return (
              <button
                key={String(v)}
                type="button"
                disabled={readOnly}
                onClick={() => onSet(v ? true : '')}
                className={cn('flex items-center gap-1.5', cursor)}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border border-foreground/50 text-[10px]',
                    mark === 'correct' && 'border-emerald-500 bg-emerald-500 text-white',
                    mark === 'wrong' && 'border-red-500 bg-red-500 text-white',
                    mark === null && on && 'border-transparent bg-foreground text-background',
                  )}
                >
                  {mark ? (mark === 'correct' ? '✓' : '✗') : on ? '✓' : ''}
                </span>
                <span className={cn(mark === 'correct' && 'text-emerald-600 dark:text-emerald-400')}>
                  {v ? t('paper.correct') : t('paper.wrong')}
                </span>
              </button>
            )
          })}
        </div>
        {q.question_type === 'judge_correct' && isWrong && (
          <input
            className="w-full border-b border-foreground/35 bg-transparent pb-0.5 text-sm outline-none focus:border-foreground/80"
            placeholder={t('paper.correctedHint')}
            readOnly={readOnly}
            value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => onSet(e.target.value)}
          />
        )}
      </div>
    )
  }

  if (q.question_type === 'fill_blank') {
    const n = blankCount(q.question_text)
    const vals = Array.isArray(answer) ? (answer as string[]) : typeof answer === 'string' ? [answer] : []
    const correctVals = grade
      ? Array.isArray(grade.correctAnswer)
        ? (grade.correctAnswer as string[])
        : typeof grade.correctAnswer === 'string'
          ? [grade.correctAnswer]
          : []
      : null
    return (
      <div className="mt-2 flex flex-wrap gap-3">
        {Array.from({ length: n }, (_, i) => {
          const raw = (vals[i] ?? '').trim()
          const ref = correctVals?.[i]
          const cellState: 'ok' | 'bad' | null =
            !correctVals || ref === undefined || !raw
              ? null
              : String(ref).split(/[;；]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
                  .some((a) => raw.toLowerCase() === a)
                ? 'ok'
                : 'bad'
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="text-xs text-muted-foreground">({i + 1})</span>
              <input
                className={cn(
                  'w-32 border-b border-foreground/35 bg-transparent pb-0.5 text-center text-sm outline-none focus:border-foreground/80',
                  cellState === 'ok' && 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
                  cellState === 'bad' && 'border-red-500 text-red-500',
                )}
                readOnly={readOnly}
                value={vals[i] ?? ''}
                onChange={(e) => {
                  const next = [...vals]
                  next[i] = e.target.value
                  onSet(next)
                }}
              />
            </span>
          )
        })}
      </div>
    )
  }

  const coding = answer && typeof answer === 'object' && !Array.isArray(answer) && 'code' in (answer as object)
    ? (answer as CodingAnswer)
    : null
  if (q.question_type === 'coding' && coding) {
    return (
      <div className="mt-2">
        <p className="mb-1 text-xs text-muted-foreground">
          {t('paperReview.yourCode')} · {coding.language}
          {coding.allPassed !== undefined && (
            <span className={cn('ml-1 font-medium', coding.allPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
              {coding.allPassed ? t('paperReview.testsPassed') : t('paperReview.testsFailed')}
            </span>
          )}
        </p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-dashed border-foreground/25 bg-transparent p-2 text-[11px] leading-relaxed">
          {coding.code || DASH}
        </pre>
      </div>
    )
  }

  const text = typeof answer === 'string' ? answer : ''
  return (
    <div className="mt-2">
      {q.question_type === 'coding' && (
        <p className="mb-1 text-xs text-muted-foreground">{t('paper.codingHint')}</p>
      )}
      <textarea
        className="w-full resize-y rounded border border-dashed border-foreground/25 bg-transparent p-2 text-sm outline-none focus:border-foreground/70"
        rows={q.question_type === 'analysis' ? 6 : 4}
        placeholder={readOnly ? '' : `${QUESTION_TYPE_LABELS[q.question_type] ?? ''} ${t('paper.answerHint')}`}
        readOnly={readOnly}
        value={text}
        onChange={(e) => onSet(e.target.value)}
      />
    </div>
  )
}

/* ================= 装饰层: 装订线 / 密封条 / 水印 (按「页」应用) ================= */

export function PaperLayoutOverlays({ layout }: { layout: ExamTemplateLayout }) {
  const showBinder = layout.binderLine.side !== 'none'
  const showSeal = layout.sealBand.position !== 'none' && !!layout.sealBand.text.trim()
  const showWatermark = layout.watermark.enabled && !!layout.watermark.text.trim()
  return (
    <>
      {showBinder && (
        <div
          className={cn(
            'paper-binder-line',
            layout.binderLine.side === 'left' && 'paper-binder-left',
            layout.binderLine.side === 'right' && 'paper-binder-right',
            layout.binderLine.side === 'top' && 'paper-binder-top',
          )}
        />
      )}
      {showSeal && (
        <div
          className={cn(
            'paper-seal-band',
            layout.sealBand.position === 'top-center' && 'paper-seal-band-top-center',
            layout.sealBand.position === 'top-left' && 'paper-seal-band-top-left',
          )}
        >
          {layout.sealBand.text}
        </div>
      )}
      {showWatermark && (
        <div className="paper-watermark">
          <div className="paper-watermark-grid" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i}>{layout.watermark.text}</span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 页脚(整卷模式单页容器内使用, 页号是静态占位)。
 * 双页分页视图请用 <PageFooterBar page total layout/> 输出真实页码。
 */
export function PaperFooter({ layout }: { layout: ExamTemplateLayout }) {
  const { t } = useT()
  const text = layout.headerFooter.footerText
  return (
    <div className="paper-footer">
      <span>{text || ''}</span>
      {layout.headerFooter.showPageNumber && (
        <span className="paper-page-num">{t('paperPreview.pageNum')}</span>
      )}
    </div>
  )
}

/** 双页分页视图的每页页脚(叠加在页脚留白区, 不占版心高度), page/total 为真实页码; 页码居中显示 */
export function PageFooterBar({ layout, page, total }: { layout: ExamTemplateLayout; page: number; total: number }) {
  const { t } = useT()
  const text = layout.headerFooter.footerText
  const showNum = layout.headerFooter.showPageNumber
  if (!text && !showNum) return null
  return (
    <div
      className="paper-footer absolute"
      style={{ left: 0, right: 0, bottom: '8mm', marginTop: 0, borderTop: '1px solid hsl(var(--border))' }}
    >
      <span className="min-w-0 max-w-[42%] truncate">{text || ''}</span>
      {showNum && (
        <span
          className="paper-page-num absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          {t('paperPreview.pageFmt').replace('{page}', String(page)).replace('{total}', String(total))}
        </span>
      )}
    </div>
  )
}
