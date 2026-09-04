import { Label } from '@/components/ui/label'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'

interface Props {
  subject: string
  category: string
  existingSubjects: string[]
  existingCategories: string[]
  onChange: (field: 'subject' | 'category', value: string) => void
}

export function AiImportMetadata({ subject, category, existingSubjects, existingCategories, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">设置题目元数据</h3>
        <p className="text-xs text-muted-foreground mb-4">为所有解析出的题目设置统一的学科和分类</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ai-subject">学科</Label>
          <AutocompleteInput
            id="ai-subject"
            value={subject}
            onChange={(v) => onChange('subject', v)}
            suggestions={existingSubjects}
            placeholder="如：逻辑学、数学"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-category">分类</Label>
          <AutocompleteInput
            id="ai-category"
            value={category}
            onChange={(v) => onChange('category', v)}
            suggestions={existingCategories}
            placeholder="如：JavaScript、React"
          />
        </div>
      </div>
    </div>
  )
}
