import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { ClipboardList, Columns2, Crosshair, FileText, LayoutGrid, PanelLeftClose, PanelLeftOpen, Send } from 'lucide-react'

/**
 * 考试页顶部工具栏：答题卡开关 / 模式切换（单页·双页·卡片）/ 交卷。
 *
 * 为什么从 `ExamSession` 里拆出来：那个组件有 1900 行，工具栏是其中**唯一**只依赖
 * 十来个值的独立一块 —— 拆出来之后主组件里剩下的是"卷面怎么排"和"卡片怎么答"，
 * 而不是"按钮长什么样"。拆之前已经先把行为钉住了（`smoke:routes` 的
 * 「卷面缩放 + 真实答题卡绑定」，以及三种视图的题锚/选项断言）。
 *
 * 两个「真实答题卡」相关的按钮只在对应条件成立时出现：
 *   · `canBindCard`  —— 卷面结构与英语（一）对得上，才有那张机读卡可开；
 *   · `canAutoLocate` —— 有真题卷面 + 题号映射，切题才能定位到卷面上的那一小题。
 * 条件判断留在主组件里（它才知道卷面结构），这里只收一个布尔值。
 */

export type ExamViewMode = 'card' | 'sheet' | 'spread'

interface Props {
  /** 卷面（模板）标题 */
  title: string
  viewMode: ExamViewMode
  onViewMode: (m: ExamViewMode) => void
  answeredItems: number
  totalItems: number
  sheetOpen: boolean
  onToggleSheet: () => void
  /** 卷面查看工具栏（缩放/平移/全屏）的挂载锚点：桌面端挂进这个工具栏 */
  onToolbarAnchor: (el: HTMLElement | null) => void
  showToolbarAnchor: boolean
  canBindCard: boolean
  cardViewOpen: boolean
  onToggleCardView: () => void
  canAutoLocate: boolean
  autoLocate: boolean
  onToggleAutoLocate: () => void
  submitting: boolean
  onSubmit: () => void
}

export function ExamToolbar({
  title,
  viewMode,
  onViewMode,
  answeredItems,
  totalItems,
  sheetOpen,
  onToggleSheet,
  onToolbarAnchor,
  showToolbarAnchor,
  canBindCard,
  cardViewOpen,
  onToggleCardView,
  canAutoLocate,
  autoLocate,
  onToggleAutoLocate,
  submitting,
  onSubmit,
}: Props) {
  const { t } = useT()

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b bg-background/90 px-2 py-1.5 text-xs text-muted-foreground backdrop-blur">
      <button
        type="button"
        onClick={onToggleSheet}
        className={cn(
          'hidden lg:flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
          sheetOpen ? 'text-muted-foreground hover:bg-accent' : 'border-primary/50 bg-accent text-foreground',
        )}
        title={sheetOpen ? t('exam.collapseSheet') : t('exam.expandSheet')}
      >
        {sheetOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        <span className="hidden lg:inline">{t('exam.answerSheet')}</span>
      </button>

      <span className="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" />

      <span className="min-w-0 max-w-[26%] shrink truncate font-medium text-foreground" title={title}>
        {title}
      </span>
      <span className="hidden shrink-0 text-muted-foreground md:inline">共 {totalItems} 题</span>

      {/* paper 视图(单页缩放/双页缩放·平移·全屏)查看工具栏锚点: 桌面端渲染进顶部工具栏, 移动端双页回退浮层 */}
      {showToolbarAnchor && (
        <span ref={onToolbarAnchor} className="flex shrink-0 items-center gap-1" />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {(
          [
            { m: 'sheet' as const, label: t('examTemplate.singlePage'), Icon: FileText },
            { m: 'spread' as const, label: t('examTemplate.spreadPage'), Icon: Columns2 },
            { m: 'card' as const, label: t('examTemplate.cardMode'), Icon: LayoutGrid },
          ]
        ).map(({ m, label, Icon }) => (
          <button
            key={m}
            type="button"
            onClick={() => onViewMode(m)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
              viewMode === m ? 'border-primary/60 bg-accent text-foreground' : 'hover:bg-accent',
            )}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
        {canBindCard && (
          <button
            type="button"
            onClick={onToggleCardView}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
              cardViewOpen ? 'border-primary/60 bg-accent text-foreground' : 'hover:bg-accent',
            )}
            title="真实答题卡：左侧面板换成英语（一）的机读卡，中间的竖条可拖动调比例"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">真实答题卡</span>
          </button>
        )}
        {/* 真题卷面的「自动定位」：切题时卷面跟着滚到当前小题 */}
        {canAutoLocate && (
          <button
            type="button"
            aria-pressed={autoLocate}
            onClick={onToggleAutoLocate}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
              autoLocate ? 'border-primary/60 bg-accent text-foreground' : 'hover:bg-accent',
            )}
            title="卷面自动定位：切到哪一小题就滚到卷面上的那一题"
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">自动定位</span>
          </button>
        )}
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="hidden shrink-0 items-center gap-0.5 tabular-nums sm:flex">
          <span className="font-semibold text-emerald-600 dark:text-emerald-500">{answeredItems}</span>
          <span>/</span>
          <span>{totalItems}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />}
          {t('exam.submitPaper')}
        </Button>
      </div>
    </div>
  )
}
