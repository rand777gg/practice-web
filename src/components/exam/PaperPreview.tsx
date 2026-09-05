import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, Hand, Maximize, Minimize, Crosshair } from 'lucide-react'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { cn } from '@/lib/utils'
import { hasCoverContent, type ExamTemplateCover } from '@/lib/paper-cover'
import { layoutToCssVars, textBlockInlineStyle, type ExamTemplateLayout } from '@/lib/paper-layout'
import { useT } from '@/i18n/use-t'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaperCover } from './PaperCover'
import { PaperSheetStyles } from './paper-sheet-styles'
import { PaperSpreadView } from './PaperSpreadView'
import {
  GradeBar,
  GradeMark,
  PaperFooter,
  PaperLayoutOverlays,
  QuestionBody,
  ScoreValue,
  type PaperGrade,
} from './paper-view-parts'
import { CN_NUM } from './paper-view-core'
import type { CorrectAnswer } from '@/types'
import type { PaperSection } from '@/lib/exam-compose'

export type { PaperGrade } from './paper-view-parts'

/* ---- 单页(连续长卷)查看控制常量 —— 与双页视图一致 ---- */
const PCT_MIN = 50 // 固定百分比缩放下限(以纸张真实尺寸为 100%)
const PCT_MAX = 200
const PCT_STEP = 10 // +/- 步进
const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 最近一个在纵向实际可滚的祖先容器(用于测可视高度 / 平移时滚动外层) */
const yScrollParent = (start: HTMLElement | null): HTMLElement | null => {
  let el: HTMLElement | null = start
  while (el && !(el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible')) el = el.parentElement
  return el && el.scrollHeight > el.clientHeight + 1 ? el : null
}

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
  /** paper 视图(单页/双页)查看工具栏的外部锚点(如卷面顶栏): 双页为缩放/平移/全屏, 单页为缩放/适合宽度; 空则仅双页回退为左上角浮层 */
  spreadToolbarAnchor?: HTMLElement | null
  /** 自动定位当前题目: true 时 currentQuestionId 变化即滚动定位; false 时仅显式跳题才滚动 */
  autoLocate?: boolean
  /** 显式跳题请求令牌(答题卡点题号); 变化时无论 autoLocate 都强制滚动定位当前题目 */
  locateNonce?: number
  /** spread 视图工具栏「自动定位」开关回调; 不传则不显示该按钮 */
  onToggleAutoLocate?: () => void
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
  autoLocate = false,
  locateNonce = 0,
  onToggleAutoLocate,
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

  // 卷面互动模式: 定位当前题目 → 平滑滚动并短暂高亮。
  // 仅「显式跳题(locateNonce 变化, 如答题卡点题号)」或「开启 autoLocate 后题目变化」才会滚动;
  // 默认(答题卡外点击/其它原因引起的 currentQuestionId 变化)不自动滚动。
  const qRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [flashQid, setFlashQid] = useState<string | null>(null)
  const prevLocateRef = useRef(locateNonce)
  const prevQidRef = useRef<string | null>(null)
  useEffect(() => {
    if (readOnly || spread || !currentQuestionId) return
    const explicit = locateNonce !== prevLocateRef.current
    prevLocateRef.current = locateNonce
    const sameQid = currentQuestionId === prevQidRef.current
    prevQidRef.current = currentQuestionId
    if (!explicit && !autoLocate) return
    if (!explicit && sameQid) return
    const el = qRefs.current.get(currentQuestionId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashQid(currentQuestionId)
    const timer = setTimeout(() => setFlashQid(null), 1200)
    return () => clearTimeout(timer)
  }, [currentQuestionId, readOnly, spread, autoLocate, locateNonce])

  const gradedTotal = useMemo(() => {
    if (!grading) return null
    let correct = 0
    let done = 0
    for (const g of grading.values()) {
      if (g.isCorrect === null) continue
      // 案例分析题按小题口径累计(与最终得分一致); 其余题目按整题计
      if (g.partial && g.partial.total > 0) {
        done += g.partial.total
        correct += g.partial.correct
      } else {
        done++
        if (g.isCorrect) correct++
      }
    }
    return { correct, done }
  }, [grading])

  // 单页(连续长卷)自适应: 纸张超宽时按容器宽等比缩小, 解决移动端横向挤压/拥挤;
  // 宽度充足(桌面)时不做缩放 (scale = 1); 同时记录可视高度供「适合页面(高度优先)」使用。
  const sheetFitWrapRef = useRef<HTMLDivElement | null>(null)
  const sheetFitRef = useRef<HTMLDivElement | null>(null)
  const [sheetFit, setSheetFit] = useState<{ avail: number; aH: number; w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const wrap = sheetFitWrapRef.current
    const sheet = sheetFitRef.current
    if (spread || !wrap || !sheet) return
    const measure = () => {
      const avail = wrap.clientWidth
      const aH = yScrollParent(wrap.parentElement)?.clientHeight ?? wrap.clientHeight
      const w = sheet.offsetWidth
      const h = sheet.offsetHeight
      if (w <= 0 || h <= 0) return
      setSheetFit((prev) =>
        prev && prev.avail === avail && prev.aH === aH && prev.w === w && prev.h === h ? prev : { avail, aH, w, h },
      )
    }
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(sheet)
    return () => ro.disconnect()
  }, [spread])

  // 单页查看控制 —— 与双页摊开同一套交互(缩放模式/平移/全屏/自动定位)
  type SheetZoom = { type: 'auto' | 'page' | 'width' } | { type: 'pct'; value: number }
  const [zoom, setZoom] = useState<SheetZoom>({ type: 'auto' })
  const [panMode, setPanMode] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ el: HTMLElement | null; sl: number; st: number; x: number; y: number } | null>(null)

  const pctOptions = useMemo(() => {
    const arr: number[] = []
    for (let v = PCT_MIN; v <= PCT_MAX; v += PCT_STEP) arr.push(v)
    return arr
  }, [])

  // 生效缩放: auto/width = 页宽自动适配(默认, 不出现横向滚动); page = 宽高双适配(整卷缩进可视高度);
  // pct = 以纸张真实尺寸为 100% 的固定百分比(放大后超出宽度, 容器可横向滚动)。
  const sheetScale = useMemo(() => {
    if (zoom.type === 'pct') return clampNum(zoom.value / 100, 0.05, 2)
    if (!sheetFit) return 1
    const fitW = clampNum((sheetFit.avail - 6) / sheetFit.w, 0.32, 1)
    if (zoom.type === 'page') {
      const fitH = (sheetFit.aH - 24) / sheetFit.h
      return clampNum(Math.min(fitW, fitH), 0.32, 1)
    }
    return fitW
  }, [zoom, sheetFit])

  const zoomSelectValue = zoom.type === 'pct' ? `pct-${zoom.value}` : zoom.type
  const handleZoomSelect = (v: string) => {
    if (v === 'auto' || v === 'page' || v === 'width') setZoom({ type: v })
    else if (v.startsWith('pct-')) {
      const n = Number(v.slice(4))
      if (!Number.isNaN(n)) setZoom({ type: 'pct', value: clampNum(n, PCT_MIN, PCT_MAX) })
    }
  }
  const stepZoom = (dir: number) => {
    const curPct = Math.round(sheetScale * 100)
    const base =
      zoom.type === 'pct'
        ? zoom.value
        : clampNum(Math.round(curPct / PCT_STEP) * PCT_STEP, PCT_MIN, PCT_MAX)
    setZoom({ type: 'pct', value: clampNum(base + dir * PCT_STEP, PCT_MIN, PCT_MAX) })
  }
  const toggleFs = async () => {
    const el = sheetFitWrapRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen?.()
    } catch {
      /* 浏览器拒绝时静默 */
    }
  }
  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // 拖拽平移(仅平移模式开启时): x 滚 wrapper; y 滚当前可视滚动容器(全屏时为 wrapper 自身)
  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panMode) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const w = sheetFitWrapRef.current
    if (!w) return
    e.preventDefault()
    w.setPointerCapture?.(e.pointerId)
    const vEl = isFs ? w : yScrollParent(w.parentElement)
    dragRef.current = { el: vEl, sl: w.scrollLeft, st: vEl?.scrollTop ?? 0, x: e.clientX, y: e.clientY }
    setDragging(true)
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const w = sheetFitWrapRef.current
    if (w) w.scrollLeft = d.sl - (e.clientX - d.x)
    if (d.el) d.el.scrollTop = d.st - (e.clientY - d.y)
  }
  const onPanEnd = () => {
    dragRef.current = null
    setDragging(false)
  }

  // 单页查看工具栏(缩放模式/百分比/平移/全屏/自动定位); 与双页共用同一份控件结构
  const sheetControls = (
    <>
      <Select value={zoomSelectValue} onValueChange={handleZoomSelect}>
        <SelectTrigger size="none" title={t('paperPreview.zoomTitle')} className="h-7 w-auto max-w-[200px] px-1 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t('paperPreview.zoomAuto')}</SelectItem>
          <SelectItem value="page">{t('paperPreview.zoomFitPage')}</SelectItem>
          <SelectItem value="width">{t('paperPreview.zoomFitWidth')}</SelectItem>
          <SelectGroup>
            <SelectLabel>%</SelectLabel>
            {pctOptions.map((v) => (
              <SelectItem key={v} value={`pct-${v}`}>
                {v}%
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <span className="mx-0.5 h-4 w-px bg-border" />

      <button
        type="button"
        onClick={() => stepZoom(-1)}
        title={t('paperPreview.zoomOut')}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-11 text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(sheetScale * 100)}%
      </span>
      <button
        type="button"
        onClick={() => stepZoom(1)}
        title={t('paperPreview.zoomIn')}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <span className="mx-0.5 h-4 w-px bg-border" />

      <button
        type="button"
        aria-pressed={panMode}
        onClick={() => setPanMode((v) => !v)}
        title={t('paperPreview.zoomPan')}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded hover:bg-muted',
          panMode && 'bg-muted text-primary',
        )}
      >
        <Hand className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void toggleFs()}
        title={isFs ? t('paperPreview.zoomExitFullscreen') : t('paperPreview.zoomFullscreen')}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
      >
        {isFs ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
      </button>
      {onToggleAutoLocate && (
        <button
          type="button"
          aria-pressed={autoLocate}
          onClick={onToggleAutoLocate}
          title={t('paperPreview.autoLocate')}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded hover:bg-muted',
            autoLocate && 'bg-muted text-primary',
          )}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  )
  // 锚定到外部顶栏(考试桌面端)时进顶栏; 无锚点(预览/移动端)或全屏时, 用卷内吸顶浮层
  const toolbarFloating = !readOnly && (!spreadToolbarAnchor || isFs)

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
        autoLocate={autoLocate}
        locateNonce={locateNonce}
        onToggleAutoLocate={onToggleAutoLocate}
      />
    )
  }

  return (
    <>
      <PaperSheetStyles />
      {spreadToolbarAnchor && !readOnly && !isFs && createPortal(sheetControls, spreadToolbarAnchor)}

      <div
        ref={sheetFitWrapRef}
        className={cn('w-full overflow-x-auto py-6', isFs && 'h-full overflow-y-auto bg-muted/40')}
        style={{
          cursor: panMode ? (dragging ? 'grabbing' : 'grab') : undefined,
          touchAction: panMode ? 'none' : undefined,
        }}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        {toolbarFloating && (
          <div className="sticky top-2 z-40 mx-auto mb-2 flex w-fit select-none items-center gap-1 rounded-lg border bg-background/95 px-1.5 py-1 shadow-md backdrop-blur">
            {sheetControls}
          </div>
        )}
        <div
          className="mx-auto w-fit overflow-hidden"
          style={{
            width: sheetFit ? sheetFit.w * sheetScale : 'auto',
            height: sheetFit ? sheetFit.h * sheetScale : 'auto',
          }}
        >
        <div
          className="paper-sheet"
          ref={sheetFitRef}
          style={{
            ...(cssVars as React.CSSProperties),
            transform: sheetScale !== 1 ? `scale(${sheetScale})` : undefined,
            transformOrigin: 'top left',
          }}
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
                {readOnly && (
                  <span className={cn('shrink-0', scoreBoxClass ?? 'border border-foreground/35 px-3 text-[10px] leading-5 text-muted-foreground')}>
                    <ScoreValue score={sec.scorePerQuestion} />
                  </span>
                )}
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
                            {grade && <GradeMark isCorrect={grade.isCorrect} partial={grade.partial} />}
                          </div>

                          <QuestionBody
                            q={q}
                            answer={answer ?? null}
                            onSet={(a) => set(q, a)}
                            readOnly={readOnly}
                            grade={grade}
                            optionStyle={tb.questionOption}
                            scorePerQuestion={sec.scorePerQuestion}
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
      </div>
    </>
  )
}
