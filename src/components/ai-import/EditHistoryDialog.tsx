import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { HistoryEntry } from './ParseHistoryDialog'

export interface HistoryEdits {
  display_name?: string | null
  subject?: string | null
  category?: string | null
  key_points?: string | null
  page_ranges?: string | null
}

interface Props {
  entry: HistoryEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  subjects?: string[]
  categories?: string[]
  keyPoints?: string[]
  onSave: (id: number, edits: HistoryEdits) => void
}

function FieldSelect({ label, value, options, onChange, placeholder }: {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
  placeholder: string
}) {
  const [newValue, setNewValue] = useState('')
  const add = () => {
    const v = newValue.trim()
    if (v) { onChange(v); setNewValue('') }
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between text-sm font-normal h-8">
            <span className="truncate">{value || <span className="text-muted-foreground">{placeholder}</span>}</span>
            <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
          <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
            <Input
              placeholder={`新增${label}...`}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              className="h-7 text-xs flex-1"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={add} disabled={!newValue.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChange(null)}>
            <span className="text-muted-foreground">不限</span>
            {!value && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuItem>
          {options.map((s) => (
            <DropdownMenuItem key={s} onClick={() => onChange(s)}>
              {s}
              {value === s && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function EditForm({ entry, subjects, categories, keyPoints, onSave, onClose }: {
  entry: HistoryEntry
  subjects: string[]
  categories: string[]
  keyPoints: string[]
  onSave: (id: number, edits: HistoryEdits) => void
  onClose: () => void
}) {
  const [displayName, setDisplayName] = useState(entry.display_name || '')
  const [subject, setSubject] = useState<string | null>(entry.subject || null)
  const [category, setCategory] = useState<string | null>(entry.category || null)
  const [keyPoint, setKeyPoint] = useState<string | null>(entry.key_points || null)
  const [pageRanges, setPageRanges] = useState(entry.page_ranges || '')

  const handleSave = () => {
    onSave(entry.id, {
      display_name: displayName.trim() || null,
      subject,
      category,
      key_points: keyPoint,
      page_ranges: pageRanges.trim() || null,
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">显示名称</Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="留空则使用文件名"
          className="h-8 text-xs"
        />
      </div>
      <FieldSelect label="学科" value={subject} options={subjects} onChange={setSubject} placeholder="不限学科" />
      <FieldSelect label="分类" value={category} options={categories} onChange={setCategory} placeholder="不限分类" />
      <FieldSelect label="知识点" value={keyPoint} options={keyPoints} onChange={setKeyPoint} placeholder="不限知识点" />
      <div className="space-y-1.5">
        <Label className="text-xs">页码范围</Label>
        <Input
          value={pageRanges}
          onChange={(e) => setPageRanges(e.target.value)}
          placeholder="如 1-5,8（留空为全部）"
          className="h-8 text-xs"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" onClick={handleSave}>保存</Button>
      </DialogFooter>
    </div>
  )
}

export function EditHistoryDialog({ entry, open, onOpenChange, subjects, categories, keyPoints, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">编辑解析记录 {entry ? `#${entry.id}` : ''}</DialogTitle>
        </DialogHeader>
        {entry && (
          <EditForm
            key={entry.id}
            entry={entry}
            subjects={subjects || []}
            categories={categories || []}
            keyPoints={keyPoints || []}
            onSave={(id, edits) => { onSave(id, edits); onOpenChange(false) }}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
