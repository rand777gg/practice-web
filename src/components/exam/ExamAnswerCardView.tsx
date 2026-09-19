import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnswerSheetPrintSurface } from '@/components/templates/AnswerSheetPrintSurface'
import { OfficialAnswerCardStack, OfficialAnswerCardStyles } from '@/components/templates/OfficialAnswerCard'
import { A3_SHEET, textToIdDigits, type OfficialCardDraft } from '@/lib/answer-sheet-official'
import { buildCardAnswers, type EnglishCardBinding, type NumberMap } from '@/lib/exam-answer-sheet'
import type { CorrectAnswer } from '@/types'

const MM_TO_PX = 96 / 25.4

/** 量容器宽度换算缩放，最多 1:1（与模板页那份同一个思路） */
function useFitScale(sheetWidthMm: number, fit: boolean) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
    observer.observe(el)
    setBoxWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  return { boxRef, scale: fit && boxWidth > 0 ? Math.min(1, boxWidth / (sheetWidthMm * MM_TO_PX)) : 1 }
}

/**
 * 考试模式里的「真实答题卡」视图。
 *
 * 刻意做成纯展示组件（只吃 props、不碰 store）：考试模式的会话态很难端到端测
 * （要登录 + 库里得有英语一的题），而这一层是能单独验证的——只要把 answers 和
 * 映射喂进来就能看出涂卡对不对。
 *
 * 学生照旧在题目上作答，这里实时把作答涂到真卡上；交卷前后都能打印。
 */
export function ExamAnswerCardView({
  binding,
  numberMap,
  answers,
  candidateNo = '',
  candidateName = '',
  institution = '',
  scale,
  className,
}: {
  binding: EnglishCardBinding
  numberMap: NumberMap
  answers: Map<string, CorrectAnswer>
  candidateNo?: string
  candidateName?: string
  institution?: string
  /** 传了就固定缩放（外层自己量宽度）；不传则按容器宽度自适应 */
  scale?: number
  className?: string
}) {
  const [fit, setFit] = useState(true)
  const [printing, setPrinting] = useState(false)
  const { boxRef, scale: fitScale } = useFitScale(A3_SHEET.width, fit)

  const draft: OfficialCardDraft = useMemo(() => ({
    institution,
    candidateName,
    idDigits: textToIdDigits(candidateNo),
    answers: buildCardAnswers(answers, numberMap, binding),
  }), [answers, numberMap, binding, candidateNo, candidateName, institution])

  const painted = Object.keys(draft.answers).length
  const objectiveCount = binding.sections.reduce((sum, s) => sum + (s.type === 'single_choice' ? s.count : 0), 0)
  const effectiveScale = scale ?? fitScale

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">已涂 {painted} / {objectiveCount} 题</span>
        <span>·</span>
        <span>{binding.card.name}</span>
        {[...numberMap.warnings, ...binding.warnings].slice(0, 1).map((w) => (
          <span key={w} className="text-amber-600 dark:text-amber-500">· {w}</span>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant={fit ? 'secondary' : 'outline'} className="h-7 text-[11px]" onClick={() => setFit(true)}>
            <Maximize2 className="mr-1 h-3 w-3" />
            适应宽度
          </Button>
          <Button size="sm" variant={fit ? 'outline' : 'secondary'} className="h-7 text-[11px]" onClick={() => setFit(false)}>
            100%
          </Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={() => setPrinting(true)}>
            <Printer className="mr-1 h-3 w-3" />
            打印答题卡
          </Button>
        </div>
      </div>

      <div ref={boxRef} className="max-h-[70vh] overflow-auto border bg-neutral-100 p-3 dark:bg-neutral-900">
        <OfficialAnswerCardStyles />
        <OfficialAnswerCardStack card={binding.card} scale={effectiveScale} draft={draft} />
      </div>

      {printing && (
        <AnswerSheetPrintSurface
          pageWidthMm={A3_SHEET.width}
          pageHeightMm={A3_SHEET.height}
          sheetSelector=".official-sheet"
          onClose={() => setPrinting(false)}
        >
          <OfficialAnswerCardStyles />
          <OfficialAnswerCardStack card={binding.card} draft={draft} />
        </AnswerSheetPrintSurface>
      )}
    </div>
  )
}
