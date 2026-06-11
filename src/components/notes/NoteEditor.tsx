import { useState, useRef, memo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ImagePlus, Sparkles, Loader2, X } from 'lucide-react'
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
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { noteRecognitionMode, multimodalAIConfig } = useSettingsStore()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
    setRecognitionResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRecognize = async () => {
    if (!imageBase64) return
    setIsRecognizing(true)
    try {
      if (noteRecognitionMode === 'ai') {
        const { apiKey, baseURL, model } = multimodalAIConfig
        if (!apiKey) throw new Error('请先在设置中配置多模态 AI 模型')

        const { createOpenAI } = await import('@ai-sdk/openai')
        const { generateText } = await import('ai')
        const client = createOpenAI({ apiKey, baseURL })
        const { text } = await generateText({
          model: client(model || 'gpt-4o'),
          messages: [{
            role: 'user' as const,
            content: [
              ...(value ? [{ type: 'text' as const, text: `已有笔记：\n${value}\n\n请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。` }] : [{ type: 'text' as const, text: '请识别图片中的全部内容（文字、公式、表格、图表），输出 markdown 格式。' }]),
              { type: 'image' as const, image: imageBase64 },
            ],
          }],
        })
        setRecognitionResult(text.trim())
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

  const handleInsertResult = () => {
    if (!recognitionResult) return
    const separator = value ? '\n\n---\n识别结果：\n' : ''
    onChange(value + separator + recognitionResult)
    setImagePreview(null)
    setImageBase64(null)
    setRecognitionResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const canRecognize = noteRecognitionMode === 'ai'
    ? !!multimodalAIConfig.apiKey
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
      <div className="flex gap-1">
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
        )}
      </div>
    </div>
  )
})
