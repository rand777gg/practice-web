import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { cn } from '@/lib/utils'
import { ChevronDown, Search, X } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

const TYPE_LABELS_ZH: Record<string, string> = {
  single_choice: '单选',
  multi_select: '多选',
  true_false: '判断',
  fill_blank: '填空',
  short_answer: '简答',
  analysis: '分析',
}

function typeLabel(type: string): string {
  return TYPE_LABELS_ZH[type] ?? type
}

const TYPE_COLORS: Record<string, string> = {
  single_choice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  multi_select: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  true_false: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  fill_blank: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  short_answer: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  analysis: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
}

function AnswerDisplay({ question }: { question: Question }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
        {open ? t('questionBank.collapseAnswer') : t('questionBank.expandAnswer')}
      </Button>
      {open && (
        <div className="mt-2 space-y-2 text-xs bg-muted/50 rounded-lg p-3">
          {/* Correct Answer */}
          <div>
            <span className="font-medium text-muted-foreground">答案：</span>
            <span className="text-green-600 dark:text-green-400">
              {(() => {
                const a = question.correct_answer
                if (a === null) return '主观题'
                if (typeof a === 'boolean') return a ? '正确' : '错误'
                if (Array.isArray(a)) {
                  return a.map((idx) => question.options[idx]).join('、')
                }
                if (typeof a === 'number') return question.options[a] ?? a
                return String(a)
              })()}
            </span>
          </div>

          {/* Options for choice questions */}
          {question.options.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">选项：</span>
              <ul className="mt-0.5 space-y-0.5">
                {question.options.map((opt, i) => {
                  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
                  const isCorrect = Array.isArray(question.correct_answer)
                    ? question.correct_answer.includes(i)
                    : question.correct_answer === i
                  return (
                    <li key={i} className={isCorrect ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                      {labels[i]}. {opt}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Analysis */}
          {question.analysis && (
            <div>
              <span className="font-medium text-muted-foreground">解析：</span>
              <span>{question.analysis}</span>
            </div>
          )}

          {question.answer_explanation && (
            <div>
              <span className="font-medium text-muted-foreground">详解：</span>
              <span>{question.answer_explanation}</span>
            </div>
          )}

          {question.key_points && (
            <div>
              <span className="font-medium text-muted-foreground">知识点：</span>
              <Badge variant="secondary" className="text-[10px]">{question.key_points}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Component() {
  const { t } = useT()
  const [searchParams, setSearchParams] = useSearchParams()

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const activeSubject = searchParams.get('subject') ?? ''
  const activeType = searchParams.get('type') ?? ''

  const setActiveSubject = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('subject', v); else next.delete('subject')
    next.delete('type')
    setSearchParams(next)
  }

  const setActiveType = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('type', v); else next.delete('type')
    setSearchParams(next)
  }

  useEffect(() => {
    async function load() {
      const { data: qs } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })

      const questions = qs ?? []
      setAllQuestions(questions)

      const subSet = new Set<string>()
      const typeSet = new Set<string>()
      for (const q of questions) {
        if (q.subject) subSet.add(q.subject)
        typeSet.add(q.question_type)
      }
      setSubjects([...subSet].sort())
      setTypes([...typeSet])
      setIsLoading(false)
    }
    load()
  }, [])

  const filtered = allQuestions.filter((q) => {
    if (activeSubject && q.subject !== activeSubject) return false
    if (activeType && q.question_type !== activeType) return false
    if (search) {
      const kw = search.toLowerCase()
      if (!q.question_text.toLowerCase().includes(kw)) return false
    }
    return true
  })

  if (isLoading) return <LoadingTips className="py-12" compact />

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('nav.questionBank')}</h1>

      {/* Subject cards */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            'rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
            !activeSubject
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
              : 'border-border hover:bg-accent',
          )}
          onClick={() => setActiveSubject('')}
        >
          {t('questionBank.allSubjects')}
          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{allQuestions.length}</span>
        </button>
        {subjects.map((s) => {
          const count = allQuestions.filter((q) => q.subject === s).length
          return (
            <button
              key={s}
              type="button"
              className={cn(
                'rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                activeSubject === s
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                  : 'border-border hover:bg-accent',
              )}
              onClick={() => setActiveSubject(s)}
            >
              {s}
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('questionBank.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {types.map((tp) => (
            <button
              key={tp}
              type="button"
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors border',
                activeType === tp
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                  : 'border-border hover:bg-accent text-muted-foreground',
              )}
              onClick={() => setActiveType(activeType === tp ? '' : tp)}
            >
              {typeLabel(tp)}
            </button>
          ))}
        </div>
      </div>

      {/* Question list */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-none">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">{t('questionBank.noQuestions')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card key={q.id} className="border-0 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {q.subject && (
                    <Badge variant="secondary" className="text-[10px]">{q.subject}</Badge>
                  )}
                  <Badge className={cn('text-[10px]', TYPE_COLORS[q.question_type] ?? '')}>
                    {typeLabel(q.question_type)}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-normal leading-relaxed pt-1">
                  {q.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnswerDisplay question={q} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
