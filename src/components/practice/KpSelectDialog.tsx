import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  kpBySubject: { subject: string; keyPoints: string[] }[]
  planSubjects: string[]
  selectedKps: string[]
  onConfirm: (kps: string[]) => void
}

export function KpSelectDialog({ open, onOpenChange, kpBySubject, planSubjects, selectedKps, onConfirm }: Props) {
  const { t } = useT()
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedKps))
  const [kpCounts, setKpCounts] = useState<Map<string, number>>(new Map())

  // kpBySubject is always fresh from question_meta_cache — filter client-side
  const filteredSubjects = useMemo(() => {
    const withKps = kpBySubject.filter(s => s.keyPoints.length > 0)
    if (planSubjects.length === 0) return withKps
    return withKps.filter(s => planSubjects.includes(s.subject))
  }, [kpBySubject, planSubjects])

  const allKps = useMemo(() => filteredSubjects.flatMap(s => s.keyPoints), [filteredSubjects])
  const allChecked = allKps.length > 0 && allKps.every(k => checked.has(k))

  useEffect(() => {
    if (!open || filteredSubjects.length === 0) return
    let c = false
    const subjects = filteredSubjects.map(s => s.subject)
    supabase.from('questions').select('key_points').in('subject', subjects).not('key_points', 'is', null).then(({ data }) => {
      if (c) return
      const counts = new Map<string, number>()
      for (const r of (data ?? []) as { key_points: string }[]) {
        for (const k of r.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)) {
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
      }
      setKpCounts(counts)
    })
    return () => { c = true }
  }, [open, filteredSubjects])

  const initRef = useRef(false)
  useEffect(() => {
    if (!open) { initRef.current = false; return }
    if (initRef.current) return
    if (allKps.length === 0) return
    if (selectedKps.length > 0) {
      setChecked(new Set(selectedKps))
    } else {
      setChecked(new Set(allKps))
    }
    initRef.current = true
  }, [selectedKps, open, allKps])

  const toggle = (kp: string) => setChecked(prev => { const n = new Set(prev); if (n.has(kp)) n.delete(kp); else n.add(kp); return n })
  const toggleAll = () => { if (allChecked) setChecked(new Set()); else setChecked(new Set(allKps)) }
  const toggleSubject = (sub: string) => {
    const kps = filteredSubjects.find(s => s.subject === sub)?.keyPoints ?? []
    const allSel = kps.every(k => checked.has(k))
    setChecked(prev => { const n = new Set(prev); for (const k of kps) { if (allSel) n.delete(k); else n.add(k) } return n })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>{t('practice.selectKps')}</DialogTitle></DialogHeader>
        {filteredSubjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">当前无知识点</p>
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2 border-b">
              <Button variant="outline" size="sm" onClick={toggleAll} className="text-xs">{allChecked ? '取消全选' : '全选'}</Button>
              <span className="text-xs text-muted-foreground">{allKps.length}个知识点</span>
            </div>
            <ScrollArea className="flex-1 -mx-4 px-4">
              <div className="space-y-3 py-2">
                {filteredSubjects.map(({ subject, keyPoints }) => {
                  const subAllChecked = keyPoints.every(k => checked.has(k))
                  return (
                    <div key={subject}>
                      <label className="flex items-center gap-2 py-1 cursor-pointer select-none" onClick={() => toggleSubject(subject)}>
                        <Checkbox checked={subAllChecked} aria-label={subject} />
                        <span className="text-sm font-medium">{subject}</span>
                        <span className="text-xs text-muted-foreground">({keyPoints.length})</span>
                      </label>
                      <div className="ml-6 space-y-0.5">
                        {keyPoints.map(kp => (
                          <label key={kp} className="flex items-center gap-2 py-0.5 cursor-pointer select-none" onClick={() => toggle(kp)}>
                            <Checkbox checked={checked.has(kp)} />
                            <span className="text-xs">{kp}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{kpCounts.get(kp) != null ? `${kpCounts.get(kp)}题` : '...'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </>
        )}
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={() => { onConfirm([...checked]); onOpenChange(false) }} disabled={checked.size === 0}>{t('common.save')} ({checked.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
