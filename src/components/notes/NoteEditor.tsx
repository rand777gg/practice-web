import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { ImagePlus, Sparkles, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useAiStore } from '@/stores/ai-store'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUToken } from '@/lib/ai/config'
import { useSettingsStore } from '@/stores/settings-store'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<string | null>(null)
  const [previewValue, setPreviewValue] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const { noteRecognitionMode } = useSettingsStore()
  const providers = useAiStore((s) => s.providers)
  const activeProvider = providers.find((p) => p.enabled && p.models.some((m) => m.enabled))

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

  const handleUploadToCloud = async () => {
    if (!imageFile || !user) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', imageFile)
      formData.append('folder', `notes/${user.id}`)
      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error) throw new Error(error.message || '上传失败')
      const url = (data as { url: string }).url
      if (!url) throw new Error('未返回图片地址')
      const current = textareaRef.current?.value || value
      onChange(current ? `${current}\n\n![图片](${url})` : `![图片](${url})`)
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

  const canRecognize = noteRecognitionMode === 'ai'
    ? !!activeProvider?.apiKey
    : !!getMinerUToken()

  const textareaClass = 'block min-h-[280px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y'

  const handleImageAction = (action: 'left' | 'center' | 'right', src: string) => {
    const current = textareaRef.current?.value || value
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const newMd = current.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}(?:\\s+"[^"]*")?\\)`, 'g'),
      `![$1](${src} "align:${action}")`
    )
    if (newMd !== current) onChange(newMd)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <textarea
          ref={textareaRef}
          defaultValue={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={10}
          spellCheck={false}
          className={textareaClass}
        />
        <div className="rounded-lg border bg-muted/30 p-3 min-h-[280px] max-h-[500px] overflow-auto">
          {previewValue ? (
            <MarkdownRenderer content={previewValue} onImageAction={handleImageAction} />
          ) : (
            <p className="text-xs text-muted-foreground">预览区域，编辑内容后实时显示...</p>
          )}
        </div>
      </div>

      {imagePreview && (
        <div className="relative inline-block">
          <img src={imagePreview} alt="preview" className="max-h-32 rounded border" />
          <button type="button"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-muted border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
            onClick={clearImage}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

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

      <div className="flex gap-1 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
        <Button variant="outline" size="sm" className="text-xs h-7"
          disabled={isUploading}
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (!file) return
              setIsUploading(true)
              try {
                const formData = new FormData()
                formData.append('file', file)
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
                存为图片
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
