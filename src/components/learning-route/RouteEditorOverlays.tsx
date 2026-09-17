import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { QuestionPicker } from '@/components/question-bank/QuestionPicker'
import type { RouteEditor } from '@/hooks/use-route-editor'

/** 编辑器的两个浮层(题库选择器 + 阶段内容对话框), 表单页与大画布页共用 */
export function RouteEditorOverlays({ editor }: { editor: RouteEditor }) {
  const {
    pickerStage, setPickerStage, setReplaceTarget, savingQids,
    pickerExistingIds, handlePickerAdd, contentStage, setContentStage, stages, updateStage,
  } = editor
  const editing = contentStage !== null ? stages[contentStage] : undefined

  return (
    <>
      <QuestionPicker
        open={pickerStage !== null}
        onOpenChange={(open) => { if (!open) { setPickerStage(null); setReplaceTarget(null) } }}
        onAdd={handlePickerAdd}
        existingIds={pickerExistingIds}
        savingIds={savingQids}
      />

      <Dialog open={contentStage !== null} onOpenChange={(open) => { if (!open) setContentStage(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>阶段内容</DialogTitle>
            <DialogDescription>改动先留在本地，保存后才会写库。</DialogDescription>
          </DialogHeader>
          {editing && contentStage !== null && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">阶段标题</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => updateStage(contentStage, { title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">阶段简介</Label>
                <Textarea
                  rows={3}
                  value={editing.description}
                  placeholder="这个阶段讲什么、适合谁…"
                  onChange={(e) => updateStage(contentStage, { description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setContentStage(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
