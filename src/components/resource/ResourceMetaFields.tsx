import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DOC_TYPES } from '@/lib/resource-library'
import type { MetaFormValue } from '@/lib/resource-meta-form'

export function ResourceMetaFields({
  value, onChange, disabled,
}: {
  value: MetaFormValue
  onChange: (next: MetaFormValue) => void
  disabled?: boolean
}) {
  const set = <K extends keyof MetaFormValue>(key: K, v: MetaFormValue[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>标题 *</Label>
        <Input value={value.title} onChange={(e) => set('title', e.target.value)} disabled={disabled} placeholder="例如: 计算机操作系统" />
      </div>
      <div className="space-y-1.5">
        <Label>作者</Label>
        <Input value={value.authors} onChange={(e) => set('authors', e.target.value)} disabled={disabled} placeholder="多个作者用逗号分隔" />
      </div>
      <div className="space-y-1.5">
        <Label>来源</Label>
        <Input value={value.source} onChange={(e) => set('source', e.target.value)} disabled={disabled} placeholder="期刊 / 出版社 / 会议" />
      </div>
      <div className="space-y-1.5">
        <Label>年份</Label>
        <Input value={value.pubYear} onChange={(e) => set('pubYear', e.target.value)} disabled={disabled} placeholder="2021" inputMode="numeric" />
      </div>
      <div className="space-y-1.5">
        <Label>类型</Label>
        <Select value={value.docType} onValueChange={(v) => set('docType', v)} disabled={disabled}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>学科</Label>
        <Input value={value.subject} onChange={(e) => set('subject', e.target.value)} disabled={disabled} placeholder="计算机" />
      </div>
      <div className="space-y-1.5">
        <Label>DOI</Label>
        <Input value={value.doi} onChange={(e) => set('doi', e.target.value)} disabled={disabled} placeholder="10.xxxx/xxxxx" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>知识点 / 关键字标签</Label>
        <Input value={value.tags} onChange={(e) => set('tags', e.target.value)} disabled={disabled} placeholder="死锁, 进程调度, 内存管理" />
        <p className="text-[10px] text-muted-foreground">逗号或空格分隔, 检索时能直接命中这些标签</p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>摘要</Label>
        <Textarea value={value.abstract} onChange={(e) => set('abstract', e.target.value)} disabled={disabled} rows={3} placeholder="可选, 用于检索与列表展示" />
      </div>
    </div>
  )
}
