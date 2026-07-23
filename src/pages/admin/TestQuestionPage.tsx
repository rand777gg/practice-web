import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { isAnswerCorrect, getDefaultAnswer } from '@/lib/answer-utils'
import { cn } from '@/lib/utils'
import type { Question, CorrectAnswer } from '@/types'
import { ArrowLeft, Search, RotateCcw, Check, X, Filter, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export function Component() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialId = searchParams.get('id') || ''

  const [search, setSearch] = useState(initialId)
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!!initialId)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [subjectFilter, setSubjectFilter] = useState<string>('')
  const [subjects, setSubjects] = useState<string[]>([])

  useEffect(() => {
    supabase.rpc('get_question_meta', { p_subject: null }).then(({ data }: { data: { subjects: string[] } | null }) => {
      if (data?.subjects) setSubjects(data.subjects)
    })
  }, [])

  useEffect(() => {
    if (initialId) {
      supabase.from('questions').select('*').eq('id', initialId).single().then(({ data }) => {
        if (data) {
          setSelectedQuestion(data as Question)
          setSelectedAnswer(getDefaultAnswer(data.question_type))
        }
        setInitialLoading(false)
      })
    }
  }, [initialId])

  const handleSearch = useCallback(async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    setLoading(true)

    // Try exact ID match first
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      const { data } = await supabase.from('questions').select('*').eq('id', trimmed).single()
      if (data) {
        const q = data as Question
        setSelectedQuestion(q)
        setSelectedAnswer(getDefaultAnswer(q.question_type))
        setIsSubmitted(false)
        setQuestions([])
        setLoading(false)
        return
      }
    }

    // Text search
    let query = supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(20)
    if (typeFilter) query = query.eq('question_type', typeFilter)
    if (subjectFilter) query = query.eq('subject', subjectFilter)
    if (!/^[0-9a-f-]+$/i.test(trimmed)) {
      query = query.or(`question_text.ilike.%${trimmed}%,id.eq.${trimmed}`)
    } else {
      query = query.eq('id', trimmed)
    }
    const { data } = await query
    setQuestions((data as Question[]) || [])
    setLoading(false)
  }, [search, typeFilter, subjectFilter])

  const handleSelect = useCallback((question: Question) => {
    setSelectedQuestion(question)
    setSelectedAnswer(getDefaultAnswer(question.question_type))
    setIsSubmitted(false)
    setQuestions([])
    setSearch(question.id)
  }, [])

  const handleSubmit = useCallback(() => {
    setIsSubmitted(true)
  }, [])

  const handleReset = useCallback(() => {
    if (selectedQuestion) {
      setSelectedAnswer(getDefaultAnswer(selectedQuestion.question_type))
      setIsSubmitted(false)
    }
  }, [selectedQuestion])

  const isCorrect = selectedQuestion && selectedAnswer !== null
    ? isAnswerCorrect(selectedAnswer, selectedQuestion.correct_answer, selectedQuestion.question_type, selectedQuestion.allow_unordered, selectedQuestion.unordered_blanks)
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/questions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">测试题目</h1>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入题目 ID 或关键词搜索..."
            className="pr-8 text-sm"
          />
          {questions.length > 0 && (
            <div className="absolute top-full mt-1 w-full z-20 border rounded-md bg-card shadow-lg max-h-64 overflow-y-auto">
              {questions.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                  onClick={() => handleSelect(q)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{q.question_type === 'coding' ? '编程' : q.question_type === 'single_choice' ? '单选' : q.question_type === 'multi_select' ? '多选' : q.question_type === 'true_false' ? '判断' : q.question_type}</Badge>
                    <span className="truncate">{q.question_text.slice(0, 60)}{q.question_text.length > 60 ? '...' : ''}</span>
                    {q.subject && <span className="text-xs text-muted-foreground shrink-0">{q.subject}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button size="sm" onClick={handleSearch} disabled={loading || !search.trim()}>
          <Search className="size-3.5 mr-1" />
          搜索
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="size-3.5" />
              筛选
              <ChevronDown className="size-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem checked={typeFilter === ''} onCheckedChange={() => setTypeFilter('')}>
              全部题型
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {['single_choice', 'multi_select', 'true_false', 'judge_correct', 'fill_blank', 'short_answer', 'analysis', 'coding'].map((type) => (
              <DropdownMenuCheckboxItem key={type} checked={typeFilter === type} onCheckedChange={() => setTypeFilter(typeFilter === type ? '' : type)}>
                {{ single_choice: '单选题', multi_select: '多选题', true_false: '判断题', judge_correct: '判断改错题', fill_blank: '填空题', short_answer: '简答题', analysis: '分析题', coding: '编程题' }[type]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={subjectFilter === ''} onCheckedChange={() => setSubjectFilter('')}>
              全部科目
            </DropdownMenuCheckboxItem>
            {subjects.slice(0, 15).map((s) => (
              <DropdownMenuCheckboxItem key={s} checked={subjectFilter === s} onCheckedChange={() => setSubjectFilter(subjectFilter === s ? '' : s)}>
                {s}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {initialLoading ? (
        <LoadingTips compact className="py-8" />
      ) : selectedQuestion ? (
        <div className="space-y-4">
          <QuestionCard
            key={selectedQuestion.id}
            question={selectedQuestion}
            selectedAnswer={selectedAnswer}
            showResult={isSubmitted}
            onSelect={isSubmitted ? undefined : setSelectedAnswer}
            disabled={isSubmitted}
          />

          {/* Result banner */}
          {isSubmitted && isCorrect !== null && (
            <div className={cn(
              'rounded-lg p-4 flex items-center gap-3',
              isCorrect
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800',
            )}>
              {isCorrect ? (
                <Check className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <X className="size-5 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <div>
                <p className={cn('font-medium text-sm', isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                  {isCorrect ? '回答正确！' : '回答错误'}
                </p>
                {!isCorrect && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    正确答案：{(() => {
                      const raw = selectedQuestion.correct_answer
                      if (raw === null) return '(无)'
                      if (typeof raw === 'boolean') return raw ? '正确' : '错误'
                      if (Array.isArray(raw)) {
                        if (raw.length === 0) return '(无)'
                        if (typeof raw[0] === 'number') return (raw as number[]).map((i) => selectedQuestion.options?.[i] ?? String(i)).join('、')
                        return raw.join('、')
                      }
                      if (raw && typeof raw === 'object' && 'code' in raw) return '(编程题 - 见测试用例)'
                      return String(raw)
                    })()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            {!isSubmitted ? (
              <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                提交答案
              </Button>
            ) : (
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="size-3.5 mr-1" />
                重新作答
              </Button>
            )}
          </div>

          {/* Answer explanation */}
          {isSubmitted && selectedQuestion.answer_explanation && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">解析：</span>
              <span>{selectedQuestion.answer_explanation}</span>
            </div>
          )}
          {isSubmitted && selectedQuestion.analysis && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              <span className="font-medium">分析：</span>
              <span>{selectedQuestion.analysis}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="size-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">搜索题目 ID 或关键词来开始测试</p>
          <p className="text-xs mt-1 opacity-60">支持按题型、科目筛选</p>
        </div>
      )}
    </div>
  )
}
