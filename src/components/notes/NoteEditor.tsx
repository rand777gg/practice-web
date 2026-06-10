import { useState, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ImagePlus, Sparkles, Loader2, X } from 'lucide-react'
import { getAiConfig } from '@/lib/ai/config'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateText } from 'ai'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

export function NoteEditor({ value, onChange, placeholder, rows = 3 }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageMimeType(file.type || 'image/png')
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
    setImageBase64(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAiRecognize = async () => {
    if (!imageBase64) return
    setIsRecognizing(true)
    try {
      const config = getAiConfig()
      if (!config.apiKey) {
        setIsRecognizing(false)
        return
      }
      const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
      const model = client(config.model || 'deepseek-chat')

      const { text } = await generateText({
        model,
        messages: [
          {
            role: 'user' as const,
            content: [
              ...(value
                ? [{ type: 'text' as const, text: `用户已有的笔记：\n${value}\n\n请识别图片中的内容（文字、题目、图表等），将识别结果补充到笔记中。用中文输出。` }]
                : [{ type: 'text' as const, text: '请识别图片中的内容（文字、题目、图表等）。用中文输出。' }]
              ),
              { type: 'image' as const, image: imageBase64 },
            ],
          },
        ],
      })

      const result = text.trim()
      const separator = value ? '\n\n---\nAI识别：\n' : ''
      onChange(value + separator + result)
    } catch (err) {
      console.error('AI recognition failed:', err)
    }
    setIsRecognizing(false)
  }

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
            disabled={isRecognizing || !getAiConfig().apiKey}
            onClick={handleAiRecognize}
          >
            {isRecognizing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            AI识别
          </Button>
        )}
      </div>
    </div>
  )
}
