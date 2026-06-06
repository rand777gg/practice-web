import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  subject: string
  category: string
  onChange: (field: 'subject' | 'category', value: string) => void
}

export function AiImportMetadata({ subject, category, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">设置题目元数据</h3>
        <p className="text-xs text-muted-foreground mb-4">为所有解析出的题目设置统一的学科和分类</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ai-subject">学科</Label>
          <Input
            id="ai-subject"
            placeholder="如：逻辑学、数学"
            value={subject}
            onChange={(e) => onChange('subject', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-category">分类</Label>
          <Input
            id="ai-category"
            placeholder="如：JavaScript、React"
            value={category}
            onChange={(e) => onChange('category', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
