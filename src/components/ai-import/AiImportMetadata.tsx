import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  subject: string
  category: string
  existingSubjects: string[]
  existingCategories: string[]
  onChange: (field: 'subject' | 'category', value: string) => void
}

function AutocompleteInput({ value, onChange, suggestions, id, placeholder }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; id: string; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) && s !== value,
  ).slice(0, 8)

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AiImportMetadata({ subject, category, existingSubjects, existingCategories, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">设置题目元数据</h3>
        <p className="text-xs text-muted-foreground mb-4">为所有解析出的题目设置统一的学科和分类</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
