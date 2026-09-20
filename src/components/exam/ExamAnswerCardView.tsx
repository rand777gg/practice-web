import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnswerSheetPrintSurface } from '@/components/templates/AnswerSheetPrintSurface'
import { OfficialAnswerCardStack, OfficialAnswerCardStyles } from '@/components/templates/OfficialAnswerCard'
import { A3_SHEET, objectiveCells, textToIdDigits, type OfficialCardDraft } from '@/lib/answer-sheet-official'
import { buildCardAnswers, columnToAnswerIndex, sectionByNo, type EnglishCardBinding, type NumberMap } from '@/lib/exam-answer-sheet'
import type { PaperSlot } from '@/lib/exam-paper'
import type { CorrectAnswer } from '@/types'
import { Separator } from '@/components/ui/separator'

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
  onAnswer,
  onIdentityChange,
  currentNo = null,
  onLocate,
  scale,
  className,
}: {
  binding: EnglishCardBinding
  numberMap: NumberMap
  answers: Map<string, CorrectAnswer>
  candidateNo?: string
  candidateName?: string
  institution?: string
  /** 在卡上直接点格子作答：回调给出该格对应的记录/小题与应用里的选项下标 */
  onAnswer?: (slot: PaperSlot, optionIndex: number) => void
  /** 当前小题的卷面题号：在卡上圈出这一行（双向定位的「卡片 → 答题卡」方向） */
  currentNo?: number | null
  /** 点卡上的题号区 → 回到该小题（「答题卡 → 卡片」方向） */
  onLocate?: (no: number) => void
  /** 卷面信息就地编辑（写回会话的封面字段） */
  onIdentityChange?: (patch: { institution?: string; candidateName?: string; candidateNo?: string }) => void
  /** 传了就固定缩放（外层自己量宽度）；不传则按容器宽度自适应 */
  scale?: number
  className?: string
}) {
  const [fit, setFit] = useState(true)
  const [printing, setPrinting] = useState(false)
  /** 整张 A3 / 单页 A4；单页时按折线裁成 foldPanels 张 A4，一张一张看 */
  const [a4, setA4] = useState(false)
  const [page, setPage] = useState(0)
  const panels = binding.card.foldPanels
  const lastPage = binding.card.faces.length * panels - 1
  const { boxRef, scale: fitScale } = useFitScale(a4 ? A3_SHEET.width / panels : A3_SHEET.width, fit)

  const draft: OfficialCardDraft = useMemo(() => ({
    institution,
    candidateName,
    idDigits: textToIdDigits(candidateNo),
    answers: buildCardAnswers(answers, numberMap, binding),
  }), [answers, numberMap, binding, candidateNo, candidateName, institution])

  const painted = Object.keys(draft.answers).length
  const objectiveCount = binding.sections.reduce((sum, s) => sum + (s.type === 'single_choice' ? s.count : 0), 0)
  const effectiveScale = scale ?? fitScale

  // 单页模式下跟着当前小题翻页：它在 A3 上落在哪个折页就翻到哪一页
  useEffect(() => {
    if (!a4 || currentNo == null) return
    const cell = objectiveCells(binding.card).find((c) => c.q === currentNo)
    if (cell) setPage(Math.floor(cell.x / (A3_SHEET.width / panels)))
  }, [a4, currentNo, binding.card, panels])

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">已涂 {painted} / {objectiveCount} 题</span>
        <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />
        <span>{binding.card.name}</span>
        {[...numberMap.warnings, ...binding.warnings].slice(0, 1).map((w) => (
          <span key={w} className="text-amber-600 dark:text-amber-500">· {w}</span>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {/* A3 横版按折线裁成两张 A4：单页看一张，字大一倍 */}
          <Button size="sm" variant={a4 ? 'outline' : 'secondary'} className="h-7 text-[11px]" onClick={() => setA4(false)}>
            整张 A3
          </Button>
          <Button size="sm" variant={a4 ? 'secondary' : 'outline'} className="h-7 text-[11px]" onClick={() => setA4(true)}>
            单页 A4
          </Button>
          {a4 && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="h-7 rounded border px-1.5 text-[11px] hover:bg-accent disabled:opacity-40"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                上一页
              </button>
              <span className="tabular-nums">{page + 1}/{lastPage + 1}</span>
              <button
                type="button"
                className="h-7 rounded border px-1.5 text-[11px] hover:bg-accent disabled:opacity-40"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                下一页
              </button>
            </span>
          )}
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
        <OfficialAnswerCardStack
          card={binding.card}
          scale={effectiveScale}
          draft={draft}
          crop={a4 ? { face: Math.floor(page / panels), panel: page % panels } : undefined}
          onToggleAnswer={onAnswer ? (no, column) => {
            const slot = numberMap.slotByNo.get(no)
            const section = sectionByNo(binding, no)
            if (!slot || !section) return
            // 列号必须先换算成选项下标：Part B 的 A、B、D、E、G 不连续
            const idx = columnToAnswerIndex(column, section)
            if (idx !== null) onAnswer(slot, idx)
          } : undefined}
          focusQ={currentNo}
          onLocateQ={onLocate}
        />
      </div>

      {onIdentityChange && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([
            { key: 'institution' as const, label: '报考单位', value: institution, placeholder: '如 重庆大学' },
            { key: 'candidateName' as const, label: '考生姓名', value: candidateName, placeholder: '如 张三丰' },
            { key: 'candidateNo' as const, label: '准考证号', value: candidateNo, placeholder: '15 位数字' },
          ]).map((f) => (
            <label key={f.key} className="block text-[11px] text-muted-foreground">
              {f.label}
              <input
                value={f.value}
                placeholder={f.placeholder}
                onChange={(e) => onIdentityChange({ [f.key]: e.target.value })}
                className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          ))}
        </div>
      )}

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
