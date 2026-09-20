import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { Separator } from '@/components/ui/separator'

interface Props {
  subject: string
  content: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SubjectExplanationDialog({ subject, content, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{subject}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />编排说明</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <MarkdownRenderer content={content} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
