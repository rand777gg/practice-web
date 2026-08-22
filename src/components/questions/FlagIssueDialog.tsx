import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import type { Question } from '@/types'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type IssueFlag = 'none' | 'suspected' | 'confirmed'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: Question | null
  onSave: (flag: IssueFlag, note: string) => Promise<void> | void
}

const OPTIONS: { value: IssueFlag; label: string; activeClass: string }[] = [
  { value: 'none', label: '无', activeClass: '' },
  { value: 'suspected', label: '疑似有错', activeClass: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' },
  { value: 'confirmed', label: '已确认有错', activeClass: 'bg-red-500 hover:bg-red-600 text-white border-red-500' },
]

export function FlagIssueDialog({ open, onOpenChange, question, onSave }: Props) {
  const [flag, setFlag] = useState<IssueFlag>('none')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setFlag(question?.issue_flag ?? 'none')
      setNote(question?.issue_note ?? '')
      setError('')
    }
  }, [open, question])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(flag, note)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            标记问题
          </DialogTitle>
          <DialogDescription>
            发现题目有错但来不及修改时，先打标待处理，之后可在管理页「问题标记」筛选里集中修改
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {OPTIONS.map((opt) => (
            <Button key={opt.value} type="button" size="sm" variant={flag === opt.value ? 'default' : 'outline'}
              className={cn(flag === opt.value && opt.activeClass)}
              onClick={() => setFlag(opt.value)}>
              {opt.label}
            </Button>
          ))}
        </div>
        {flag !== 'none' && (
          <Textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="简要记录问题所在，方便以后修改（如：选项C答案有误 / 解析与答案不符）"
            className="text-sm min-h-[70px]" />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
