import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { AiImportQuestionCard } from './AiImportQuestionCard'
import { Check, ChevronDown } from 'lucide-react'
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
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">{t('questions.subject')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
              {subject || t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => onSubjectChange('')}>
              <span className="text-muted-foreground">{t('questions.subject')}</span>
              {!subject && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {existingSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onSubjectChange(s)}>
                {s}
                {subject === s && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground shrink-0">{t('questions.category')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
              {category || t('questions.category')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => onCategoryChange('')}>
              <span className="text-muted-foreground">{t('questions.category')}</span>
              {!category && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {existingCategories.map((c) => (
              <DropdownMenuItem key={c} onClick={() => onCategoryChange(c)}>
                {c}
                {category === c && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
