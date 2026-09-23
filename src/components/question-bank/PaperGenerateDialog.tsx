import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { ExamTemplatePanel } from '@/components/exam/ExamTemplatePanel'
import { SCOPE_TYPE_LABELS, defaultPaperName, type BankPaperScope } from '@/lib/bank-papers'
import { EXAM_DEFAULT_DURATION_MIN, EXAM_MAX_DURATION_MIN, EXAM_MIN_DURATION_MIN } from '@/lib/constants'
import { Loader2 } from 'lucide-react'
import type { ExamTemplate } from '@/types'

export interface PaperGenerateInput extends BankPaperScope {
  template: ExamTemplate
  name: string
  durationMin: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** 要生成的范围; null = 还没选 */
  scope: BankPaperScope | null
  /** 该范围在库里现有的题数, 用来提前提示题库够不够 */
  available: number
  subjectOptions: string[]
  categoryOptions: string[]
  onSubmit: (input: PaperGenerateInput) => Promise<{ ok: boolean; error?: string }>
}

export function PaperGenerateDialog({
  open,
  onOpenChange,
  userId,
  scope,
  available,
  subjectOptions,
  categoryOptions,
  onSubmit,
}: Props) {
  // 调用方每次打开都换一个 key, 组件重挂载即等于表单重置 —— 不用 effect 里 setState
  const [template, setTemplate] = useState<ExamTemplate | null>(null)
  const [name, setName] = useState(() => (scope ? defaultPaperName(scope) : ''))
  const [durationMin, setDurationMin] = useState(EXAM_DEFAULT_DURATION_MIN)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const scopeText = scope
    ? scope.scopeType === 'comprehensive'
      ? '整个试题库'
      : scope.scopeType === 'year'
        ? `${scope.year}年真题`
        : `${SCOPE_TYPE_LABELS[scope.scopeType]}：${scope.values.join('、')}`
    : ''

  const handleSubmit = async () => {
    if (!scope || !template) return
    setSaving(true)
    setError('')
    const mins = Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, durationMin || EXAM_DEFAULT_DURATION_MIN))
    const res = await onSubmit({ ...scope, template, name: name.trim(), durationMin: mins })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? '这个范围里没有可用题目，先往试题库里加题，或换一个模板')
      return
    }
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogTitle>生成套卷</AlertDialogTitle>
        <AlertDialogDescription>
          按「{scopeText}」从本试题库抽题，题型与分值由所选模板决定。生成后题单固定，可反复练同一套。
        </AlertDialogDescription>

        <div className="mt-2 space-y-4">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            范围内现有 <span className="font-medium text-foreground">{available}</span> 道题
            {available === 0 && <span className="text-destructive"> —— 该范围还没有题目，生成会抽不到题</span>}
          </div>

          <div className="space-y-2">
            <Label>组卷模板</Label>
            <ExamTemplatePanel
              userId={userId}
              subjects={subjectOptions}
              categories={categoryOptions}
              value={template}
              onChange={(next) => {
                setTemplate(next)
                if (next) setDurationMin(next.duration_min)
              }}
            />
            {!template && <p className="text-[10px] text-muted-foreground">必须选一个模板：它决定这张卷子考哪些题型、每部分多少题、每题多少分。</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="paper-name">试卷名称</Label>
            <Input id="paper-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="试卷名称" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paper-duration">考试时长（分钟）</Label>
            <Input
              id="paper-duration"
              type="number"
              min={EXAM_MIN_DURATION_MIN}
              max={EXAM_MAX_DURATION_MIN}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm" type="button" disabled={saving}>取消</Button>
            </AlertDialogCancel>
            <Button size="sm" type="button" disabled={saving || !template} onClick={handleSubmit}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {saving ? '组卷中...' : '生成套卷'}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
