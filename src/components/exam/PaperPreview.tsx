import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { cn } from '@/lib/utils'
import { hasCoverContent, type ExamTemplateCover } from '@/lib/paper-cover'
import { layoutToCssVars, textBlockInlineStyle, type ExamTemplateLayout } from '@/lib/paper-layout'
import { useT } from '@/i18n/use-t'
import { PaperCover } from './PaperCover'
import { PaperSheetStyles } from './paper-sheet-styles'
import { PaperSpreadView } from './PaperSpreadView'
import {
  GradeBar,
  GradeMark,
  PaperFooter,
  PaperLayoutOverlays,
  QuestionBody,
  type PaperGrade,
} from './paper-view-parts'
import { CN_NUM } from './paper-view-core'
import type { CorrectAnswer } from '@/types'
import type { PaperSection } from '@/lib/exam-compose'

export type { PaperGrade } from './paper-view-parts'

interface Props {
  title: string
  meta?: string
  sections: PaperSection[]
  answers: Map<string, CorrectAnswer>
  onAnswer?: (questionId: string, answer: CorrectAnswer) => void
  currentQuestionId?: string | null
  onFocus?: (questionId: string) => void
  readOnly?: boolean
  /** sheet: 单栏 A4 细长整卷; spread: 双页分页视图(固定页高, 两两并排) */
  layout?: 'sheet' | 'spread'
  /** 提供则进入批改视图: 卷面上标出对错、正确答案与解析 */
  grading?: Map<string, PaperGrade>
  /** 可选封面: 有内容时在卷面最前面单独渲染一页 A4 封面 */
  cover?: ExamTemplateCover | null
  /** 可选版式 token: 纸张/边距/字号/水印等排版设置 */
  paperLayout?: ExamTemplateLayout | null
  /** spread 视图查看工具栏(缩放/平移/全屏)的外部锚点(如卷面顶栏); 空=左上角浮层 */
  spreadToolbarAnchor?: HTMLElement | null
}

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
  grading,
  cover,
  paperLayout,
  spreadToolbarAnchor,
}: Props) {
  const { t } = useT()

  const spread = layout === 'spread'

  const cssVars = paperLayout ? layoutToCssVars(paperLayout, 'sheet') : undefined
  const scoreBoxClass =
    !paperLayout ? undefined
    : paperLayout.scoreBox === 'always' ? 'paper-score-box-always'
    : paperLayout.scoreBox === 'none' ? 'paper-score-box-none'
    : 'paper-score-box-optional'

  // 卷首抬头显隐: 有排版 token 时按开关, 否则兼容旧行为始终显示
  const showTitle = paperLayout ? paperLayout.showPaperTitle : true
  const showMeta = paperLayout ? paperLayout.showPaperMeta : true

  const tb = useMemo(() => ({
    paperTitle: textBlockInlineStyle(paperLayout, 'paperTitle'),
    paperMeta: textBlockInlineStyle(paperLayout, 'paperMeta'),
    sectionTitle: textBlockInlineStyle(paperLayout, 'sectionTitle'),
    questionStem: textBlockInlineStyle(paperLayout, 'questionStem'),
    questionOption: textBlockInlineStyle(paperLayout, 'questionOption'),
  }), [paperLayout])

  const numbered = useMemo(() => {
    let n = 0
    return sections.map((sec) => ({
      ...sec,
      items: sec.questions.map((q) => ({ q, no: ++n })),
    }))
  }, [sections])

  const total = numbered.reduce((sum, s) => sum + s.items.length, 0)

  const set = (q: { id: string }, answer: CorrectAnswer) => {
    if (readOnly) return
    onAnswer?.(q.id, answer)
  }

  // 卷面互动模式: 答题卡点题号 → currentQuestionId 变化 → 平滑滚动定位并短暂高亮该题
  const qRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [flashQid, setFlashQid] = useState<string | null>(null)
  useEffect(() => {
    if (readOnly || spread || !currentQuestionId) return
    const el = qRefs.current.get(currentQuestionId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashQid(currentQuestionId)
    const timer = setTimeout(() => setFlashQid(null), 1200)
    return () => clearTimeout(timer)
  }, [currentQuestionId, readOnly, spread])

  const gradedTotal = useMemo(() => {
    if (!grading) return null
    let correct = 0
    let done = 0
    for (const g of grading.values()) {
      if (g.isCorrect === null) continue
      done++
      if (g.isCorrect) correct++
    }
    return { correct, done }
  }, [grading])

  // 双页分页视图: 独立渲染路径(封面独占第 1 页, 正文按固定页高/双页并排分页流动)
  if (spread) {
    return (
      <PaperSpreadView
        title={title}
        meta={meta}
        sections={sections}
        answers={answers}
        onAnswer={onAnswer}
        currentQuestionId={currentQuestionId}
        onFocus={onFocus}
        readOnly={readOnly}
        grading={grading}
        cover={cover}
        paperLayout={paperLayout}
        toolbarAnchor={spreadToolbarAnchor}
      />
    )
  }

  return (
    <>
      <PaperSheetStyles />

      <div className="flex justify-center py-6">
        <div
          className="paper-sheet rounded-sm"
          style={cssVars as React.CSSProperties}
        >
          {paperLayout && <PaperLayoutOverlays layout={paperLayout} />}
          {hasCoverContent(cover) && (
            <PaperCover cover={cover!} layout="sheet" paperLayout={paperLayout} />
          )}

          <header className="mb-6 text-center">
            {showTitle && (
              <h1 className="font-semibold tracking-wide text-xl" style={tb.paperTitle}>{title}</h1>
            )}
            {showMeta && meta && (
              <p className="mt-1 text-xs text-muted-foreground" style={tb.paperMeta}>{meta}</p>
            )}
            <div className={cn((showTitle || showMeta) && 'mt-3 border-t border-double border-t-4 border-foreground pt-2', 'text-xs text-muted-foreground')}>
              {t('paperPreview.totalHint').replace('{n}', String(total))}
              {gradedTotal && (
                <span className="paper-no-print ml-2">
                  · {t('paperReview.scoredHint')
                    .replace('{c}', String(gradedTotal.correct))
                    .replace('{n}', String(gradedTotal.done))}
                </span>
              )}
            </div>
          </header>

          {numbered.map((sec, si) => (
            <section key={si} className="paper-sec mb-6">
              <div className="paper-sec-head mb-3 flex items-end justify-between border-b border-foreground/15 pb-1">
                <h2 className="font-semibold text-base" style={tb.sectionTitle}>
                  {CN_NUM[si] ?? si + 1}、{sec.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    （{sec.scorePerQuestion > 0
                      ? t('paperPreview.sectionHint')
                        .replace('{n}', String(sec.items.length))
                        .replace('{s}', String(sec.scorePerQuestion))
                        .replace('{t}', String(sec.items.length * sec.scorePerQuestion))
                      : t('paperPreview.sectionHintNoScore').replace('{n}', String(sec.items.length))}）
                  </span>
                </h2>
                <span className={cn('shrink-0', scoreBoxClass ?? 'border border-foreground/35 px-3 text-[10px] leading-5 text-muted-foreground')}>
                  {t('paperPreview.scoreBox')}
                </span>
              </div>

              <ol className="space-y-4">
                {sec.items.map(({ q, no }) => {
                  const answer = answers.get(q.id)
                  const grade = grading?.get(q.id)
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
                        (active || flashing) && 'rounded px-2 ring-2 ring-blue-400/60',
                        flashing && 'ring-amber-400',
                        active && '-mx-2 px-2',
                      )}
                      onMouseDown={() => onFocus?.(q.id)}
                    >
                      <div className="flex gap-2">
                        <span className="shrink-0 tabular-nums">{no}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <span style={tb.questionStem} className="contents">
                              <MarkdownRenderer content={q.question_text} className="paper-md inline-block align-top" />
                            </span>
                            {grade && <GradeMark isCorrect={grade.isCorrect} />}
                          </div>

                          <QuestionBody
                            q={q}
                            answer={answer ?? null}
                            onSet={(a) => set(q, a)}
                            readOnly={readOnly}
                            grade={grade}
                            optionStyle={tb.questionOption}
                          />

                          {grade && (
                            <GradeBar
                              q={q}
                              grade={grade}
                              answer={answer ?? null}
                            />
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}

          {(paperLayout?.headerFooter.footerText || paperLayout?.headerFooter.showPageNumber) && (
            <PaperFooter layout={paperLayout!} />
          )}
        </div>
      </div>
    </>
  )
}
