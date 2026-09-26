import { ExamTimer } from './ExamTimer'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { PanelLeftClose } from 'lucide-react'
import type { ExamCard, ExamCardSection } from '@/lib/exam-paper'

/**
 * 左侧答题卡（桌面端）。
 *
 * 为什么从 `ExamSession` 里拆出来：它是"一屏里唯一与卷面无关的一块" —— 只依赖卡片序列、
 * 当前题号和几个判断函数。拆出来之后，主组件剩下的是卷面怎么排、卡片怎么答。
 *
 * 一条必须保住的视觉约定（拆之前就有的，别在重构里改掉）：**三种格子状态互斥且有序** ——
 * 当前格是 `bg-primary`，非当前且已答才是 `bg-emerald-500/80`，其余是虚线空框。
 * 冒烟测试里那条「答题卡绑定」断言就是按这个次序读的（先跳题、再要求第 1 格变已答）。
 */
interface Props {
  open: boolean
  onCollapse: () => void
  sections: ExamCardSection[]
  isAnswered: (card: ExamCard | undefined) => boolean
  currentIndex: number
  onJump: (index: number) => void
  /** 卡片在卷面上的题号（英语（一）的真实题号，不是数组下标） */
  cardNo: (card: ExamCard) => number
  /** 这道小题在卷面的哪个区间，用于格子的 tooltip */
  where: (card: ExamCard | undefined) => string
  answeredItems: number
  totalItems: number
  startedAt: string
  durationMs: number
  onTimerExpire: () => void
}

export function ExamAnswerSheet({
  open,
  onCollapse,
  sections,
  isAnswered,
  currentIndex,
  onJump,
  cardNo,
  where,
  answeredItems,
  totalItems,
  startedAt,
  durationMs,
  onTimerExpire,
}: Props) {
  const { t } = useT()

  return (
    <aside
      className={cn(
        'hidden lg:flex shrink-0 flex-col overflow-hidden bg-muted/20 transition-[width] duration-300 ease-in-out',
        open ? 'w-[300px] border-r' : 'w-0',
      )}
    >
      {open && (
        <div className="flex h-full min-h-0 w-[300px] flex-col">
          <div className="border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">答题卡</p>
              <div className="flex items-center gap-1.5">
                <ExamTimer startedAt={startedAt} durationMs={durationMs} onExpire={onTimerExpire} />
                <button
                  type="button"
                  onClick={onCollapse}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('exam.collapseSheet')}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />已答</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted border border-dashed border-muted-foreground/20" />未答</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {sections.map((sec) => {
              const secAnswered = sec.cards.filter(isAnswered).length
              return (
                <div key={sec.label} className="space-y-2">
                  {/* 分区层：Section I 完形填空 */}
                  <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                    <span className="text-[11px] font-semibold text-foreground">{sec.label}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {secAnswered}/{sec.cards.length}
                    </span>
                  </div>
                  {sec.blocks.map((block, bi) => (
                    <div key={`${sec.label}-${bi}`} className="space-y-1.5">
                      {/* 大题层：Text 1 / Text 2 …（完形、写作这类单大题分区不显示） */}
                      {block.label && (
                        <p className="text-[10px] text-muted-foreground">{block.label}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 content-start">
                        {block.cards.map((card) => {
                          const isCurrent = card.index === currentIndex
                          const answered = isAnswered(card)
                          const no = cardNo(card)
                          return (
                            <button key={`${card.question.id}-${card.subId}`}
                              onClick={() => onJump(card.index)}
                              title={`第 ${no} 题 · ${where(card)}`}
                              className={cn(
                                'h-7 w-7 rounded text-[11px] tabular-nums transition-all border border-dashed flex items-center justify-center',
                                isCurrent && 'bg-primary text-primary-foreground border-primary',
                                !isCurrent && answered && 'bg-emerald-500/80 text-white border-emerald-500',
                                !isCurrent && !answered && 'text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40',
                              )}
                            >
                              {no}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {/* 进度回填到答题卡底部 */}
          <div className="space-y-1.5 border-t p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">进度</span>
              <span className="tabular-nums">{answeredItems}/{totalItems}</span>
            </div>
            <Progress value={totalItems > 0 ? (answeredItems / totalItems) * 100 : 0} className="h-2 [&>div]:bg-emerald-500" />
          </div>
        </div>
      )}
    </aside>
  )
}
