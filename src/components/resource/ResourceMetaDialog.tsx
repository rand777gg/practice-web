import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { updateResourceDocument, type ResourceDocument } from '@/lib/resource-library'
import { metaToInput, type MetaFormValue } from '@/lib/resource-meta-form'
import { ResourceMetaFields } from './ResourceMetaFields'

interface Props {
  document: ResourceDocument
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function toFormValue(doc: ResourceDocument): MetaFormValue {
  return {
    title: doc.title,
    authors: doc.authors,
    source: doc.source,
    pubYear: doc.pub_year === null ? '' : String(doc.pub_year),
    docType: doc.doc_type,
    subject: doc.subject,
    tags: doc.tags.join(', '),
    doi: doc.doi,
    abstract: doc.abstract,
  }
}

/**
 * 调用方用 key={document.id} 挂载它, 换个文献就是新组件 —— 这样初值直接从 props 派生,
 * 不需要"props 变了再 setState"那种会多渲染一轮的同步 effect。
 */
export function ResourceMetaDialog({ document, onOpenChange, onSaved }: Props) {
  const [meta, setMeta] = useState<MetaFormValue>(() => toFormValue(document))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!meta.title.trim()) { setError('标题不能为空'); return }
    setSaving(true)
    setError(null)
    try {
      await updateResourceDocument(document.id, metaToInput(meta))
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑文献信息</DialogTitle>
          <DialogDescription>
            只改元数据, 已解析的正文与区块不受影响。标签和摘要改动会立刻反映到检索结果上。
          </DialogDescription>
        </DialogHeader>

        <ResourceMetaFields value={meta} onChange={setMeta} disabled={saving} />

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={saving} onClick={save}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
