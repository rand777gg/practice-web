import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, ChevronDown } from 'lucide-react'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { hasAiConfig } from '@/lib/ai/config'
import { streamQuestionExplanation } from '@/lib/ai/explain'
import { useT } from '@/i18n/use-t'
import type { Question, CorrectAnswer } from '@/types'

interface Props {
  question: Question
  userAnswer?: CorrectAnswer | null
  isCorrect?: boolean
}

// AI explanation for the current question — streamed markdown, cached per instance.
// Reset per question by keying on question.id where rendered.
export function AiExplainPanel({ question, userAnswer, isCorrect }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genRef = useRef(0)

  const run = useCallback(async () => {
    if (!hasAiConfig()) { setError('AI_NOT_CONFIGURED'); return }
    genRef.current++
    const my = genRef.current
    setLoading(true); setError(null); setText('')
    try {
      await streamQuestionExplanation(question, { userAnswer, isCorrect }, (full) => {
        if (genRef.current === my) setText(full)
      })
    } catch (e) {
      if (genRef.current === my) setError((e as Error).message)
    } finally {
      if (genRef.current === my) setLoading(false)
    }
  }, [question, userAnswer, isCorrect])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && !text && !loading && !error) run()
  }

  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-900/50 overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        {t('ai.explain')}
        <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t pt-2">
          {error === 'AI_NOT_CONFIGURED' ? (
            <p className="text-xs text-muted-foreground">{t('ai.notConfigured')}</p>
          ) : error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">{t('ai.explainError')}</p>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={run}>{t('ai.retry')}</Button>
            </div>
          ) : (
            <>
              {text && <MarkdownRenderer content={text} className="text-sm" />}
              {loading && (
                <p className="text-xs text-muted-foreground animate-pulse mt-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />{t('ai.explaining')}
                </p>
              )}
              {!loading && text && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                  <span className="text-[10px] text-muted-foreground">{t('ai.disclaimer')}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={run}>{t('ai.regenerate')}</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
