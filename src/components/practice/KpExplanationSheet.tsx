import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KpExplanationContent } from './KpExplanationContent'
import type { KpResourceRef } from '@/lib/kp-resource-refs'

interface Props {
  subject: string
  kp: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 点依据里的"看原文": 阅读页就地定位并关抽屉, 所以由调用方决定怎么跳 */
  onOpenRef?: (hit: KpResourceRef) => void
}

/**
 * 阅读页的知识点解读抽屉。
 *
 * 这里刻意不用 Dialog: 解读是从正文里点开的, 关掉之后用户要接着读刚才那一段 —— 右侧抽屉
 * 不遮挡整页、也不打断阅读位置, 而居中弹窗会把 PDF 和正文一起盖住。
 */
export function KpExplanationSheet({ subject, kp, open, onOpenChange, onOpenRef }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-2 p-3 sm:max-w-xl">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-6 text-sm">
            <span className="shrink-0">{kp}</span>
            {subject && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-normal text-primary">
                {subject}
              </span>
            )}
            <span className="text-xs font-normal text-muted-foreground">知识点解读</span>
          </SheetTitle>
        </SheetHeader>
        <KpExplanationContent subject={subject} kp={kp} onOpenRef={onOpenRef} />
      </SheetContent>
    </Sheet>
  )
}
