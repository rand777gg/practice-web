import { useState, useRef, memo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ImagePlus, Sparkles, Loader2, X, ImageUp } from 'lucide-react'
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
  rows?: number
}

export const NoteEditor = memo(function NoteEditor({ value, onChange, placeholder, rows = 3 }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const { noteRecognitionMode } = useSettingsStore()
  const providers = useAiStore((s) => s.providers)
  const activeProvider = providers.find((p) => p.enabled && p.models.some((m) => m.enabled))

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
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
    setImageBase64(null)
    setImageFile(null)
    setRecognitionResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRecognize = async () => {
    if (!imageBase64) return
    setIsRecognizing(true)
    try {
      if (noteRecognitionMode === 'ai') {
        if (!activeProvider) throw new Error('请先在 AI 管理页启用一个多模态模型（如 Qwen3.7-Plus）')
        const modelId = activeProvider.models.find((m) => m.enabled)?.id || activeProvider.models[0].id
        const promptText = value
          ? `已有笔记：\n${value}\n\n请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。`
          : '请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。'

        const res = await fetch(`${activeProvider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeProvider.apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
              ],
            }],
          }),
        })
        const data = await res.json() as any
        if (data.error) throw new Error(data.error?.message || data.error?.code || 'API error')
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
      const imageUrl = (data as { url: string }).url
      if (!imageUrl) throw new Error('未返回图片地址')
      const md = `![图片](${imageUrl})`
      onChange(value ? `${value}\n\n${md}` : md)
      handleRemoveImage()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    }
    setIsUploading(false)
  }

  const handleInsertResult = () => {
    if (!recognitionResult) return
    const separator = value ? '\n\n---\n识别结果：\n' : ''
    onChange(value + separator + recognitionResult)
    handleRemoveImage()
  }

  const canRecognize = noteRecognitionMode === 'ai'
    ? !!activeProvider?.apiKey
    : !!getMinerUToken()

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      {imagePreview && (
        <div className="relative inline-block">
          <img src={imagePreview} alt="preview" className="max-h-32 rounded border" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-muted border shadow-sm"
            onClick={handleRemoveImage}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {recognitionResult && (
        <div className="space-y-1">
          <Textarea
            value={recognitionResult}
            onChange={(e) => setRecognitionResult(e.target.value)}
            className="text-xs min-h-[80px] resize-y"
            rows={5}
          />
          <div className="flex gap-1">
            <Button size="sm" className="text-xs h-7" onClick={handleInsertResult}>
              插入笔记
            </Button>
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setRecognitionResult(null)}>
              放弃
            </Button>
          </div>
        </div>
      )}
      <div className="flex gap-1 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-3 w-3 mr-1" />
          上传图片
        </Button>
        {imageBase64 && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              disabled={isRecognizing || !canRecognize}
              onClick={handleRecognize}
            >
              {isRecognizing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {noteRecognitionMode === 'ai' ? 'AI识别' : 'MinerU识别'}
            </Button>
            {user && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                disabled={isUploading}
                onClick={handleUploadToCloud}
              >
                {isUploading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <ImageUp className="h-3 w-3 mr-1" />
                )}
                存为图片
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
})
