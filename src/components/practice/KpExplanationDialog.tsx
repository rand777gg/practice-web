import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KpExplanationContent } from './KpExplanationContent'

interface Props {
  subject: string
  kp: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 练习页的知识点解读弹窗 —— 壳很薄, 正文与"依据原文"都在 KpExplanationContent 里。
 * 阅读页用的是同一个正文组件, 只是换成右侧抽屉(见 KpExplanationSheet)。
 */
export function KpExplanationDialog({ subject, kp, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="shrink-0">{kp}</span>
            {subject && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-normal text-primary">{subject}</span>}
            <span className="text-xs font-normal text-muted-foreground">知识点解读</span>
          </DialogTitle>
        </DialogHeader>
        <KpExplanationContent subject={subject} kp={kp} />
      </DialogContent>
    </Dialog>
  )
}
