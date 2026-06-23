import { useState, useRef, useCallback, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Eye, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}

import { compressImage } from '@/lib/image-compress'

export function MarkdownEditor({ value, onChange, placeholder, className, minHeight = '120px', inputRef }: Props) {
  const [preview, setPreview] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync external ref
  useEffect(() => {
    if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = textareaRef.current
  }, [textareaRef.current])
  const fileInputRef = useRef<HTMLInputElement>(null)


  const uploadToR2 = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('folder', 'images')

      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error || !data?.url) {
        console.warn('R2 upload failed, falling back to base64:', error)
        return null
      }
      return data.url as string
    } catch {
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  const insertImageAtCursor = useCallback((url: string, alt?: string) => {
    const ta = textareaRef.current
    if (!ta) {
      onChange(value ? `${value}\n\n![${alt || 'image'}](${url})` : `![${alt || 'image'}](${url})`)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = value.slice(0, start)
    const after = value.slice(end)
    const hasNewline = before.endsWith('\n') || before === ''
    const md = `${hasNewline ? '' : '\n\n'}![${alt || 'image'}](${url})\n\n`
    onChange(before + md + after)
    setTimeout(() => {
      ta.focus()
      const pos = start + md.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }, [value, onChange])

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return

    // Try R2 upload, fall back to base64
    const r2Url = await uploadToR2(file)

    if (r2Url) {
      insertImageAtCursor(r2Url, file.name)
    } else {
      // Fallback: inline base64
      const reader = new FileReader()
      reader.onload = () => {
        insertImageAtCursor(reader.result as string, file.name)
      }
      reader.readAsDataURL(file)
    }
  }, [uploadToR2, insertImageAtCursor])

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const f of files) handleFile(f)
  }

  // Clipboard paste (works in both edit and preview mode)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) handleFile(file)
          return
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [handleFile])

  return (
    <div ref={containerRef} className={cn('space-y-2', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors', !preview && 'bg-muted font-medium')}
          onClick={() => setPreview(false)}
        >
          <PenLine className="h-3 w-3" />
          编辑
        </button>
        <button
          type="button"
          className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors', preview && 'bg-muted font-medium')}
          onClick={() => setPreview(true)}
        >
          <Eye className="h-3 w-3" />
          预览
        </button>
        {!preview && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={'image/*'}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </>
        )}
        {uploading && <span className="text-[10px] text-muted-foreground ml-2">上传中...</span>}
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div className={cn('rounded-lg border bg-muted/20 p-3', dragOver && 'ring-2 ring-primary')}>
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <p className="text-xs text-muted-foreground">暂无内容</p>
          )}
        </div>
      ) : (
        <div
          className={cn('relative', dragOver && 'ring-2 ring-primary ring-offset-1 rounded-lg')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Textarea
            id="markdown-editor"
            name="markdown-editor"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '支持 Markdown 语法。拖拽、粘贴图片到此处自动上传...'}
            className="font-mono text-sm resize-y"
            style={{ minHeight }}
            spellCheck={false}
            autoComplete="off"
          />
          {dragOver && (
            <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center pointer-events-none">
              <span className="text-sm font-medium text-primary">释放以插入图片</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
