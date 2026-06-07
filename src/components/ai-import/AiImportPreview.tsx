import { Button } from '@/components/ui/button'
import { AiImportQuestionCard } from './AiImportQuestionCard'
import type { ParsedQuestion } from '@/lib/ai/types'

interface Props {
  questions: ParsedQuestion[]
  selectedIds: Set<number>
  onToggleSelect: (index: number) => void
  onToggleAll: () => void
  onChangeQuestion: (index: number, q: ParsedQuestion) => void
  onRemoveQuestion: (index: number) => void
}

export function AiImportPreview({
  questions, selectedIds, onToggleSelect, onToggleAll, onChangeQuestion, onRemoveQuestion,
}: Props) {
  const allSelected = questions.length > 0 && selectedIds.size === questions.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">预览题目</h3>
        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onToggleAll}>
          {allSelected ? '取消全选' : '全选'}
          <span className="ml-1 text-muted-foreground/60">
            ({selectedIds.size}/{questions.length})
          </span>
        </Button>
      </div>

      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        {questions.map((q, i) => (
          <AiImportQuestionCard
            key={i}
            question={q}
            index={i}
            selected={selectedIds.has(i)}
            onToggleSelect={() => onToggleSelect(i)}
            onChange={(updated) => onChangeQuestion(i, updated)}
            onRemove={() => onRemoveQuestion(i)}
          />
        ))}
      </div>
    </div>
  )
}
