import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AiImportQuestionCard } from './AiImportQuestionCard'
import type { ParsedQuestion } from '@/lib/ai/types'
import { useT } from '@/i18n/use-t'

interface Props {
  questions: ParsedQuestion[]
  selectedIds: Set<number>
  subject: string
  category: string
  existingSubjects: string[]
  existingCategories: string[]
  onSubjectChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onToggleSelect: (index: number) => void
  onToggleAll: () => void
  onChangeQuestion: (index: number, q: ParsedQuestion) => void
  onRemoveQuestion: (index: number) => void
}

export function AiImportPreview({
  questions, selectedIds, subject, category,
  existingSubjects, existingCategories,
  onSubjectChange, onCategoryChange,
  onToggleSelect, onToggleAll, onChangeQuestion, onRemoveQuestion,
}: Props) {
  const { t } = useT()
  const allSelected = questions.length > 0 && selectedIds.size === questions.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t('ai_import.preview')} ({questions.length})
        </h3>
        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onToggleAll}>
          {allSelected ? t('ai_import.deselectAll') : t('ai_import.selectAll')}
          <span className="ml-1 text-muted-foreground/60">
            ({selectedIds.size}/{questions.length})
          </span>
        </Button>
      </div>

      {/* Subject & Category */}
      <div className="flex gap-2">
        <Input
          className="h-7 text-xs flex-1"
          placeholder={t('questions.subjectPlaceholder')}
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          list="preview-subjects"
        />
        <datalist id="preview-subjects">
          {existingSubjects.map(s => <option key={s} value={s} />)}
        </datalist>
        <Input
          className="h-7 text-xs flex-1"
          placeholder={t('questions.categoryPlaceholder')}
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          list="preview-categories"
        />
        <datalist id="preview-categories">
          {existingCategories.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>

      <ScrollArea className="max-h-[55vh] pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
      </ScrollArea>
    </div>
  )
}
