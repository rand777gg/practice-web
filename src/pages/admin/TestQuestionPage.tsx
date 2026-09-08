import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { isAnswerCorrect, getDefaultAnswer } from '@/lib/answer-utils'
import { naturalSort, cn } from '@/lib/utils'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import type { Question, CorrectAnswer } from '@/types'
import { ArrowLeft, Search, RotateCcw, Check, X, FlaskConical, ChevronDown, ChevronRight, FileSearch } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/i18n/use-t'

const RESULT_LIMIT = 20
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function Component() {
  const { t } = useT()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialId = searchParams.get('id') || ''

  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()

  // —— 筛选状态(与题目管理界面同一套交互: 学科 / 分类 / 题型 + 关键词搜索) ——
  const [search, setSearch] = useState(initialId)
  const [selectedSubject, setSelectedSubject] = useState(() => searchParams.get('subject') || '')
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category') || '')
  const [selectedType, setSelectedType] = useState<string>(() => searchParams.get('type') || '')

  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!!initialId)
  const [listVisible, setListVisible] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initRef = useRef(true)

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [subjects],
  )
  const yearCategories = useMemo(
    () => filteredCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)),
    [filteredCategories],
  )
  const nonYearCategories = useMemo(
    () => filteredCategories.filter((c) => !/^\d{4}年真题$/.test(c)).sort(naturalSort),
    [filteredCategories],
  )

  // URL 参数同步(与题目管理一致, 便于从题库带条件跳入)
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedSubject) params.set('subject', selectedSubject)
    if (selectedCategory) params.set('category', selectedCategory)
    if (selectedType) params.set('type', selectedType)
    if (initialId) params.set('id', initialId)
    setSearchParams(params, { replace: true })
  }, [selectedSubject, selectedCategory, selectedType, initialId, setSearchParams])

  // 切换学科时重置分类(与题目管理一致)
  useEffect(() => {
    updateFilteredCategories(selectedSubject)
    if (initRef.current) { initRef.current = false; return }
    setSelectedCategory('')
  }, [selectedSubject, updateFilteredCategories])

  // 通过 ?id= 直达: 直接加载并进入试做
  useEffect(() => {
    if (!initialId) return
    supabase.from('questions').select('*').eq('id', initialId).single().then(({ data }) => {
      if (data) {
        const q = data as Question
        setSelectedQuestion(q)
        setSelectedAnswer(getDefaultAnswer(q.question_type))
      }
      setInitialLoading(false)
    })
  }, [initialId])

  const startTest = useCallback((q: Question) => {
    setSelectedQuestion(q)
    setSelectedAnswer(getDefaultAnswer(q.question_type))
    setIsSubmitted(false)
  }, [])

  const backToList = useCallback(() => {
    setSelectedQuestion(null)
    setSelectedAnswer(null)
    setIsSubmitted(false)
  }, [])

  /** 关键词 / ID 搜索 + 学科分类题型筛选(与题目管理查询口径一致) */
  const runSearch = useCallback(async () => {
    const trimmed = search.trim()
    if (!trimmed && !selectedSubject && !selectedCategory && !selectedType) {
      setQuestions([])
      setListVisible(false)
      return
    }
    setLoading(true)
    setSelectedQuestion(null)
    setSelectedAnswer(null)
    setIsSubmitted(false)

    // 完整 UUID 先尝试精确定位
    if (UUID_RE.test(trimmed)) {
      const { data } = await supabase.from('questions').select('*').eq('id', trimmed).single()
      if (data) {
        startTest(data as Question)
        setQuestions([])
        setListVisible(false)
        setLoading(false)
        return
      }
    }

    let query = supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(RESULT_LIMIT)
    if (selectedSubject) query = query.eq('subject', selectedSubject)
    if (selectedCategory === '__unset__') {
      query = query.is('category', null)
    } else if (selectedCategory) {
      query = query.eq('category', selectedCategory)
    }
    if (selectedType) query = query.eq('question_type', selectedType)
    if (trimmed) {
      if (/^[0-9a-f-]+$/i.test(trimmed)) {
        query = query.eq('id', trimmed)
      } else {
        const escaped = trimmed.replace(/%/g, '\\%')
        query = query.or(`question_text.ilike.%${escaped}%,id.eq.${trimmed}`)
      }
    }
    const { data } = await query
    const list = (data ?? []) as Question[]
    // 仅 1 条精确命中时直接进入试做, 避免多一步选择
    if (list.length === 1 && trimmed && list[0].id === trimmed) {
      startTest(list[0])
      setQuestions([])
      setListVisible(false)
    } else {
      setQuestions(list)
      setListVisible(true)
    }
    setLoading(false)
  }, [search, selectedSubject, selectedCategory, selectedType, startTest])

  // 防抖自动搜索(与题目管理界面的交互一致: 改筛选/关键词即刷新)
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch()
    }, 350)
    return () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current) }
  }, [search, selectedSubject, selectedCategory, selectedType, runSearch])

  const handleReset = useCallback(() => {
    if (selectedQuestion) {
      setSelectedAnswer(getDefaultAnswer(selectedQuestion.question_type))
      setIsSubmitted(false)
    }
  }, [selectedQuestion])

  const handleSubmit = useCallback(() => setIsSubmitted(true), [])

  const isCorrect = selectedQuestion && selectedAnswer !== null
    ? isAnswerCorrect(selectedAnswer, selectedQuestion.correct_answer, selectedQuestion.question_type, selectedQuestion.allow_unordered, selectedQuestion.unordered_blanks, selectedQuestion.case_questions)
    : null

  const questionTypeLabel = (v: string) => QUESTION_TYPE_LABELS[v] ?? v

  const hasFilters = !!(search.trim() || selectedSubject || selectedCategory || selectedType)
  const showEmpty = !initialLoading && !loading && hasFilters && questions.length === 0 && !selectedQuestion

  return (
    <div className="space-y-4">
      {/* 标题行 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/admin/questions')} title="返回题目管理">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold">
              <FlaskConical className="h-5 w-5 text-primary" />
              测试题目
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              按筛选条件检索题目并试做;编程题支持本地自测 / 平台判题。
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-fit gap-1" onClick={() => navigate('/admin/questions')}>
          <FileSearch className="size-3.5" />
          题目管理
        </Button>
      </div>

      {/* 筛选行 —— 与题目管理界面保持一致(学科/分类/题型下拉 + 关键词搜索) */}
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedSubject || t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}>
              <span className="text-muted-foreground">全部学科</span>
              {!selectedSubject && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {sortedSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                <span>{s}</span>
                {selectedSubject === s && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedCategory === '__unset__' ? '未分类' : (selectedCategory || t('questions.category'))}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}>
              <span className="text-muted-foreground">{t('questions.category')}</span>
              {!selectedCategory && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSelectedCategory('__unset__')}>
              未分类
              {selectedCategory === '__unset__' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {yearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>历年真题</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {yearCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                        <span>{c}</span>
                        {selectedCategory === c && <Check className="h-3 w-3 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {nonYearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {nonYearCategories.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                    <span>{c}</span>
                    {selectedCategory === c && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedType ? questionTypeLabel(selectedType) : t('questions.questionType')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedType('')}>
              <span className="text-muted-foreground">{t('questions.questionType')}</span>
              {!selectedType && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {QUESTION_TYPE_OPTIONS.map((qt) => (
              <DropdownMenuItem key={qt.value} onClick={() => setSelectedType(qt.value)}>
                <span>{qt.label}</span>
                {selectedType === qt.value && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (debounceRef.current !== null) clearTimeout(debounceRef.current)
              void runSearch()
            }
          }}
          placeholder="输入题目 ID 或关键词搜索(可配合上方学科/分类/题型筛选)..."
          className="pr-9 text-sm"
        />
        {search && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setSearch('')}
            title="清空"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {initialLoading ? (
        <LoadingTips compact className="py-8" />
      ) : selectedQuestion ? (
        <div className="space-y-4">
          {/* 当前试做题元信息 + 返回列表 */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
            <span className="font-mono text-muted-foreground">{selectedQuestion.id.slice(0, 8)}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{questionTypeLabel(selectedQuestion.question_type)}</Badge>
            {selectedQuestion.subject && <span className="text-muted-foreground">{selectedQuestion.subject}</span>}
            {selectedQuestion.category && <span className="text-muted-foreground">/ {selectedQuestion.category}</span>}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-6 gap-1 text-xs"
              onClick={backToList}
              disabled={!listVisible}
            >
              <RotateCcw className="size-3" />
              返回结果
            </Button>
          </div>

          <QuestionCard
            key={selectedQuestion.id}
            question={selectedQuestion}
            selectedAnswer={selectedAnswer}
            showResult={isSubmitted}
            onSelect={isSubmitted ? undefined : setSelectedAnswer}
            disabled={isSubmitted}
            allowLocalJudge
          />

          {/* 结果横幅 */}
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

          {/* 作答操作 */}
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

          {/* 答案解析 */}
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
        <div className="space-y-2">
          {loading ? (
            <LoadingTips compact className="py-8" />
          ) : listVisible && questions.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                匹配到 {questions.length >= RESULT_LIMIT ? `前 ${RESULT_LIMIT} 条` : `${questions.length} 条`},点击进入试做
              </p>
              <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border">
                {questions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => startTest(q)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors"
                  >
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">{questionTypeLabel(q.question_type)}</Badge>
                    {q.subject && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{q.subject}</span>}
                    {q.category && <span className="hidden sm:inline shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{q.category}</span>}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{q.question_text.slice(0, 120)}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          ) : showEmpty ? (
            <div className="text-center py-14 text-muted-foreground">
              <Search className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到匹配题目</p>
              <p className="text-xs mt-1 opacity-60">换个关键词,或调整上方学科 / 分类 / 题型筛选</p>
            </div>
          ) : (
            <div className="text-center py-14 text-muted-foreground">
              <Search className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">搜索题目 ID 或关键词来开始测试</p>
              <p className="text-xs mt-1 opacity-60">支持按学科、分类、题型筛选</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
