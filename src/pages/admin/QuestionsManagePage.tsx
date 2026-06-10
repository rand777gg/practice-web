import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestions } from '@/hooks/use-questions'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import type { QuestionType } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { QuestionImportDialog } from '@/components/questions/QuestionImportDialog'
import { QuestionList } from '@/components/questions/QuestionList'
import { Upload, Plus, Check, ChevronDown, Sparkles, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const navigate = useNavigate()
  const { questions, count, isLoading, page, totalPages, deleteQuestion, fetchQuestions, refetch } = useQuestions()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  const [expandedBtn, setExpandedBtn] = useState<number | null>(null)
  const btnRowRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (expandedBtn === null) return
    const handler = (e: MouseEvent) => {
      if (btnRowRef.current && !btnRowRef.current.contains(e.target as Node)) {
        setExpandedBtn(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expandedBtn])

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [subjects],
  )
  const yearCategories = useMemo(
    () => filteredCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)),
    [filteredCategories],
  )
  const nonYearCategories = useMemo(
    () => filteredCategories.filter((c) => !/^\d{4}年真题$/.test(c)),
    [filteredCategories],
  )

  // Trigger fetch when filters or search change
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchQuestions({
        page: 1,
        search,
        subject: selectedSubject,
        category: selectedCategory,
        questionType: selectedType,
      })
    }, 300)
    return () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current) }
  }, [search, selectedSubject, selectedCategory, selectedType, fetchQuestions])

  // Update filtered categories when subject changes
  useEffect(() => {
    updateFilteredCategories(selectedSubject)
  }, [selectedSubject, updateFilteredCategories])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === questions.length && questions.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)))
    }
  }

  const [bulkSubject, setBulkSubject] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    await supabase.from('questions').delete().in('id', ids)
    setSelectedIds(new Set())
    setBulkDeleting(false)
    refetch()
  }

  const handleBulkUpdate = async () => {
    if (!bulkSubject && !bulkCategory) return
    setBulkUpdating(true)
    const ids = [...selectedIds]
    const data: Record<string, unknown> = {}
    if (bulkSubject) data.subject = bulkSubject
    if (bulkCategory) { data.category = bulkCategory; data.categories = [bulkCategory] }
    await supabase.from('questions').update(data).in('id', ids)
    setBulkSubject('')
    setBulkCategory('')
    setSelectedIds(new Set())
    setBulkUpdating(false)
    refetch()
  }

  const clearSelection = () => setSelectedIds(new Set())

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">{t('questions.title')}</h1>
          <p className="text-sm text-muted-foreground">{count} {t('questions.total')}</p>
        </div>
        <div className="flex gap-2" ref={btnRowRef}>
          {([
            { icon: Sparkles, label: 'AI 智能解析', to: '/admin/ai-import', variant: 'outline' as const, className: 'ai-nav-item' },
            { icon: Upload, label: t('questions.import'), action: () => setShowImport(true), variant: 'outline' as const },
            { icon: Plus, label: t('questions.addQuestion'), to: '/admin/questions/new', variant: 'default' as const },
          ]).map((btn, i) => {
            const isExpanded = expandedBtn === i
            const Icon = btn.icon
            const sharedClass = `shrink-0 gap-0 transition-all duration-300 ease-out sm:px-3 sm:gap-2 ${isExpanded ? 'px-3 gap-2' : 'px-1.5'}`
            const labelSpan = (
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ease-out sm:max-w-[120px] sm:opacity-100 sm:pl-0 ${isExpanded ? 'max-w-[120px] opacity-100 pl-2' : 'max-w-0 opacity-0 pl-0'}`}>
                {btn.label}
              </span>
            )

            const handleClick = () => {
              if (window.innerWidth >= 640) {
                if ('to' in btn && btn.to) navigate(btn.to)
                else btn.action?.()
              } else if (isExpanded) {
                setExpandedBtn(null)
                if ('to' in btn && btn.to) navigate(btn.to)
                else btn.action?.()
              } else {
                setExpandedBtn(i)
              }
            }

            return (
              <Button
                key={i}
                variant={btn.variant}
                size="sm"
                className={`${sharedClass} ${btn.className ?? ''}`}
                onClick={handleClick}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {labelSpan}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedSubject || t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}>
              <span className="text-muted-foreground">学科（A-Z）</span>
              {!selectedSubject && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {sortedSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                {s}
                {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedCategory || t('questions.category')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}>
              <span className="text-muted-foreground">{t('questions.category')}</span>
              {!selectedCategory && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {yearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    历年真题
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {yearCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                        {c}
                        {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
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
                    {c}
                    {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedType ? t(`questionTypes.${selectedType}` as any) : t('questions.questionType')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}>
              <span className="text-muted-foreground">{t('questions.questionType')}</span>
              {!selectedType && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map((qt) => (
              <DropdownMenuItem key={qt.value} onClick={() => setSelectedType(qt.value)}>
                {qt.label}
                {selectedType === qt.value && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Input
        placeholder={t('questions.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-md" />)}
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <div className="flex gap-6">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-16" />)}
              </div>
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="border-b px-4 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <QuestionList
            questions={questions}
            onDelete={deleteQuestion}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
          />
          {selectedIds.size > 0 && (
            <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 py-3 bg-background border-t flex items-center justify-between gap-3 rounded-b-lg flex-wrap">
              <span className="text-sm text-muted-foreground">已选 <strong className="text-foreground">{selectedIds.size}</strong> 道题目</span>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                      {bulkSubject || '设置学科'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <DropdownMenuItem onClick={() => setBulkSubject('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!bulkSubject && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    {subjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setBulkSubject(s)}>
                        {s}
                        {bulkSubject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                      {bulkCategory || '设置分类'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <DropdownMenuItem onClick={() => setBulkCategory('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!bulkCategory && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    {filteredCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setBulkCategory(c)}>
                        {c}
                        {bulkCategory === c && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="default" size="sm" disabled={bulkUpdating || (!bulkSubject && !bulkCategory)}
                  onClick={handleBulkUpdate}>
                  {bulkUpdating ? '应用中...' : '应用'}
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>取消选择</Button>
                <Button variant="destructive" size="sm" disabled={bulkDeleting}
                  onClick={handleBulkDelete}>
                  <Trash2 className="h-4 w-4" />
                  {bulkDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
                </Button>
              </div>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => fetchQuestions({
            page: p,
            search,
            subject: selectedSubject,
            category: selectedCategory,
            questionType: selectedType,
          })} />
        </>
      )}

      <QuestionImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refetch}
      />
    </div>
  )
}
