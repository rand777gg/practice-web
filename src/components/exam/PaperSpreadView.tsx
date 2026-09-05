/**
 * PaperSpreadView —— 试卷「双页分页视图」(纵向页流)。
 *
 * 语义替代旧的 CSS 多栏摊开(spread):
 *   - 整份卷子被切成若干张**固定页高**的纸(高度按可视区 vh 计算后等比缩放);
 *   - 页与页两两并排从上到下排布 —— 第一行 [封面 | 第2页], 第二行 [第3页 | 第4页]…;
 *   - 封面(若有且 coverOwnPage)单独占第 1 页, 正文从第 2 页开始, 不再堆叠在题目上方;
 *   - 题目/分区头/卷首等作为「原子块」, 用 DOM 实测高度做贪心分页(块不跨页;
 *     单个块超过整页时独占一页并在页内滚动兜底)。
 *
 * 渲染约定: 正文内容在「真实纸张尺寸(mm=px)」的坐标系里排版, 再用 CSS transform: scale()
 * 缩放到可视区 —— 因此字体/边距/水印全部按 A4 真实比例, 分页测量与缩放完全解耦,
 * 只有窗口尺寸变化时才需要重算 scale, 不用重新分页。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Hand, Maximize, Minimize, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DEFAULT_LAYOUT,
  layoutToCssVars,
  textBlockInlineStyle,
  PAPER_DIMENSIONS_MM,
  type ExamTemplateLayout,
} from '@/lib/paper-layout'
import { hasCoverContent, type ExamTemplateCover } from '@/lib/paper-cover'
import { PaperCover } from './PaperCover'
import { PaperSheetStyles } from './paper-sheet-styles'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { useT } from '@/i18n/use-t'
import {
  CaseSubItem,
  GradeBar,
  GradeMark,
  PageFooterBar,
  PaperLayoutOverlays,
  QuestionBody,
  type PaperGrade,
} from './paper-view-parts'
import { CN_NUM } from './paper-view-core'
import type { CaseAnswer, CorrectAnswer } from '@/types'
import type { PaperSection } from '@/lib/exam-compose'

/** mm → px (CSS 96dpi) */
const MM_PX = 96 / 25.4

const PX_PER_MM = MM_PX

/* ---- 双页视图查看控制(缩放/平移/全屏)常量 ---- */
const LIST_PAD_X = 24 // 列表左右留白(px-3 × 2)
const ROW_GAP_X = 20 // 双页之间
const LIST_PAD_BOTTOM = 24 // 列表底部留白(pb-6)
const MIN_SCALE = 0.32 // 兜底最小缩放
const PCT_MIN = 50 // 固定百分比缩放下限
const PCT_MAX = 200 // 固定百分比缩放下限
const PCT_STEP = 10 // +/- 步进

const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 与 paper-view-parts 一致的分数格式化(整数不带小数点) */
const fmtScore = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

interface Props {
  title: string
  meta?: string
  sections: PaperSection[]
  answers: Map<string, CorrectAnswer>
  onAnswer?: (questionId: string, answer: CorrectAnswer) => void
  currentQuestionId?: string | null
  onFocus?: (questionId: string) => void
  readOnly?: boolean
  /** 提供则进入批改视图: 卷面上标出对错、正确答案与解析 */
  grading?: Map<string, PaperGrade>
  /** 可选封面 */
  cover?: ExamTemplateCover | null
  /** 可选版式 token */
  paperLayout?: ExamTemplateLayout | null
  /**
   * 工具栏锚点: 传入某个已挂载元素时, 查看工具栏(缩放/平移/全屏)将通过 Portal 渲染到
   * 该元素内(如考试卷面的「模板名」顶栏), 不再以浮层盖在页面上; 不传则回退为左上角浮层。
   */
  toolbarAnchor?: HTMLElement | null
}

/* ---------------- 分页数据模型 ---------------- */

type FlowItem =
  | { kind: 'cover'; key: string }
  | { kind: 'head'; key: string }
  | { kind: 'secHead'; key: string; si: number; sec: PaperSection; total: number; noScore: boolean }
  | { kind: 'q'; key: string; si: number; qid: string; no: number; sec: PaperSection }
  // 案例分析题拆分为三个子类原子块: 题干/材料(qCase) + 每个小题独立分页(qSub) + 批改解析尾(qTail)。
  // 小题逐块分页后不再出现「一整道案例超高占一页+页内滚动」的情况, 双页视图不会裁切。
  | { kind: 'qCase'; key: string; si: number; qid: string; no: number; sec: PaperSection }
  | { kind: 'qSub'; key: string; si: number; qid: string; sec: PaperSection; subIdx: number }
  | { kind: 'qTail'; key: string; si: number; qid: string; sec: PaperSection }

interface PageData {
  /** items 下标(共用全局 flowItems 数组) */
  indexes: number[]
  /** 本页有一个超高原子块, 需要在页内滚动兜底 */
  tall: boolean
}

/** 首页封面单独一页时不排页脚 */
function isCoverOnlyPage(pageIndexes: number[], items: FlowItem[]): boolean {
  return pageIndexes.length === 1 && items[pageIndexes[0]]?.kind === 'cover'
}

export function PaperSpreadView({
  title,
  meta,
  sections,
  answers,
  onAnswer,
  currentQuestionId,
  onFocus,
  readOnly,
  grading,
  cover,
  paperLayout,
  toolbarAnchor = null,
}: Props) {
  const { t } = useT()

  const hasLayout = !!paperLayout
  const effLayout = paperLayout ?? DEFAULT_LAYOUT
  const cssVars = hasLayout ? layoutToCssVars(effLayout, 'sheet') : undefined

  const showTitle = hasLayout ? effLayout.showPaperTitle : true
  const showMeta = hasLayout ? effLayout.showPaperMeta : true
  const coverOwnPage = effLayout.coverOwnPage !== false
  const coverPresent = hasCoverContent(cover)

  const scoreBoxClass = !paperLayout
    ? undefined
    : paperLayout.scoreBox === 'always'
      ? 'paper-score-box-always'
      : paperLayout.scoreBox === 'none'
        ? 'paper-score-box-none'
        : 'paper-score-box-optional'

  const tb = useMemo(
    () => ({
      paperTitle: textBlockInlineStyle(paperLayout, 'paperTitle'),
      paperMeta: textBlockInlineStyle(paperLayout, 'paperMeta'),
      sectionTitle: textBlockInlineStyle(paperLayout, 'sectionTitle'),
      questionStem: textBlockInlineStyle(paperLayout, 'questionStem'),
      questionOption: textBlockInlineStyle(paperLayout, 'questionOption'),
    }),
    [paperLayout],
  )

  /* 题号跨分区连续 */
  const numbered = useMemo(() => {
    let n = 0
    return sections.map((sec) => ({
      ...sec,
      items: sec.questions.map((q) => ({ q, no: ++n })),
    }))
  }, [sections])

  const total = numbered.reduce((sum, s) => sum + s.items.length, 0)

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

  /* ---------------- 版面几何(真实 mm 尺寸) ---------------- */
  const geom = useMemo(() => {
    const dim = PAPER_DIMENSIONS_MM[effLayout.paperSize]
    const isLandscape = effLayout.orientation === 'landscape'
    const widthMm = isLandscape ? dim.height : dim.width
    const heightMm = isLandscape ? dim.width : dim.height
    const { margins, binderLine } = effLayout
    const binderExtra =
      binderLine.side === 'none' ? 0 : binderLine.offsetMm + binderLine.widthMm + 4
    let padL = margins.leftMm
    let padR = margins.rightMm
    if (binderLine.side === 'left') padL += binderExtra
    if (binderLine.side === 'right') padR += binderExtra
    return {
      realW: widthMm * PX_PER_MM,
      realH: heightMm * PX_PER_MM,
      padTopMm: margins.topMm,
      padBottomMm: margins.bottomMm,
      padL,
      padR,
      contentW: (widthMm - padL - padR) * PX_PER_MM,
      contentH: (heightMm - margins.topMm - margins.bottomMm) * PX_PER_MM,
    }
  }, [effLayout])

  /* ---------------- 流动内容: 封面 / 卷首 / 分区头 / 题目 ---------------- */
  const items = useMemo<FlowItem[]>(() => {
    const out: FlowItem[] = []
    if (coverPresent) out.push({ kind: 'cover', key: 'flow-cover' })
    out.push({ kind: 'head', key: 'flow-head' })
    numbered.forEach((sec, si) => {
      if (sec.items.length === 0) return
      out.push({
        kind: 'secHead',
        key: `flow-sec-${si}`,
        si,
        sec,
        total: sec.items.length,
        noScore: sec.scorePerQuestion <= 0,
      })
      sec.items.forEach(({ q, no }) => {
        // 案例分析题: 题干与每个小题各是独立原子块, 便于分页时逐小题流动(不超高、不裁切)
        if (q.question_type === 'case_analysis') {
          const subs = q.case_questions ?? []
          out.push({ kind: 'qCase', key: `flow-case-${q.id}`, si, qid: q.id, no, sec })
          subs.forEach((_, subIdx) => {
            out.push({ kind: 'qSub', key: `flow-csub-${q.id}-${subIdx}`, si, qid: q.id, sec, subIdx })
          })
          // 批改视图才有的「解析/正确答案」尾条, 紧随最后一个小题之后流动
          if (grading) out.push({ kind: 'qTail', key: `flow-ctail-${q.id}`, si, qid: q.id, sec })
        } else {
          out.push({ kind: 'q', key: `flow-q-${q.id}`, si, qid: q.id, no, sec })
        }
      })
    })
    return out
  }, [coverPresent, numbered, grading])

  /** 单个原子块的渲染; 测量容器与真实分页页必须共用同一实现, 保证高度一致 */
  const renderItemContent = useCallback(
    (item: FlowItem, opts: { activeQid?: string | null; flashQid?: string | null } = {}) => {
      const { activeQid = null, flashQid = null } = opts
      if (item.kind === 'cover') {
        return <PaperCover cover={cover!} bare overlays={false} paperLayout={paperLayout} />
      }
      if (item.kind === 'head') {
        return (
          <header className="text-center">
            {showTitle && (
              <h1 className="font-semibold tracking-wide text-lg" style={tb.paperTitle}>
                {title}
              </h1>
            )}
            {showMeta && meta && (
              <p className="mt-1 text-xs text-muted-foreground" style={tb.paperMeta}>
                {meta}
              </p>
            )}
            <div
              className={cn(
                (showTitle || showMeta) && 'mt-3 border-t border-double border-t-4 border-foreground pt-2',
                'text-xs text-muted-foreground',
              )}
            >
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
        )
      }
      if (item.kind === 'secHead') {
        const { sec } = item
        return (
          <div className="paper-sec-head flex items-end justify-between border-b border-foreground/15 pb-1">
            <h2 className="font-semibold text-sm" style={tb.sectionTitle}>
              {CN_NUM[item.si] ?? item.si + 1}、{sec.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                （
                {item.noScore
                  ? t('paperPreview.sectionHintNoScore').replace('{n}', String(item.total))
                  : t('paperPreview.sectionHint')
                    .replace('{n}', String(item.total))
                    .replace('{s}', String(sec.scorePerQuestion))
                    .replace('{t}', String(item.total * sec.scorePerQuestion))}
                ）
              </span>
            </h2>
            <span
              className={cn(
                'shrink-0',
                scoreBoxClass ?? 'border border-foreground/35 px-3 text-[10px] leading-5 text-muted-foreground',
              )}
            >
              {t('paperPreview.scoreBox')}
            </span>
          </div>
        )
      }
      // === 案例分析题: 题干/材料独立一页块(qCase) ===
      if (item.kind === 'qCase') {
        const q = numbered[item.si]?.items.find((it) => it.q.id === item.qid)?.q
        if (!q) return null
        const grade = grading?.get(q.id)
        const active = activeQid === q.id
        const flashing = flashQid === q.id
        const subs = q.case_questions ?? []
        const scorePerQuestion = numbered[item.si]?.scorePerQuestion ?? 0
        return (
          <div
            className={cn(
              'paper-q rounded',
              (active || flashing) && 'rounded px-2 ring-2 ring-blue-400/60',
              flashing && 'ring-amber-400',
              active && '-mx-2 px-2',
            )}
            data-qid={q.id}
            onMouseDown={() => onFocus?.(q.id)}
          >
            <div className="flex gap-2">
              <span className="shrink-0 tabular-nums">{item.no}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span style={tb.questionStem} className="contents">
                    <MarkdownRenderer content={q.question_text} className="paper-md inline-block align-top" />
                  </span>
                  {grade && <GradeMark isCorrect={grade.isCorrect} partial={grade.partial} />}
                </div>
                {subs.length > 0 ? (
                  scorePerQuestion > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      本题共 {subs.length} 小题，每小题 {fmtScore(scorePerQuestion / subs.length)} 分
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">该案例尚未配置小题</p>
                )}
              </div>
            </div>
          </div>
        )
      }
      // === 案例分析题: 每个小题是独立原子块, 可跨页流动 ===
      if (item.kind === 'qSub') {
        const q = numbered[item.si]?.items.find((it) => it.q.id === item.qid)?.q
        if (!q) return null
        const sub = q.case_questions?.[item.subIdx]
        if (!sub) return null
        const cur = answers.get(q.id)
        const answerObj =
          cur && typeof cur === 'object' && !Array.isArray(cur) && 'subs' in (cur as object)
            ? (cur as CaseAnswer)
            : null
        const grade = grading?.get(q.id)
        const active = activeQid === q.id
        const flashing = flashQid === q.id
        return (
          <div
            className={cn(
              'ml-5 rounded',
              (active || flashing) && 'ring-2 ring-blue-400/60',
              flashing && 'ring-amber-400',
            )}
            data-qid={q.id}
            onMouseDown={() => onFocus?.(q.id)}
          >
            <CaseSubItem
              sub={sub}
              si={item.subIdx}
              value={answerObj?.subs?.find((s) => s.id === sub.id)?.value}
              grading={!!grade}
              readOnly={readOnly}
              optionStyle={tb.questionOption}
              onSet={(v) => {
                if (readOnly) return
                onAnswer?.(q.id, {
                  subs: [...(answerObj?.subs ?? []).filter((s) => s.id !== sub.id), { id: sub.id, value: v }],
                } as CaseAnswer)
              }}
            />
          </div>
        )
      }
      // === 案例分析题: 批改解析尾(正确答案/你的答案/解析), 仅在批改视图存在 ===
      if (item.kind === 'qTail') {
        const q = numbered[item.si]?.items.find((it) => it.q.id === item.qid)?.q
        if (!q) return null
        const grade = grading?.get(q.id)
        if (!grade) return null
        return (
          <div className="ml-5" data-qid={q.id}>
            <GradeBar q={q} grade={grade} answer={answers.get(q.id) ?? null} />
          </div>
        )
      }
      // kind === 'q' (非案例分析题)
      const q = numbered[item.si]?.items.find((it) => it.q.id === item.qid)?.q
      if (!q) return null
      const answer = answers.get(q.id)
      const grade = grading?.get(q.id)
      const active = activeQid === q.id
      const flashing = flashQid === q.id
      const set = (a: CorrectAnswer) => {
        if (readOnly) return
        onAnswer?.(q.id, a)
      }
      return (
        <div
          className={cn(
            'paper-q rounded',
            (active || flashing) && 'rounded px-2 ring-2 ring-blue-400/60',
            flashing && 'ring-amber-400',
            active && '-mx-2 px-2',
          )}
          data-qid={q.id}
          onMouseDown={() => onFocus?.(q.id)}
        >
          <div className="flex gap-2">
            <span className="shrink-0 tabular-nums">{item.no}.</span>
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
                onSet={set}
                readOnly={readOnly}
                grade={grade}
                optionStyle={tb.questionOption}
                scorePerQuestion={numbered[item.si]?.scorePerQuestion ?? 0}
              />
              {grade && <GradeBar q={q} grade={grade} answer={answer ?? null} />}
            </div>
          </div>
        </div>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numbered, answers, grading, readOnly, cover, coverPresent, showTitle, showMeta, meta, title, total, gradedTotal, tb, scoreBoxClass, t, paperLayout],
  )

  /* 原子块的间隔(写在包装 div 的 margin-bottom 上; 分页测量按「包含间隔的推进高度」计) */
  const itemSpaceClass = (item: FlowItem) => {
    switch (item.kind) {
      case 'cover':
        return ''
      case 'q':
      case 'qCase':
      case 'qSub':
      case 'qTail':
        return 'mb-3'
      case 'secHead':
        return 'mb-2'
      default:
        return 'mb-5'
    }
  }

  /* ---------------- 测量 & 分页 ---------------- */
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [pages, setPages] = useState<PageData[] | null>(null)
  const [fontTick, setFontTick] = useState(0)

  // 挂载 / 内容 / 网页字体就绪变化 → 在绘制前用 DOM 实测各原子块高度并贪心分页。
  // (fontTick 仅用于触发重测, 不参与算法本身)
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const children = Array.from(root.children) as HTMLElement[]
    if (children.length === 0) return
    const rects = children.map((c) => c.getBoundingClientRect())
    const advances: number[] = rects.map((r, i) => (i === 0 ? r.height : r.top - rects[i - 1].top))
    const contentH = geom.contentH - 0.5

    const out: PageData[] = []
    let cur: number[] = []
    let curUsed = 0
    const flush = () => {
      if (cur.length) {
        out.push({ indexes: cur, tall: false })
        cur = []
        curUsed = 0
      }
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const h = advances[i]
      // 封面独占页
      if (it.kind === 'cover' && coverOwnPage) {
        flush()
        out.push({ indexes: [i], tall: false })
        continue
      }
      // 超高原子块: 独占一页, 页内滚动兜底
      if (h > contentH + 0.5) {
        flush()
        out.push({ indexes: [i], tall: true })
        continue
      }
      if (cur.length && curUsed + h > contentH + 0.5) {
        flush()
      }
      cur.push(i)
      curUsed += h
    }
    flush()
    setPages(out.length ? out : [])
  }, [items, geom, coverOwnPage, fontTick])

  // 网页字体就绪后高度可能变化 → 触发一次重测;
  // 额外延迟再测两次以覆盖 Markdown 图片等异步资源加载完成后引起的行高变化, 避免页内裁切。
  useEffect(() => {
    let mounted = true
    const bump = () => {
      if (mounted) setFontTick((n) => n + 1)
    }
    document.fonts?.ready.then(bump).catch(() => {})
    const t1 = window.setTimeout(bump, 500)
    const t2 = window.setTimeout(bump, 1500)
    window.addEventListener('load', bump)
    return () => {
      mounted = false
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('load', bump)
    }
  }, [])

  /* ---------------- 可视区尺寸 → 缩放比 ---------------- */
  const viewRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = () => {
      const h = el.clientHeight > 0 ? el.clientHeight : window.innerHeight * 0.78
      const w = el.clientWidth > 0 ? el.clientWidth : window.innerWidth * 0.94
      setBox((prev) => (prev && Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // ---------- 查看工具栏: 缩放模式 / 平移 / 全屏 ----------
  type ZoomMode = { type: 'auto' | 'page' | 'width' } | { type: 'pct'; value: number }
  const [zoomMode, setZoomMode] = useState<ZoomMode>({ type: 'auto' })
  const [panMode, setPanMode] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const panRef = useRef<{ sl: number; st: number; x: number; y: number } | null>(null)

  // 工具栏锚定在外部(如卷面模板名顶栏)时, 页面首行不再需要给内置浮层让位;
  // 进入全屏后外部顶栏不可见, 需要退回为全屏元素内的浮层工具栏
  const anchoredToolbar = !!toolbarAnchor && !isFs
  const listPadTop = anchoredToolbar ? 12 : 52 // 52px: 浮层工具栏高度 + 8px 间隙

  // 自动缩放(默认): 依据「试卷可用宽度」实时计算 —— 收起/展开答题卡、窗口缩放、
  // 全屏切换等引起的容器宽度变化(由 ResizeObserver 观测 viewRef 驱动 box 更新)
  // 会立即重算 scale 并通过 transform 应用到已分页的纸张上, 无需重新分页。
  const autoScale = useMemo(() => {
    if (!box || !geom.realW || !geom.realH) return 0.55
    const s = (box.w - LIST_PAD_X - ROW_GAP_X) / (2 * geom.realW) // 让双页占满可用宽度
    if (!Number.isFinite(s)) return 0.55
    return clampNum(s, MIN_SCALE, 1)
  }, [box, geom])

  // 当前生效缩放
  const scale = useMemo(() => {
    if (!box || !geom.realW || !geom.realH) return zoomMode.type === 'pct' ? zoomMode.value / 100 : 0.55
    const fitWidthScale = (box.w - LIST_PAD_X - ROW_GAP_X) / (2 * geom.realW) // 填满双页宽度
    const fitHeightScale = (box.h - listPadTop - LIST_PAD_BOTTOM) / geom.realH // 高度优先(整页纵向放得下)
    switch (zoomMode.type) {
      case 'page': // 适合页面(高度优先): 整页完整可见, 不溢出
        return clampNum(Math.min(fitWidthScale, fitHeightScale), MIN_SCALE, 1)
      case 'width': // 适合页宽(页宽优先): 填满横向宽度, 允许纵向溢出滚动
        return clampNum(fitWidthScale, MIN_SCALE, 1)
      case 'pct': // 固定百分比(50%–200%, 以纸张真实尺寸为 100%)
        return clampNum(zoomMode.value / 100, 0.05, 2)
      case 'auto':
      default:
        return autoScale
    }
  }, [zoomMode, autoScale, box, geom, listPadTop])

  const pctOptions = useMemo(() => {
    const arr: number[] = []
    for (let v = PCT_MIN; v <= PCT_MAX; v += PCT_STEP) arr.push(v)
    return arr
  }, [])

  const zoomSelectValue = zoomMode.type === 'pct' ? `pct-${zoomMode.value}` : zoomMode.type
  const handleZoomSelect = (v: string) => {
    if (v === 'auto' || v === 'page' || v === 'width') {
      setZoomMode({ type: v })
    } else if (v.startsWith('pct-')) {
      const n = Number(v.slice(4))
      if (!Number.isNaN(n)) setZoomMode({ type: 'pct', value: clampNum(n, PCT_MIN, PCT_MAX) })
    }
  }
  const stepZoom = (dir: number) => {
    const curPct = Math.round(scale * 100)
    const base =
      zoomMode.type === 'pct'
        ? zoomMode.value
        : clampNum(Math.round(curPct / PCT_STEP) * PCT_STEP, PCT_MIN, PCT_MAX)
    setZoomMode({ type: 'pct', value: clampNum(base + dir * PCT_STEP, PCT_MIN, PCT_MAX) })
  }

  const toggleFs = async () => {
    const el = viewRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen?.()
      }
    } catch {
      /* 全屏被浏览器拒绝时静默 */
    }
  }
  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  /* ---------------- 答题卡跳题: 定位到题目所在行并闪烁 ---------------- */
  const rowEls = useRef<Map<number, HTMLElement>>(new Map())
  const [flashQid, setFlashQid] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (readOnly || !currentQuestionId || !pages) return
    let pageIdx = -1
    for (let p = 0; p < pages.length; p++) {
      for (const i of pages[p].indexes) {
        if ((items[i].kind === 'q' || items[i].kind === 'qCase') && items[i].qid === currentQuestionId) {
          pageIdx = p
          break
        }
      }
      if (pageIdx >= 0) break
    }
    if (pageIdx < 0) return
    const rowIdx = Math.floor(pageIdx / 2)
    const el = rowEls.current.get(rowIdx)
    if (el) {
      const scroller = scrollerRef.current
      if (scroller) {
        const viewRect = scroller.getBoundingClientRect()
        const rowTopInScroller = el.getBoundingClientRect().top - viewRect.top + scroller.scrollTop
        // 顶部让出工具栏高度, 避免目标被浮层工具条遮住(锚定到外部顶栏时只需小间距)
        const reserveTop = listPadTop + 4
        let top = rowTopInScroller - reserveTop
        // 页面高度超过可视区时, 尽量把「题目本身」滚进可视区, 而不是只滚到页顶
        const rowRect = el.getBoundingClientRect()
        if (rowRect.height > viewRect.height - 12) {
          const qEl = el.querySelector<HTMLElement>(`[data-qid="${CSS.escape(currentQuestionId)}"]`)
          if (qEl) {
            const qInRow = qEl.getBoundingClientRect().top - rowRect.top
            top = rowTopInScroller + qInRow - reserveTop
          }
        }
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setFlashQid(currentQuestionId)
      const timer = setTimeout(() => setFlashQid(null), 1200)
      return () => clearTimeout(timer)
    }
  }, [currentQuestionId, pages, items, readOnly, listPadTop])

  /* ---------------- 渲染 ---------------- */
  const rows = useMemo(() => {
    if (!pages) return null
    const out: PageData[][] = []
    for (let i = 0; i < pages.length; i += 2) out.push(pages.slice(i, i + 2))
    return out
  }, [pages])

  const renderPage = (page: PageData, pageNo: number, totalPages: number) => {
    const scaledW = geom.realW * scale
    const scaledH = geom.realH * scale
    const isCover = isCoverOnlyPage(page.indexes, items)
    const showFooter = hasLayout && !isCover
    return (
      <div
        key={pageNo}
        className="relative shrink-0"
        style={{ width: scaledW, height: scaledH, overflow: 'hidden' }}
      >
        <div
          className="paper-sheet"
          style={{
            ...(cssVars as React.CSSProperties),
            width: geom.realW,
            height: geom.realH,
            minHeight: geom.realH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            overflowY: page.tall ? 'auto' : 'hidden',
            overflowX: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,.12), 0 6px 18px rgba(0,0,0,.10)',
          }}
        >
          {paperLayout && <PaperLayoutOverlays layout={effLayout} />}
          {page.indexes.map((idx) => {
            const item = items[idx]
            return (
              <div key={item.key} className={cn('paper-pg-item', itemSpaceClass(item))}>
                {renderItemContent(item, { activeQid: currentQuestionId, flashQid })}
              </div>
            )
          })}
          {showFooter && <PageFooterBar layout={effLayout} page={pageNo + 1} total={totalPages} />}
        </div>
      </div>
    )
  }

  /* 查看工具栏控件(浮层 / 锚定到外部顶栏 共用同一份) */
  const toolbarControls = (
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
        {Math.round(scale * 100)}%
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
        onClick={toggleFs}
        title={isFs ? t('paperPreview.zoomExitFullscreen') : t('paperPreview.zoomFullscreen')}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
      >
        {isFs ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
      </button>
    </>
  )

  const pageTotal = pages?.length ?? 0

  return (
    <>
      <PaperSheetStyles />
      <div ref={viewRef} className="paper-spread-view relative h-full min-h-0">
        {rows && pageTotal > 0 && !anchoredToolbar && (
          <div className="paper-spread-toolbar absolute left-2 top-2 z-40 flex select-none items-center gap-1 rounded-lg border bg-background/95 px-1.5 py-1 shadow-md backdrop-blur">
            {toolbarControls}
          </div>
        )}
        {rows && pageTotal > 0 && toolbarAnchor && anchoredToolbar && createPortal(toolbarControls, toolbarAnchor)}

        {rows && (
          <div
            ref={scrollerRef}
            className={cn('paper-spread-scroll h-full min-h-0 overflow-auto', isFs && 'bg-muted/40')}
            style={{
              cursor: panMode ? (dragging ? 'grabbing' : 'grab') : undefined,
              touchAction: panMode ? 'none' : undefined,
            }}
            onPointerDown={(e) => {
              if (!panMode) return
              if (e.pointerType === 'mouse' && e.button !== 0) return
              const s = scrollerRef.current
              if (!s) return
              e.preventDefault()
              s.setPointerCapture?.(e.pointerId)
              panRef.current = { sl: s.scrollLeft, st: s.scrollTop, x: e.clientX, y: e.clientY }
              setDragging(true)
            }}
            onPointerMove={(e) => {
              const p = panRef.current
              const s = scrollerRef.current
              if (!panMode || !p || !s) return
              s.scrollLeft = p.sl - (e.clientX - p.x)
              s.scrollTop = p.st - (e.clientY - p.y)
            }}
            onPointerUp={(e) => {
              if (panRef.current) {
                const s = scrollerRef.current
                try {
                  s?.releasePointerCapture?.(e.pointerId)
                } catch {
                  /* 指针可能已释放 */
                }
              }
              panRef.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              panRef.current = null
              setDragging(false)
            }}
            onClickCapture={(e) => {
              // 平移模式下吞掉点击, 避免误触卷面上的作答控件
              if (panMode) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
          >
            <div
              className="mx-auto flex min-w-full flex-col gap-y-6 px-3 pb-6"
              style={{ width: 'max-content', paddingTop: listPadTop }}
            >
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  ref={(el) => {
                    if (el) rowEls.current.set(ri, el)
                    else rowEls.current.delete(ri)
                  }}
                  className="flex justify-center"
                  style={{ gap: ROW_GAP_X }}
                >
                  {row.map((page, slot) => renderPage(page, ri * 2 + slot, pageTotal))}
                </div>
              ))}
              {/* 空卷兜底 */}
              {pageTotal === 0 && (
                <p className="text-sm text-muted-foreground">{t('exam.noExam')}</p>
              )}
            </div>
          </div>
        )}
        {/* 测量容器: 与真实分页页同宽同字环境, 只用于读取各原子块高度 */}
        <div
          ref={measureRef}
          aria-hidden
          className="paper-sheet"
          style={{
            ...(cssVars as React.CSSProperties),
            position: 'absolute',
            left: -100000,
            top: 0,
            width: geom.contentW,
            height: 'auto',
            minHeight: 0,
            padding: 0,
            border: 'none',
            boxShadow: 'none',
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {items.map((item) => (
            <div key={`m-${item.key}`} className={itemSpaceClass(item)}>
              {renderItemContent(item)}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
