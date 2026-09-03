import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ChevronDown, Check, Trash2 } from 'lucide-react'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import { kpExplanationKey, useKpExplanations } from '@/hooks/use-kp-explanations'
import { naturalSort } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface KpBySubject {
  subject: string
  keyPoints: string[]
}

export function KpExplanationManagerDialog({ open, onOpenChange }: Props) {
  const { explanations, refresh } = useKpExplanations()
  const [kpBySubject, setKpBySubject] = useState<KpBySubject[]>([])
  const [metaLoading, setMetaLoading] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedKp, setSelectedKp] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedSubjects = useMemo(
    () => kpBySubject.map((s) => s.subject).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [kpBySubject],
  )
  const subjectKps = useMemo(
    () => kpBySubject.find((s) => s.subject === selectedSubject)?.keyPoints ?? [],
    [kpBySubject, selectedSubject],
  )
  const hasContent = selectedSubject && selectedKp ? explanations.has(kpExplanationKey(selectedSubject, selectedKp)) : false

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMetaLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.from('question_meta_cache').select('key_points_by_subject').single()
        if (cancelled) return
        const raw = (data?.key_points_by_subject ?? []) as { subject: string; key_points: string[] }[]
        const items = raw
          .map((item) => ({ subject: item.subject || '其他', keyPoints: [...item.key_points].sort(naturalSort) }))
          .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN'))
        setKpBySubject(items)
      } catch { /* ignore */ } finally { if (!cancelled) setMetaLoading(false) }
    })()
    return () => { cancelled = true }
  }, [open])

  // Auto-select first configured subject → first configured KP, else first entries
  useEffect(() => {
    if (!open || kpBySubject.length === 0) return
    const firstWithContent = sortedSubjects.find((s) => s && [...(kpBySubject.find((x) => x.subject === s)?.keyPoints ?? [])].some((k) => explanations.has(kpExplanationKey(s, k))))
    const target = firstWithContent ?? sortedSubjects[0]
    if (!target) return
    setSelectedSubject(target)
    const kps = kpBySubject.find((x) => x.subject === target)?.keyPoints ?? []
    const firstKpWithContent = kps.find((k) => explanations.has(kpExplanationKey(target, k)))
    setSelectedKp(firstKpWithContent ?? kps[0] ?? '')
  }, [open, kpBySubject, sortedSubjects, explanations])

  useEffect(() => {
    if (!open || !selectedSubject || !selectedKp) return
    setDraft(explanations.get(kpExplanationKey(selectedSubject, selectedKp))?.content ?? '')
  }, [open, selectedSubject, selectedKp, explanations])

  const handleSubjectChange = (s: string) => {
    setSelectedSubject(s)
    setSelectedKp('')
    const kps = kpBySubject.find((x) => x.subject === s)?.keyPoints ?? []
    const firstKpWithContent = kps.find((k) => explanations.has(kpExplanationKey(s, k)))
    setSelectedKp(firstKpWithContent ?? kps[0] ?? '')
  }

  const handleSave = async () => {
    if (!selectedSubject || !selectedKp) return
    setSaving(true)
    const content = draft.trim()
    if (content) {
      await supabase.from('kp_explanations').upsert({
        subject: selectedSubject, kp: selectedKp, content, updated_at: new Date().toISOString(),
      })
    } else if (hasContent) {
      await supabase.from('kp_explanations').delete().eq('subject', selectedSubject).eq('kp', selectedKp)
    }
    setSaving(false)
    await refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>知识点解读管理</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">{selectedSubject || '选择学科'}<ChevronDown className="h-3 w-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {sortedSubjects.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleSubjectChange(s)}>
                    {s}
                    {[...(kpBySubject.find((x) => x.subject === s)?.keyPoints ?? [])].some((k) => explanations.has(kpExplanationKey(s, k)))
                      && <Check className="h-4 w-4 ml-auto text-green-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs max-w-56 truncate" disabled={!selectedSubject}>
                  {selectedKp || '选择知识点'}<ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {subjectKps.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">该学科暂无知识点</div>
                ) : subjectKps.map((k) => (
                  <DropdownMenuItem key={k} onClick={() => setSelectedKp(k)}>
                    {k}
                    {selectedSubject && explanations.has(kpExplanationKey(selectedSubject, k))
                      && <Check className="h-4 w-4 ml-auto text-green-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {metaLoading && <span className="text-xs text-muted-foreground">加载中...</span>}
            {hasContent && <span className="text-xs text-green-600">已设置</span>}
          </div>
          {selectedSubject && selectedKp && (
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              minHeight="300px"
              placeholder={`编写「${selectedKp}」的知识点解读（支持 Markdown、图片与视频；粘贴/拖入图片后可选择直接插入或 OCR 识别为文字）。留空保存将删除该解读。`}
            />
          )}
        </div>
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false) }}>关闭</Button>
          {hasContent && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={saving || !selectedKp}
              onClick={async () => {
                if (!selectedSubject || !selectedKp) return
                setSaving(true)
                await supabase.from('kp_explanations').delete().eq('subject', selectedSubject).eq('kp', selectedKp)
                setSaving(false)
                setDraft('')
                await refresh()
              }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !selectedSubject || !selectedKp}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
