import { cn } from '@/lib/utils'

interface Props {
  current: number
  total: number
  answers: Map<string, number>
  questionIds: string[]
}

export function ExamProgress({ current, total, answers, questionIds }: Props) {
  const answeredCount = questionIds.filter((id) => answers.has(id)).length

  return (
    <div className="space-y-1.5">
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
      <div className="flex flex-wrap gap-1">
        {questionIds.map((id, i) => (
          <div
            key={id}
            className={cn(
              'h-2 w-2 rounded-full',
              i === current ? 'ring-2 ring-primary' : '',
              answers.has(id) ? 'bg-primary' : 'bg-secondary',
            )}
          />
        ))}
      </div>
    </div>
  )
}
