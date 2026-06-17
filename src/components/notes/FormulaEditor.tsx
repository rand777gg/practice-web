import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'
import 'mathlive'

interface Props {
  open: boolean
  onClose: () => void
  onInsert: (latex: string) => void
  initialValue?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        value?: string
        ref?: React.Ref<any>
      }, HTMLElement>
    }
  }
}

export function FormulaEditor({ open, onClose, onInsert, initialValue }: Props) {
  const [latex, setLatex] = useState('')
  const mfRef = useRef<any>(null)

  useEffect(() => {
    if (open) {
      setLatex('')
      // Reset math-field after dialog opens
      setTimeout(() => {
        if (mfRef.current) {
          mfRef.current.setValue(initialValue || '', { silenceNotifications: true })
        }
      }, 0)
    }
  }, [open, initialValue])

  const handleInput = (evt: Event) => {
    const mf = evt.target as any
    setLatex(mf.getValue('latex') || '')
  }

  const handleInsert = () => {
    const text = latex.trim() || (mfRef.current?.getValue('latex') || '').trim()
    if (text) {
      onInsert(text)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center justify-between">
            公式编辑器
            <button onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <math-field
            ref={mfRef}
            onInput={handleInput}
            style={{
              fontSize: '1.25rem',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--muted)',
              minHeight: '48px',
              outline: 'none',
              width: '100%',
            }}
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {latex ? (
                <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{latex}</code>
              ) : (
                '直接输入公式，支持 LaTeX'
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={onClose}>取消</Button>
              <Button size="sm" className="text-xs h-8" onClick={handleInsert} disabled={!latex.trim()}>
                插入公式
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
