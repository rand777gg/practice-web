import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ImagePlus, Sparkles, Loader2, Bold, Italic, Underline, Strikethrough, Highlighter, Smile, WrapText, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Indent, Sigma, ScanEye, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useAiStore } from '@/stores/ai-store'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUToken } from '@/lib/ai/config'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import { compressImage } from '@/lib/image-compress'
import { EmojiPickerContent } from './EmojiPickerContent'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type Align = 'left' | 'center' | 'right'
type InsertMode = 'html' | 'markdown'

// Common GitHub-style emoji shortcodes
const EMOJI_LIST = [
  'smile', 'laughing', 'blush', 'heart_eyes', 'wink', 'relieved', 'sweat_smile',
  'joy', 'rofl', 'smiley', 'grin', 'innocent', 'slight_smile', 'upside_down',
  'yum', 'relaxed', 'thinking', 'sunglasses', 'neutral_face', 'expressionless',
  'unamused', 'rolling_eyes', 'flushed', 'disappointed', 'worried', 'angry',
  'rage', 'cry', 'sob', 'scream', 'confused', 'dizzy_face', 'astonished',
  'zipper_mouth', 'mask', 'face_with_thermometer', 'face_with_head_bandage',
  'sleeping', 'zzz', 'poop', 'ghost', 'alien', 'robot', 'clap', 'thumbsup',
  'thumbsdown', 'punch', 'wave', 'ok_hand', 'raised_hands', 'pray', 'muscle',
  'fire', 'star', 'sparkles', 'zap', 'boom', 'exclamation', 'question',
  'bulb', 'memo', 'book', 'rocket', 'tada', 'warning', 'white_check_mark',
  'x', 'heavy_plus_sign', 'arrow_right', 'arrow_left',
]

function wrapSelection(value: string, ta: HTMLTextAreaElement | null, open: string, close: string): string {
  if (!ta) return value
  const s = ta.selectionStart, e = ta.selectionEnd
  if (s === e) return value  // no selection, do nothing
  const before = value.slice(0, s)
  const selected = value.slice(s, e)
  const after = value.slice(e)
  const newValue = before + open + selected + close + after
  requestAnimationFrame(() => {
    ta.focus()
    ta.setSelectionRange(s + open.length, e + open.length)
  })
  return newValue
}

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<string | null>(null)
  const [previewValue, setPreviewValue] = useState(value)
  const [isFormatting, setIsFormatting] = useState(false)

  const [selectedAlign, setSelectedAlign] = useState<Align>('center')
  const [insertMode, setInsertMode] = useState<InsertMode>('html')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const { noteRecognitionMode } = useSettingsStore()
  const providers = useAiStore((s) => s.providers)
  const activeProvider = providers.find((p) => p.enabled && p.models.some((m) => m.enabled))

  // Uncontrolled textarea — only sync when value changes externally
  useEffect(() => {
    const ta = textareaRef.current
    if (ta && ta.value !== value) ta.value = value
  }, [value])

  useEffect(() => {
    const t = setTimeout(() => setPreviewValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  const handleChange = () => {
    if (textareaRef.current) onChange(textareaRef.current.value)
  }

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

  // ── Text formatting helpers ──────────────────────────────────────────────

  const applyFormat = (open: string, close: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const v = wrapSelection(ta.value, ta, open, close)
    ta.value = v
    onChange(v)
  }

  const handleBold = () => applyFormat('**', '**')
  const handleItalic = () => applyFormat('*', '*')
  const handleUnderline = () => applyFormat('<u>', '</u>')
  const handleStrikethrough = () => applyFormat('<s>', '</s>')
  const handleHighlight = () => applyFormat('<mark>', '</mark>')

  // Line prefix — wrap each selected line
  const applyLinePrefix = (prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const s = ta.selectionStart; const e = ta.selectionEnd
    const before = ta.value.slice(0, s)
    const selected = ta.value.slice(s, e)
    const lines = selected ? selected.split('\n') : ['']
    const formatted = lines.map(l => prefix + l).join('\n')
    ta.value = before + formatted + ta.value.slice(e)
    const newEnd = s + formatted.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s, newEnd) })
    onChange(ta.value)
  }

  const handleOrderedList = () => applyLinePrefix('1. ')
  const handleUnorderedList = () => applyLinePrefix('- ')
  const handleLineHeight = (lh: string) => applyFormat(`<span style="line-height:${lh}">`, '</span>')
  const handleAlign = (align: string) => applyFormat(`<div align="${align}">`, '</div>')
  const handleIndent = () => applyFormat('<blockquote>', '</blockquote>')
  const handleEmoji = (emoji: string) => {
    const ta = textareaRef.current
    if (!ta) { onChange(value + emoji); return }
    const s = ta.selectionStart
    const before = ta.value.slice(0, s)
    const after = ta.value.slice(s)
    ta.value = before + emoji + after
    const pos = s + emoji.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos) })
    onChange(ta.value)
  }

  const handleAiLineBreak = async () => {
    if (!activeProvider) return
    setIsFormatting(true)
    try {
      const current = textareaRef.current?.value || value
      if (!current.trim()) return
      const modelId = activeProvider.models.find((m) => m.enabled)?.id || activeProvider.models[0].id
      const res = await fetch(`${activeProvider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeProvider.apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content:
            `Format the following text with proper line breaks. Insert <br> at natural break points — between list items, before/after ordered/unordered lists, between paragraphs. Do NOT change any content, only add <br> tags for readability.\n\nTEXT:\n${current}`
          }],
          temperature: 0.1,
          max_tokens: current.length * 2,
        }),
      })
      const data = await res.json() as any
      if (data.error) throw new Error(data.error?.message || 'API error')
      const text = data.choices?.[0]?.message?.content
      if (text) {
        if (textareaRef.current) textareaRef.current.value = text
        onChange(text)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '格式化失败')
    }
    setIsFormatting(false)
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
      <div className="flex gap-1 flex-wrap items-center">
        {/* ── Group 1: Text formatting ── */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="加粗" onClick={handleBold}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="斜体" onClick={handleItalic}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="下划线" onClick={handleUnderline}>
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="删除线" onClick={handleStrikethrough}>
          <Strikethrough className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="高亮" onClick={handleHighlight}>
          <Highlighter className="h-3.5 w-3.5" />
        </Button>

        <span className="w-px h-4 bg-border mx-0.5 self-center" />

        {/* ── Group 2: Paragraph ── */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="有序列表" onClick={handleOrderedList}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="无序列表" onClick={handleUnorderedList}>
          <List className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="行高">
              <span className="text-[11px] font-mono">1.5</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {['1.0', '1.25', '1.5', '1.75', '2.0'].map(lh => (
              <DropdownMenuItem key={lh} onClick={() => handleLineHeight(lh)}>
                <span className="text-xs">{lh}x</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="对齐方式">
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleAlign('left')}>
              <AlignLeft className="h-3.5 w-3.5 mr-1" /><span className="text-xs">左对齐</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAlign('center')}>
              <AlignCenter className="h-3.5 w-3.5 mr-1" /><span className="text-xs">居中</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAlign('right')}>
              <AlignRight className="h-3.5 w-3.5 mr-1" /><span className="text-xs">右对齐</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="增加缩进" onClick={handleIndent}>
          <Indent className="h-3.5 w-3.5" />
        </Button>

        <span className="w-px h-4 bg-border mx-0.5 self-center" />

        {/* ── Group 3: Insert ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入 Emoji">
              <Smile className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <EmojiPickerContent onSelect={handleEmoji} />
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入公式"
          onClick={() => insertMarkdown('math')}>
          <Sigma className="h-3.5 w-3.5" />
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入图片"
          disabled={isUploading}
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'; input.accept = 'image/*'
            input.onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadToR2(f) }
            input.click()
          }}>
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        </Button>

        <span className="w-px h-4 bg-border mx-0.5 self-center" />

        {/* ── Group 4: AI ── */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
          title="AI 自动换行"
          disabled={isFormatting || !activeProvider}
          onClick={handleAiLineBreak}>
          {isFormatting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WrapText className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
          title="识别手写笔记/图片"
          onClick={() => fileInputRef.current?.click()}>
          <ScanEye className="h-3.5 w-3.5" />
        </Button>

        <span className="w-px h-4 bg-border mx-0.5 self-center hidden sm:block" />
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground font-mono" onClick={() => insertMarkdown('mermaid')}>Mermaid</Button>
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground font-mono" onClick={() => insertMarkdown('plantuml')}>PlantUML</Button>

        {imageBase64 && (
          <>
            <span className="w-px h-4 bg-border mx-0.5 self-center" />
            <Button variant="outline" size="sm" className="text-xs h-7"
              disabled={isRecognizing || !canRecognize} onClick={handleRecognize}>
              {isRecognizing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              {noteRecognitionMode === 'ai' ? 'AI识别' : 'MinerU识别'}
            </Button>
            {user && (
              <Button variant="outline" size="sm" className="text-xs h-7"
                disabled={isUploading} onClick={handleUploadToCloud}>
                {isUploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 mr-1" />}
                存为图片并插入
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

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
