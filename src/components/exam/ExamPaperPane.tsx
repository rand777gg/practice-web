import { useRef, useState } from 'react'
import { ExamAnswerCardView } from './ExamAnswerCardView'
import { EnglishRealPaper } from './EnglishRealPaper'
import { PaperPreview } from './PaperPreview'
import { cn } from '@/lib/utils'
import type { CorrectAnswer, ExamTemplate } from '@/types'
import type { PaperSlot } from '@/lib/exam-paper'
import type { EnglishCardBinding, NumberMap } from '@/lib/exam-answer-sheet'
import type { EnglishPaperLayout } from '@/lib/english-paper-layout'

/**
 * 卷面区（paper 模式）的三种排布，一个组件全包：
 *   1. 左侧「真实答题卡」+ 中间可拖动的分隔条（只有绑卡成功时才有）；
 *   2. 真题卷面 `EnglishRealPaper`（有真题布局 + 题号映射时）；
 *   3. 通用卷面 `PaperPreview`（其余情况，单页/双页都走它）。
 *
 * 为什么从 `ExamSession` 里拆出来：这三块共用同一个外层盒子的 className 与高度链
 * （`contents` vs `flex`，见下面的注释），而它们与"卡片模式怎么答"完全无关。
 * 拆之前先把行为钉住了（`smoke:routes`：「卷面缩放 + 真实答题卡绑定」+ 三种视图各自的
 * 题锚/选项断言）。
 *
 * 分隔条的宽度与拖拽状态**整体搬进来了** —— 它们只有这一块在用，留在主组件里
 * 只会让那个组件多两个没人读的 state。
 */
interface Props {
  /** 绑卡成功：左侧显示真实答题卡 */
  cardBinding: EnglishCardBinding | null
  numberMap: NumberMap | null
  answers: Map<string, CorrectAnswer>
  candidateNo: string
  candidateName: string
  institution: string
  onAnswerSlot: (slot: PaperSlot, value: CorrectAnswer) => void
  onIdentityPatch: (patch: { institution?: string; candidateName?: string; candidateNo?: string }) => void
  currentNo: number | null
  onLocate: (no: number) => void

  /** 真题卷面（有它且题号映射齐全时优先走它） */
  realPaper: EnglishPaperLayout | null
  pickedBySlot: Map<string, number>
  textBySlot: Map<string, string>

  /** 通用卷面 */
  title: string
  meta: string
  sections: Parameters<typeof PaperPreview>[0]['sections']
  onAnswer: (questionId: string, value: CorrectAnswer) => void
  currentQuestionId: string | null
  onFocusQuestion: (questionId: string) => void
  cover: ExamTemplate['cover'] | null
  templateLayout: ExamTemplate['layout'] | null

  paperLayout: 'sheet' | 'spread'
  spreadToolbarAnchor: HTMLElement | null
  autoLocate: boolean
  locateNonce: number
  onToggleAutoLocate: () => void
}

export function ExamPaperPane({
  cardBinding,
  numberMap,
  answers,
  candidateNo,
  candidateName,
  institution,
  onAnswerSlot,
  onIdentityPatch,
  currentNo,
  onLocate,
  realPaper,
  pickedBySlot,
  textBySlot,
  title,
  meta,
  sections,
  onAnswer,
  currentQuestionId,
  onFocusQuestion,
  cover,
  templateLayout,
  paperLayout,
  spreadToolbarAnchor,
  autoLocate,
  locateNonce,
  onToggleAutoLocate,
}: Props) {
  const [splitWidth, setSplitWidth] = useState(620)
  const splitDragRef = useRef<{ x: number; w: number } | null>(null)
  const clampSplit = (w: number) => Math.min(Math.max(w, 300), Math.max(420, window.innerWidth - 420))
  const showCard = !!cardBinding && !!numberMap
  const showRealPaper = !!realPaper && !!numberMap

  return (
    // 不开真实答题卡时用 contents —— 不生成盒子，试卷分支的 DOM 与改动前完全一致，
    // 免得这层包装把双页摊开需要的高度链弄断
    <div className={showCard ? 'flex min-w-0 flex-1' : 'contents'}>
      {showCard && (
        <>
          <div style={{ width: splitWidth }} className="shrink-0 overflow-y-auto border-r bg-neutral-100 p-2 dark:bg-neutral-900">
            <ExamAnswerCardView
              binding={cardBinding}
              numberMap={numberMap}
              answers={answers}
              candidateNo={candidateNo}
              candidateName={candidateName}
              institution={institution}
              onAnswer={onAnswerSlot}
              currentNo={currentNo}
              onLocate={onLocate}
              onIdentityChange={onIdentityPatch}
            />
          </div>
          {/* 分隔条：按住拖动调左右比例 */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="拖动调整比例"
            className="w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              splitDragRef.current = { x: e.clientX, w: splitWidth }
            }}
            onPointerMove={(e) => {
              const d = splitDragRef.current
              if (d) setSplitWidth(clampSplit(d.w + (e.clientX - d.x)))
            }}
            onPointerUp={(e) => {
              splitDragRef.current = null
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
            }}
          />
        </>
      )}
      {showRealPaper && (
        <div
          key={`real-paper-${paperLayout}`}
          className={cn(
            'wb-slide-in-right min-w-0 flex-1 p-4',
            paperLayout === 'spread' ? 'overflow-auto' : 'overflow-y-auto',
          )}
        >
          <EnglishRealPaper
            layout={realPaper}
            slotByNo={numberMap.slotByNo}
            pickedBySlot={pickedBySlot}
            textBySlot={textBySlot}
            onPick={onAnswerSlot}
            onText={onAnswerSlot}
            currentNo={currentNo}
            locateNonce={locateNonce}
            autoLocate={autoLocate}
            onLocate={onLocate}
            spread={paperLayout === 'spread'}
          />
        </div>
      )}
      {!showRealPaper && (
        <div key="paper" className="wb-slide-in-right flex-1 min-w-0 flex flex-col bg-neutral-200/60 dark:bg-neutral-950/40">
          {/* 单页长卷由外层滚动; 双页摊开由 PaperSpreadView 内部 scroller 滚动, 外层不再滚动, 避免右侧叠两根滚动条 */}
          <div
            key={paperLayout}
            className={cn('wb-fade-in flex-1 min-h-0', paperLayout === 'spread' ? 'overflow-hidden' : 'overflow-y-auto')}
          >
            <PaperPreview
              title={title}
              meta={meta}
              sections={sections}
              answers={answers}
              onAnswer={onAnswer}
              currentQuestionId={currentQuestionId}
              onFocus={onFocusQuestion}
              layout={paperLayout}
              cover={cover}
              paperLayout={templateLayout}
              spreadToolbarAnchor={spreadToolbarAnchor}
              autoLocate={autoLocate}
              locateNonce={locateNonce}
              onToggleAutoLocate={onToggleAutoLocate}
            />
          </div>
        </div>
      )}
    </div>
  )
}
