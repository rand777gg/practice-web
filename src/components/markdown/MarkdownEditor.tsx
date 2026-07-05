import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FormattingToolbar } from '@/components/notes/FormattingToolbar'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image-compress'
import { cn } from '@/lib/utils'
import { ImagePlus, Loader2, WrapText } from 'lucide-react'
import { hasAiConfig, getAiConfig } from '@/lib/ai/config'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  minHeight?: string
  hidePreview?: boolean
  hideImageTools?: boolean
  extraToolbarButtons?: React.ReactNode
  bottomButtons?: React.ReactNode
  overlay?: React.ReactNode
  onImageAction?: (action: 'left' | 'center' | 'right', src: string) => void
}

export function MarkdownEditor({
  value, onChange, placeholder, textareaRef: externalRef, minHeight = '160px',
  hidePreview, hideImageTools, extraToolbarButtons, bottomButtons, overlay,
  onImageAction,
}: Props) {
  const [previewValue, setPreviewValue] = useState(value)
  const [dragOver, setDragOver] = useState(false)
  const [isUploadingImg, setIsUploadingImg] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ta = externalRef ?? internalRef
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external ref
  useEffect(() => {
    if (externalRef) (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = internalRef.current
  })

  // Debounced preview
  useEffect(() => {
    const t = setTimeout(() => setPreviewValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  const uploadImageFile = useCallback(async (file: File) => {
    setIsUploadingImg(true)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('folder', 'images')
      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error) throw new Error(error.message || '上传失败')
      const url = (data as { url: string }).url
      if (url) {
        const el = internalRef.current
        if (el) {
          const start = el.selectionStart
          const end = el.selectionEnd
          const before = value.slice(0, start)
          const after = value.slice(end)
          const md = `${before ? '\n\n' : ''}![图片](${url})\n\n`
          onChange(before + md + after)
          requestAnimationFrame(() => {
            el.focus()
            const pos = start + md.length
            el.setSelectionRange(pos, pos)
          })
        } else {
          onChange(value ? `${value}\n\n![图片](${url})` : `![图片](${url})`)
        }
      }
    } catch (err) { alert(err instanceof Error ? err.message : '上传失败') }
    setIsUploadingImg(false)
  }, [value, onChange])

  const handleUploadImage = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/' + '*'
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) uploadImageFile(f)
    }
    input.click()
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith('image/')) uploadImageFile(f)
    }
  }

  // Paste image
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) uploadImageFile(file)
          return
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [uploadImageFile])

  const handleAiLineBreak = async () => {
    const config = getAiConfig()
    if (!config?.apiKey) return
    setIsFormatting(true)
    try {
      const current = internalRef.current?.value || value
      if (!current.trim()) return
      const { generateText } = await import('ai')
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
      const { text } = await generateText({
        model: client(config.model || 'deepseek-chat'),
        system: 'You are a text formatter. Add <br> at natural break points between paragraphs and list items. Do NOT change any content.',
        prompt: current,
        temperature: 0.1,
      })
      if (text) onChange(text)
    } catch { /* ignore */ }
    setIsFormatting(false)
  }

  const toolbarButtons = !hideImageTools ? (
    <>
      <span className="text-muted-foreground/40 text-xs mx-0.5">|</span>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入图片"
        disabled={isUploadingImg} onClick={handleUploadImage}>
        {isUploadingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
        title="AI 自动换行" disabled={isFormatting || !hasAiConfig()} onClick={handleAiLineBreak}>
        {isFormatting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WrapText className="h-3.5 w-3.5" />}
      </Button>
    </>
  ) : null

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex gap-1 flex-wrap items-center">
        <FormattingToolbar textareaRef={ta} value={value} onChange={onChange} extraButtons={
          <>
            {toolbarButtons}
            {extraToolbarButtons}
          </>
        } />
      </div>
      <div className={cn('grid gap-2 items-stretch', !hidePreview && 'grid-cols-1 lg:grid-cols-2')}>
        <div
          className={cn('relative', dragOver && 'ring-2 ring-primary ring-offset-1 rounded-lg')}
          onDragOver={!hideImageTools ? handleDragOver : undefined}
          onDragLeave={!hideImageTools ? handleDragLeave : undefined}
          onDrop={!hideImageTools ? handleDrop : undefined}
        >
          <Textarea
            ref={internalRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '支持 Markdown 语法...'}
            className="font-mono text-sm h-full min-h-0"
            style={{ minHeight, resize: 'none' }}
            spellCheck={false}
            autoComplete="off"
          />
          {dragOver && (
            <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center pointer-events-none">
              <span className="text-sm font-medium text-primary">释放以插入图片</span>
            </div>
          )}
          {bottomButtons && (
            <div className="absolute right-1 bottom-1 flex gap-0.5">
              {bottomButtons}
            </div>
          )}
          {overlay}
        </div>
        {!hidePreview && (
          <div className="rounded-lg border bg-muted/30 p-3 overflow-auto" style={{ minHeight, maxHeight: '500px' }}>
            {previewValue ? (
              <MarkdownRenderer content={previewValue} onImageAction={onImageAction} />
            ) : (
              <p className="text-xs text-muted-foreground">预览区域，编辑内容后实时显示...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
