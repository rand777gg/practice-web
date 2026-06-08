import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { hasAiConfig } from '@/lib/ai'

interface Props {
  title: string
  dataDesc: string
}

export function AiChartInsight({ title, dataDesc }: Props) {
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)

  if (!hasAiConfig()) return null

  const analyze = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (text) return
    setLoading(true)
    try {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      const { generateText } = await import('ai')
      const model = createDeepSeek({
        apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY,
        baseURL: import.meta.env.VITE_DEEPSEEK_BASE_URL || undefined,
      })
      const result = await generateText({
        model: model(import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'),
        system: '你是一个学习数据分析助手。根据提供的图表数据，用2-4句话简要分析：1) 数据特征或规律 2) 一条实用的学习建议。语言简洁，不要重复数据本身。',
        prompt: `图表：${title}\n数据：${dataDesc}`,
        temperature: 0.7,
        maxOutputTokens: 300,
      })
      setText(result.text?.trim() || '')
    } catch { setText('AI 分析暂时不可用') }
    setLoading(false)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={analyze}
          disabled={loading}
          className="text-xs text-muted-foreground gap-1"
        >
          <Sparkles className={`h-3 w-3 text-blue-400 ${loading ? 'animate-pulse' : ''}`} />
          {loading ? '分析中...' : 'AI 分析'}
        </Button>
      </div>
      {expanded && text && (
        <p className="text-xs text-muted-foreground leading-relaxed bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-2.5 max-w-2xl mx-auto">
          {[...text].map((ch, i) => (
            <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.02}s` }}>{ch}</span>
          ))}
        </p>
      )}
    </div>
  )
}
