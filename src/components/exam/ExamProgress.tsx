import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Grid3X3 } from 'lucide-react'

interface Props {
  current: number
  total: number
  answers: Map<string, number>
  questionIds: string[]
  onJumpTo: (index: number) => void
}

export function ExamProgress({ current, total, answers, questionIds, onJumpTo }: Props) {
  const [open, setOpen] = useState(false)
  const answeredCount = questionIds.filter((id) => answers.has(id)).length

  return (
    <>
      <div className="space-y-1.5 flex-1">
        <div className="flex items-center justify-between text-xs sm:text-sm gap-2">
          <span className="whitespace-nowrap">
            Q {current + 1}/{total}
          </span>
          <span className="text-muted-foreground whitespace-nowrap">
            {answeredCount}/{total} done
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setOpen(true)}
      >
        <Grid3X3 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {answeredCount}/{total} done
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 justify-center py-2">
            {questionIds.map((id, i) => {
              const isAnswered = answers.has(id)
              const isCurrent = i === current
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-all hover:scale-110',
                    isAnswered
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground',
                    isCurrent && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                  )}
                  onClick={() => {
                    onJumpTo(i)
                    setOpen(false)
                  }}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
