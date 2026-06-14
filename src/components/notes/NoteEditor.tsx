import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { ImagePlus, Sparkles, Loader2, Clipboard, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useAiStore } from '@/stores/ai-store'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUToken } from '@/lib/ai/config'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import { compressImage } from '@/lib/image-compress'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type Align = 'left' | 'center' | 'right'
type InsertMode = 'html' | 'markdown'

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<string | null>(null)
  const [previewValue, setPreviewValue] = useState(value)

  // Drag-to-align state
  const [selectedAlign, setSelectedAlign] = useState<Align>('center')
  const [insertMode, setInsertMode] = useState<InsertMode>('html')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const { noteRecognitionMode } = useSettingsStore()
  const providers = useAiStore((s) => s.providers)
  const activeProvider = providers.find((p) => p.enabled && p.models.some((m) => m.enabled))

  // Shared upload helper with compression
  const uploadToR2 = useCallback(async (file: File) => {
    setIsUploading(true)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('folder', 'images')
      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error) throw new Error(error.message || '上传失败')
      const url = (data as { url: string }).url
      if (!url) throw new Error('未返回图片地址')
      const current = textareaRef.current?.value || value
      onChange(current ? `${current}\n\n![图片](${url})` : `![图片](${url})`)
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    }
    setIsUploading(false)
  }, [value, onChange])

  // Clipboard paste handler
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
          if (file) uploadToR2(file)
          return
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [uploadToR2])

  // Uncontrolled textarea — only sync when value changes externally
  useEffect(() => {
    const ta = textareaRef.current
    if (ta && ta.value !== value) ta.value = value
  }, [value])

  // Debounced preview
  useEffect(() => {
    const t = setTimeout(() => setPreviewValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  const handleChange = () => {
    if (textareaRef.current) onChange(textareaRef.current.value)
  }

  // ── File select ────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
      setRecognitionResult(null)
      setSelectedAlign('center')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const clearImage = () => {
    setImagePreview(null)
    setImageBase64(null)
    setImageFile(null)
    setRecognitionResult(null)
  }

  // ── Recognize ──────────────────────────────────────────────────────────
  const handleRecognize = async () => {
    if (!imageBase64) return
    setIsRecognizing(true)
    try {
      const currentValue = textareaRef.current?.value || value
      if (noteRecognitionMode === 'ai') {
        if (!activeProvider) throw new Error('请先在 AI 管理页启用一个多模态模型')
        const modelId = activeProvider.models.find((m) => m.enabled)?.id || activeProvider.models[0].id
        const promptText = currentValue
          ? `已有笔记：\n${currentValue}\n\n请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。`
          : '请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。'
        const res = await fetch(`${activeProvider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeProvider.apiKey}` },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            ]}],
          }),
        })
        const data = await res.json() as any
        if (data.error) throw new Error(data.error?.message || 'API error')
        const text = data.choices?.[0]?.message?.content
        if (text) setRecognitionResult(text.trim())
        else throw new Error('No content in response')
      } else {
        const token = getMinerUToken()
        if (!token) throw new Error('请先在设置中配置 MinerU Token')
        const client = new MinerUClient()
        const markdown = await client.recognizeImage(imageBase64, token)
        setRecognitionResult(markdown.trim())
      }
    } catch (err) {
      setRecognitionResult(err instanceof Error ? `识别失败: ${err.message}` : '识别失败')
    }
    setIsRecognizing(false)
  }

  // ── Upload & insert ────────────────────────────────────────────────────
  const handleUploadToCloud = async () => {
    if (!imageFile || !user) return
    setIsUploading(true)
    try {
      const compressed = await compressImage(imageFile)
      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('folder', `notes/${user.id}`)
      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error) throw new Error(error.message || '上传失败')
      const url = (data as { url: string }).url
      if (!url) throw new Error('未返回图片地址')
      const current = textareaRef.current?.value || value
      const snippet = buildSnippet(url, selectedAlign, insertMode)
      onChange(current ? `${current}\n\n${snippet}` : snippet)
      clearImage()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    }
    setIsUploading(false)
  }

  const handleInsert = () => {
    if (!recognitionResult) return
    const current = textareaRef.current?.value || value
    const sep = current ? '\n\n---\n识别结果：\n' : ''
    onChange(current + sep + recognitionResult)
    clearImage()
  }

  const handleImageAction = (action: 'left' | 'center' | 'right', src: string) => {
    const current = textareaRef.current?.value || value
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const newMd = current.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}(?:\\s+"[^"]*")?\\)`, 'g'),
      `![$1](${src} "align:${action}")`
    )
    if (newMd !== current) onChange(newMd)
  }

  // Insert markdown template at cursor position
  const insertMarkdown = (type: 'mermaid' | 'plantuml' | 'math', body?: string) => {
    const ta = textareaRef.current
    const templates: Record<string, string> = {
      mermaid: '```mermaid\n' + (body || 'graph TD\n  A[开始] --> B[结束]') + '\n```\n',
      plantuml: '```plantuml\n' + (body || '@startuml\nA -> B: hello\n@enduml') + '\n```\n',
      math: '$' + (body || 'E=mc^2') + '$',
    }
    const insert = templates[type]
    if (ta) {
      const s = ta.selectionStart; const e = ta.selectionEnd
      const before = ta.value.slice(0, s); const after = ta.value.slice(e)
      ta.value = before + insert + after
      ta.selectionStart = ta.selectionEnd = s + insert.length
      ta.focus()
      onChange(ta.value)
    } else {
      onChange(value + insert)
    }
  }

  const canRecognize = noteRecognitionMode === 'ai'
    ? !!activeProvider?.apiKey
    : !!getMinerUToken()

  return (
    <div ref={containerRef} className="space-y-2">
      {/* ── Main editor / preview split ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <textarea
          ref={textareaRef}
          defaultValue={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={10}
          spellCheck={false}
          className="block min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        />
        <div className="rounded-lg border bg-muted/30 p-3 min-h-[120px] max-h-[500px] overflow-auto">
          {previewValue ? (
            <MarkdownRenderer content={previewValue} onImageAction={handleImageAction} />
          ) : (
            <p className="text-xs text-muted-foreground">预览区域，编辑内容后实时显示...</p>
          )}
        </div>
      </div>

      {/* ── Image preview & alignment for upload ────────────────────────── */}
      {imagePreview && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">插入格式：</span>
            {(['html', 'markdown'] as InsertMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setInsertMode(m)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  insertMode === m
                    ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-input text-muted-foreground hover:border-blue-300'
                )}
              >
                {m === 'html' ? '<img> HTML' : '![  ] Markdown'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">对齐：</span>
            {(['left', 'center', 'right'] as Align[]).map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => setSelectedAlign(zone)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  selectedAlign === zone
                    ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-input text-muted-foreground hover:border-blue-300'
                )}
              >
                {{ left: '靠左', center: '居中', right: '靠右' }[zone]}
              </button>
            ))}
          </div>
          <div className="relative border rounded-md overflow-hidden bg-muted/20">
            <img
              src={imagePreview}
              alt="preview"
              className="max-h-[300px] mx-auto rounded"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-muted border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Recognition result ────────────────────────────────────────── */}
      {recognitionResult && (
        <div className="space-y-1">
          <textarea
            value={recognitionResult}
            onChange={(e) => setRecognitionResult(e.target.value)}
            className="block min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm resize-y"
            rows={5}
            spellCheck={false}
          />
          <div className="flex gap-1">
            <Button size="sm" className="text-xs h-7" onClick={handleInsert}>插入笔记</Button>
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setRecognitionResult(null)}>放弃</Button>
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
        {/* Direct insert to markdown (upload then insert URL immediately) */}
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
          title="读取剪贴板中的图片并插入"
          onClick={async () => {
            try {
              const items = await navigator.clipboard.read()
              for (const item of items) {
                for (const type of item.types) {
                  if (type.startsWith('image/')) {
                    const blob = await item.getType(type)
                    const file = new File([blob], `clipboard.${type.split('/')[1]}`, { type })
                    uploadToR2(file)
                    return
                  }
                }
              }
            } catch { /* Clipboard API not available */ }
          }}>
          <Clipboard className="h-3 w-3 mr-1" />读取剪贴板
        </Button>
        <span className="w-px h-4 bg-border mx-0.5 self-center" />
        <Button variant="outline" size="sm" className="text-xs h-7"
          disabled={isUploading}
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) uploadToR2(file)
            }
            input.click()
          }}>
          {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImagePlus className="h-3 w-3 mr-1" />}插入图片
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7"
          title="支持手写笔记、图片、表格等内容识别"
          onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-3 w-3 mr-1" />上传手写笔记
        </Button>
        <span className="w-px h-4 bg-border mx-0.5 self-center hidden sm:block" />
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground font-mono"
          onClick={() => insertMarkdown('mermaid')}>Mermaid</Button>
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground font-mono"
          onClick={() => insertMarkdown('plantuml')}>PlantUML</Button>
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground font-mono"
          onClick={() => insertMarkdown('math')}>$公式$</Button>
        {imageBase64 && (
          <>
            <Button variant="outline" size="sm" className="text-xs h-7"
              disabled={isRecognizing || !canRecognize} onClick={handleRecognize}>
              {isRecognizing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              {noteRecognitionMode === 'ai' ? 'AI识别' : 'MinerU识别'}
            </Button>
            {user && (
              <Button variant="outline" size="sm" className="text-xs h-7"
                disabled={isUploading} onClick={handleUploadToCloud}>
                {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImagePlus className="h-3 w-3 mr-1" />}
                存为图片并插入
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Helper: build snippet ──────────────────────────────────────────────────
function buildSnippet(url: string, align: Align, mode: InsertMode): string {
  if (mode === 'markdown') {
    if (align === 'center') return `<p align="center">\n\n![图片](${url})\n\n</p>`
    if (align === 'left') return `<img src="${url}" align="left" style="margin: 0 12px 8px 0;" />`
    return `<img src="${url}" align="right" style="margin: 0 0 8px 12px;" />`
  }
  const styleMap: Record<Align, string> = {
    left:   'display:block; float:left; margin:0 12px 8px 0;',
    center: 'display:block; margin:0 auto 8px;',
    right:  'display:block; float:right; margin:0 0 8px 12px;',
  }
  return `<img src="${url}" style="${styleMap[align]}" />`
}
