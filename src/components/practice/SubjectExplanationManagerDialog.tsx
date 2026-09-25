import { useEffect, useMemo, useState } from 'react'
import { deleteSubjectExplanation, saveSubjectExplanation } from '@/services/practice'
import { logError } from '@/services/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ChevronDown, Check, Trash2 } from 'lucide-react'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useSubjectExplanations } from '@/hooks/use-subject-explanations'
import { autoIndex } from '@/lib/rag'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SubjectExplanationManagerDialog({ open, onOpenChange }: Props) {
  const { subjects } = useQuestionFilters()
  const { explanations, refresh } = useSubjectExplanations()
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')), [subjects])

  useEffect(() => {
    if (!open || selected) return
    const first = sortedSubjects.find(s => explanations.has(s)) ?? sortedSubjects[0]
    if (first) setSelected(first)
  }, [open, selected, sortedSubjects, explanations])

  useEffect(() => {
    if (open && selected) setDraft(explanations.get(selected)?.content ?? '')
  }, [open, selected, explanations])

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const content = draft.trim()
    try {
      if (content) await saveSubjectExplanation(selected, content)
      else await deleteSubjectExplanation(selected)
    } catch (e) {
      logError('SubjectExplanationManagerDialog.handleSave', e)
    }
    setSaving(false)
    // 学科解读同上: 管理员独占的编辑入口, 整源增量同步
    autoIndex('subject')
    await refresh()
  }

  const hasContent = explanations.has(selected)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>学科编排说明管理</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">{selected || '选择学科'}<ChevronDown className="h-3 w-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {sortedSubjects.map(s => (
                  <DropdownMenuItem key={s} onClick={() => setSelected(s)}>
                    {s}
                    {explanations.has(s) && <Check className="h-4 w-4 ml-auto text-green-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasContent && <span className="text-xs text-green-600">已设置</span>}
          </div>
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            minHeight="240px"
            placeholder="填写该学科题目的编排说明（支持 Markdown），如各章节/知识点顺序、刷题建议等。留空保存将删除该学科的说明。"
          />
        </div>
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => { setSelected(''); onOpenChange(false) }}>关闭</Button>
          {hasContent && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await deleteSubjectExplanation(selected)
                } catch (e) {
                  logError('SubjectExplanationManagerDialog.delete', e)
                }
                autoIndex('subject')
                setSaving(false)
                setDraft('')
                await refresh()
              }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !selected}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
