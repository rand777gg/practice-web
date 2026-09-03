import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'

interface Props {
  subject: string
  kp: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KpExplanationDialog({ subject, kp, open, onOpenChange }: Props) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading')

  useEffect(() => {
    if (!open || !subject || !kp) return
    let cancelled = false
    setStatus('loading')
    setContent('')
    ;(async () => {
      try {
        const { data } = await supabase
          .from('kp_explanations')
          .select('content')
          .eq('subject', subject)
          .eq('kp', kp)
          .maybeSingle()
        if (cancelled) return
        if (data?.content) { setContent(data.content as string); setStatus('ready') } else setStatus('empty')
      } catch { if (!cancelled) setStatus('empty') }
    })()
    return () => { cancelled = true }
  }, [open, subject, kp])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="shrink-0">{kp}</span>
            {subject && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-normal text-primary">{subject}</span>}
            <span className="text-xs font-normal text-muted-foreground">知识点解读</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {status === 'loading' ? (
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ) : status === 'empty' ? (
            <p className="py-6 text-center text-sm text-muted-foreground">该知识点暂未配置解读内容</p>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
