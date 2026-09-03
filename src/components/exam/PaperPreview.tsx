import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { OPTION_LABELS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import type { CorrectAnswer, Question } from '@/types'
import type { PaperSection } from '@/lib/exam-compose'

interface Props {
  title: string
  meta?: string
  sections: PaperSection[]
  answers: Map<string, CorrectAnswer>
  onAnswer?: (questionId: string, answer: CorrectAnswer) => void
  currentQuestionId?: string | null
  onFocus?: (questionId: string) => void
  readOnly?: boolean
  /** sheet: 单栏 A4 细长整卷; spread: 多栏摊开整卷一屏(纸张不固定 210mm, 栏数随宽度自适应) */
  layout?: 'sheet' | 'spread'
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

function blankCount(text: string): number {
  return (text.match(/_{2,}/g) || []).length || 1
}

/**
 * 试卷版式: 纸张尺寸/分页/打印样式在 <style> 里, 排版结构与作答交互是普通 DOM,
 * 不依赖 PDF 或 WASM —— 交互层要能点击、能高亮、能响应式, 位图渲染做不到。
 */
export function PaperPreview({
  title,
  meta,
  sections,
  answers,
  onAnswer,
  currentQuestionId,
  onFocus,
  readOnly,
  layout = 'sheet',
}: Props) {
  const { t } = useT()

  const spread = layout === 'spread'

  const numbered = useMemo(() => {
    let n = 0
    return sections.map((sec) => ({
      ...sec,
      items: sec.questions.map((q) => ({ q, no: ++n })),
    }))
  }, [sections])

  const total = numbered.reduce((sum, s) => sum + s.items.length, 0)

  const set = (q: Question, answer: CorrectAnswer) => {
    if (readOnly) return
    onAnswer?.(q.id, answer)
  }

  // 卷面互动模式: 答题卡点题号 → currentQuestionId 变化 → 平滑滚动定位并短暂高亮该题
  const qRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [flashQid, setFlashQid] = useState<string | null>(null)
  useEffect(() => {
    if (readOnly || !currentQuestionId) return
    const el = qRefs.current.get(currentQuestionId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashQid(currentQuestionId)
    const timer = setTimeout(() => setFlashQid(null), 1200)
    return () => clearTimeout(timer)
  }, [currentQuestionId, readOnly])

  return (
    <>
      <style>{`
        .paper-sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 16mm 15mm;
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border: 1px solid hsl(var(--border));
          font-size: 15px;
          line-height: 1.9;
          box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08);
        }
        .paper-sheet-spread {
          width: 100%;
          max-width: none;
          min-height: 0;
          padding: 10mm;
          border: 1px solid hsl(var(--border));
          box-shadow: none;
          font-size: 14px;
          line-height: 1.8;
        }
        .paper-sheet .paper-md > * { margin: 0; }
        .paper-q { break-inside: avoid; page-break-inside: avoid; }
        .paper-sec { break-after: auto; }
        .paper-sec-head { break-after: avoid; }
        /* 多栏摊开: 固定两栏对开(像左右两张纸), 内容自动均衡填满两栏; 窄屏回落单栏 */
        .paper-columns { columns: 2; column-gap: 9mm; column-fill: balance; }
        .paper-columns .paper-sec { break-inside: avoid; }
        .paper-columns .paper-q { break-inside: avoid; }
        @media (max-width: 1023px) {
          .paper-columns { columns: 1; }
        }
        /* 试卷内统一随主题的描线/悬浮, 覆盖组件里不方便用 tailwind 语义类的地方 */
        .paper-sheet .paper-inline-rule { border-color: hsl(var(--border)); }
        .paper-md table, .paper-md pre, .paper-md blockquote { border-color: hsl(var(--border)); }
        @media print {
          .paper-sheet { width: auto; min-height: 0; padding: 0; box-shadow: none; font-size: 12pt;
            background: #fff !important; color: #000 !important; border: none; }
          .paper-sheet-spread { width: auto; padding: 0; border: none; }
          .paper-columns { columns: auto; }
          .paper-no-print { display: none !important; }
          @page { size: A4; margin: 16mm 15mm; }
        }
      `}</style>

      <div className={cn('flex justify-center', spread ? 'items-start py-2 lg:py-3' : 'py-6')}>
        <div className={cn('paper-sheet rounded-sm', spread && 'paper-sheet-spread')}>
          <header className={cn('text-center', spread ? 'mb-5' : 'mb-6')}>
            <h1 className={cn('font-semibold tracking-wide', spread ? 'text-lg' : 'text-xl')}>{title}</h1>
            {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
            <div className="mt-3 border-t border-double border-t-4 border-foreground pt-2 text-xs text-muted-foreground">
              {t('paperPreview.totalHint').replace('{n}', String(total))}
            </div>
          </header>

          <div className={spread ? 'paper-columns' : undefined}>
            {numbered.map((sec, si) => (
              <section key={si} className={cn('paper-sec', spread ? 'mb-4' : 'mb-6')}>
                <div className={cn('paper-sec-head mb-3 flex items-end justify-between border-b border-foreground/15 pb-1', spread && 'mb-2')}>
                  <h2 className={cn('font-semibold', spread ? 'text-sm' : 'text-base')}>
                    {CN_NUM[si] ?? si + 1}、{sec.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      （{t('paperPreview.sectionHint')
                        .replace('{n}', String(sec.items.length))
                        .replace('{s}', String(sec.scorePerQuestion))
                        .replace('{t}', String(sec.items.length * sec.scorePerQuestion))}）
                    </span>
                  </h2>
                  <span className="shrink-0 border border-foreground/35 px-3 text-[10px] leading-5 text-muted-foreground">
                    {t('paperPreview.scoreBox')}
                  </span>
                </div>

                <ol className={spread ? 'space-y-3' : 'space-y-4'}>
                  {sec.items.map(({ q, no }) => {
                    const answer = answers.get(q.id)
                    const active = currentQuestionId === q.id
                    const flashing = flashQid === q.id
                    return (
                      <li
                        key={q.id}
                        data-qid={q.id}
                        ref={(node) => {
                          if (node) qRefs.current.set(q.id, node)
                          else qRefs.current.delete(q.id)
                        }}
                        className={cn(
                          'paper-q',
                          spread && 'rounded',
                          (active || flashing) && 'rounded px-2 ring-2 ring-blue-400/60',
                          flashing && 'ring-amber-400',
                          active && '-mx-2 px-2',
                        )}
                        onMouseDown={() => onFocus?.(q.id)}
                      >
                        <div className="flex gap-2">
                          <span className="shrink-0 tabular-nums">{no}.</span>
                          <div className="min-w-0 flex-1">
                            <MarkdownRenderer content={q.question_text} className="paper-md inline-block align-top" />

                            <QuestionBody q={q} answer={answer ?? null} onSet={(a) => set(q, a)} readOnly={readOnly} />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function QuestionBody({
  q,
  answer,
  onSet,
  readOnly,
}: {
  q: Question
  answer: CorrectAnswer | null
  onSet: (a: CorrectAnswer) => void
  readOnly?: boolean
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
                  checked && 'border-transparent bg-foreground text-background',
                )}
              >
                {checked ? (isMulti ? '✓' : '') : ''}
              </span>
              <span className="shrink-0 font-medium">{OPTION_LABELS[i]}.</span>
              <span className="min-w-0">{opt}</span>
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
    return (
      <div className="mt-2 space-y-2">
        <div className="flex gap-4">
          {[true, false].map((v) => {
            const on = v ? isTrue : isWrong
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
                    on && 'border-transparent bg-foreground text-background',
                  )}
                >
                  {on ? '✓' : ''}
                </span>
                {v ? t('paper.correct') : t('paper.wrong')}
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
    return (
      <div className="mt-2 flex flex-wrap gap-3">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="text-xs text-muted-foreground">({i + 1})</span>
            <input
              className="w-32 border-b border-foreground/35 bg-transparent pb-0.5 text-center text-sm outline-none focus:border-foreground/80"
              readOnly={readOnly}
              value={vals[i] ?? ''}
              onChange={(e) => {
                const next = [...vals]
                next[i] = e.target.value
                onSet(next)
              }}
            />
          </span>
        ))}
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
