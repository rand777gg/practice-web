import { useState, useEffect, useRef } from 'react'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { streamText } from 'ai'
import { getAiConfig, hasAiConfig } from '@/lib/ai/config'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { Question } from '@/types'
import { X, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

interface Props {
  question: Question | null
  open: boolean
  onClose: () => void
  isMobile?: boolean
}

function buildPrompt(q: Question): string {
  const typeLabel = QUESTION_TYPE_LABELS[q.question_type] || q.question_type
  const parts = [
    `题目：${q.question_text}`,
    `题型：${typeLabel}`,
  ]
  if (q.options?.length) {
    parts.push(`选项：${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`)
  }
  const raw = q.correct_answer
  if (raw !== null && raw !== undefined && !(Array.isArray(raw) && raw.length === 0)) {
    parts.push(`正确答案：${JSON.stringify(raw)}`)
  }
  if (q.answer_explanation) {
    parts.push(`解析：${q.answer_explanation}`)
  }
  if (q.key_points) {
    parts.push(`知识点：${q.key_points}`)
  }
  return parts.join('\n')
}

const SYSTEM_PROMPT = `你是一位经验丰富的老师。请针对用户提供的题目进行详细讲解。

讲解要求：
1. **题目分析**：简要分析题目考查的知识点和解题思路
2. **选项/答案辨析**：对选择题逐个选项分析对错原因；对填空/简答题说明答案推导过程
3. **易错提醒**：指出常见的错误思路或陷阱
4. **知识扩展**：关联相关知识点，帮助举一反三

用自然、亲和的语言，像一位耐心的老师在给学生辅导。`

export function AiExplanation({ question, open, onClose, isMobile }: Props) {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const lastQuestionIdRef = useRef<string | null>(null)
  const lastRetryKeyRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !question) return
    if (question.id === lastQuestionIdRef.current && retryKey === lastRetryKeyRef.current) return
    lastRetryKeyRef.current = retryKey
    lastQuestionIdRef.current = question.id

    let cancelled = false
    setContent('')
    setError(null)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const run = async () => {
      try {
        const config = getAiConfig()
        const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
        const model = client(config.model || 'deepseek-chat')

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(question),
          temperature: 0.3,
          abortSignal: controller.signal,
          maxRetries: 0,
        })

        let text = ''
        const reader = result.textStream.getReader()
        while (true) {
          if (cancelled || controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) break
          text += value
          setContent(text)
        }
      } catch (e: any) {
        if (!cancelled && !controller.signal.aborted) {
          setError(e?.message || String(e) || 'AI 请求失败')
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setIsStreaming(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, question?.id, retryKey])

  const handleClose = () => {
    abortRef.current?.abort()
    onClose()
  }

  const handleRetry = () => {
    setRetryKey((k) => k + 1)
  }

  // Auto-scroll effect
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content])

  if (!hasAiConfig()) return null

  return (
    <div className={cn('flex flex-col h-full', isMobile ? 'h-full' : 'h-full min-h-0')}>
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-sm">AI 解读</span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              生成中...
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
          <p className="text-xs text-muted-foreground mb-2 font-medium">题目上下文</p>
          <MarkdownRenderer content={buildPrompt(question!)} />
        </div>

        {isStreaming && !content && !error && (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-4/6" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
              <RefreshCw className="h-3 w-3 mr-1" />重试
            </Button>
          </div>
        )}

        {content && (
          <div className="rounded-lg bg-card border p-3 text-sm leading-relaxed">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
