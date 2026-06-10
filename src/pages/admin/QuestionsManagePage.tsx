import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
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
  const { questions, count, isLoading, page, totalPages, deleteQuestion, fetchQuestions, refetch } = useQuestions()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    await supabase.from('questions').delete().in('id', ids)
    setSelectedIds(new Set())
    setBulkDeleting(false)
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild className="ai-nav-item">
            <Link to="/admin/ai-import">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">AI 智能解析</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">{t('questions.import')}</span>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/questions/new">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">{t('questions.addQuestion')}</span>
            </Link>
          </Button>
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
            <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 py-3 bg-background border-t flex items-center justify-between gap-3 rounded-b-lg">
              <span className="text-sm text-muted-foreground">已选 <strong className="text-foreground">{selectedIds.size}</strong> 道题目</span>
              <div className="flex gap-2">
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
