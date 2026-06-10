import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { QuestionType } from '@/types'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n/use-t'

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (questionIds: string[]) => Promise<void>
  existingIds: Set<string>
  savingIds: Set<string>
}

export function QuestionPicker({ open, onOpenChange, onAdd, existingIds, savingIds }: Props) {
  const { t } = useT()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [questions, setQuestions] = useState<Array<{ id: string; question_text: string; subject: string | null; category: string | null; categories: string[] | null; question_type: string }>>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')
  const [search, setSearch] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    updateFilteredCategories(selectedSubject)
    setSelectedCategory('')
  }, [selectedSubject, updateFilteredCategories])

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('questions').select('id, question_text, subject, category, categories, question_type', { count: 'exact' })

    if (search) query = query.ilike('question_text', `%${search}%`)
    if (selectedSubject) query = query.eq('subject', selectedSubject)
    if (selectedCategory) query = query.or(`category.eq."${selectedCategory}",categories.cs.["${selectedCategory}"]`)
    if (selectedType) query = query.eq('question_type', selectedType)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    setQuestions((data ?? []) as typeof questions)
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [page, pageSize, search, selectedSubject, selectedCategory, selectedType])

  useEffect(() => {
    if (open) { setPage(1); setSelectedIds(new Set()); fetchQuestions() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchQuestions()
  }, [page, pageSize, selectedSubject, selectedCategory, selectedType, search])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const available = questions.filter((q) => !existingIds.has(q.id))
    if (selectedIds.size >= available.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(available.map((q) => q.id)))
    }
  }

  const handleAdd = async () => {
    const toAdd = [...selectedIds].filter((id) => !existingIds.has(id))
    if (toAdd.length === 0) return
    await onAdd(toAdd)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <AlertDialogTitle>添加题目</AlertDialogTitle>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-xs" placeholder="搜索题目..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                {selectedSubject || t('questions.subject')}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem onClick={() => setSelectedSubject('')}>
                <span className="text-muted-foreground">{t('questions.subject')}</span>
                {!selectedSubject && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              {subjects.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                  {s}
                  {selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                {selectedCategory || t('questions.category')}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem onClick={() => setSelectedCategory('')}>
                <span className="text-muted-foreground">{t('questions.category')}</span>
                {!selectedCategory && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              {filteredCategories.map((c) => (
                <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                  {c}
                  {selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                {selectedType ? t(`questionTypes.${selectedType}` as any) : t('questions.questionType')}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSelectedType('')}>
                <span className="text-muted-foreground">{t('questions.questionType')}</span>
                {!selectedType && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              {QUESTION_TYPE_OPTIONS.map((o) => (
                <DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>
                  {t(`questionTypes.${o.value}` as any)}
                  {selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 overflow-auto scrollbar-visible -mx-6 px-6 mt-3">
          {loading ? (
            <Table className="table-fixed w-full min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="text-xs w-[50%]">题目</TableHead>
                  <TableHead className="text-xs w-[90px]">学科</TableHead>
                  <TableHead className="text-xs w-[120px]">分类</TableHead>
                  <TableHead className="text-xs w-[80px]">类型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(pageSize)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-3/4" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-10" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : questions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">暂无题目</p>
          ) : (
            <Table className="table-fixed w-full min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <button type="button" onClick={toggleAll} className="flex items-center">
                      <div className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.size >= questions.filter((q) => !existingIds.has(q.id)).length && questions.filter((q) => !existingIds.has(q.id)).length > 0 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                        {selectedIds.size >= questions.filter((q) => !existingIds.has(q.id)).length && questions.filter((q) => !existingIds.has(q.id)).length > 0 && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  </TableHead>
                  <TableHead className="text-xs w-[50%]">题目</TableHead>
                  <TableHead className="text-xs w-[90px]">学科</TableHead>
                  <TableHead className="text-xs w-[120px]">分类</TableHead>
                  <TableHead className="text-xs w-[80px]">类型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => {
                  const alreadyAdded = existingIds.has(q.id)
                  const selected = selectedIds.has(q.id) && !alreadyAdded
                  const saving = savingIds.has(q.id)
                  return (
                    <TableRow key={q.id} className={alreadyAdded ? 'opacity-40' : ''}>
                      <TableCell>
                        <button type="button" disabled={alreadyAdded || saving}
                          onClick={() => toggleSelect(q.id)}
                          className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${alreadyAdded || saving ? 'border-muted-foreground/20 cursor-not-allowed' : selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}>
                          {alreadyAdded ? <Check className="h-3 w-3 text-muted-foreground/40" /> : selected ? <Check className="h-3 w-3" /> : null}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs py-2 overflow-hidden text-ellipsis whitespace-nowrap">{q.question_text}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{q.subject || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const cats = (q.categories?.length ? q.categories : q.category ? [q.category] : []) as string[]
                          const yearPattern = /^\d{4}年真题$/
                          const yearCats = cats.filter((c: string) => yearPattern.test(c))
                          const otherCats = cats.filter((c: string) => !yearPattern.test(c))
                          const parts: string[] = []
                          if (yearCats.length >= 2) parts.push(`${yearCats.length}年真题`)
                          else if (yearCats.length === 1) parts.push(yearCats[0])
                          parts.push(...otherCats)
                          return parts.join('、') || '—'
                        })()}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">{QUESTION_TYPE_LABELS[q.question_type as keyof typeof QUESTION_TYPE_LABELS] || q.question_type}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  {pageSize} 条/页
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <DropdownMenuItem key={n} onClick={() => { setPageSize(n); setPage(1) }}>
                    {n} 条/页
                    {pageSize === n && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `已选 ${selectedIds.size} 道` : '未选择题目'}
            </span>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">取消</Button>
            </AlertDialogCancel>
            <Button size="sm" disabled={selectedIds.size === 0} onClick={handleAdd}>
              添加选中 ({selectedIds.size})
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
