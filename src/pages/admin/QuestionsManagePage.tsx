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
import { LoadingTips } from '@/components/layout/LoadingTips'
import { QuestionImportDialog } from '@/components/questions/QuestionImportDialog'
import { QuestionList } from '@/components/questions/QuestionList'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Upload, Plus, Check, ChevronDown, Sparkles, ListOrdered } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { questions, count, isLoading, page, totalPages, deleteQuestion, fetchQuestions, refetch } = useQuestions()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showRenumber, setShowRenumber] = useState(false)
  const [renumberSubject, setRenumberSubject] = useState('')
  const [renumbering, setRenumbering] = useState(false)
  const [renumberMsg, setRenumberMsg] = useState('')
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
          <Button variant="outline" size="sm" onClick={() => { setRenumberSubject(selectedSubject || ''); setRenumberMsg(''); setShowRenumber(true) }}>
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">编号</span>
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
        <LoadingTips className="py-12" compact />
      ) : (
        <>
          <QuestionList questions={questions} onDelete={deleteQuestion} />
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

      <AlertDialog open={showRenumber} onOpenChange={setShowRenumber}>
        <AlertDialogContent>
          <AlertDialogTitle>重新编号</AlertDialogTitle>
          <AlertDialogDescription>
            为指定学科的题目按创建时间顺序添加序号（如 "1. ", "2. "）。已有序号的会被替换。
          </AlertDialogDescription>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">学科</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs w-full justify-between">
                    {renumberSubject || '选择学科'}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                  {subjects.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setRenumberSubject(s)}>
                      {s}
                      {renumberSubject === s && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {renumberMsg && (
              <div className="rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-300">{renumberMsg}</div>
            )}
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel asChild>
                <Button variant="outline" size="sm" disabled={renumbering}>取消</Button>
              </AlertDialogCancel>
              <Button size="sm" disabled={!renumberSubject || renumbering}
                onClick={async () => {
                  setRenumbering(true)
                  setRenumberMsg('')
                  try {
                    const { data } = await supabase.from('questions')
                      .select('id, question_text').eq('subject', renumberSubject)
                      .order('created_at', { ascending: true })
                    if (!data || data.length === 0) {
                      setRenumberMsg('该学科没有题目'); setRenumbering(false); return
                    }
                    let count = 0
                    for (let i = 0; i < data.length; i++) {
                      const q = data[i]
                      const newText = `${i + 1}. ${(q.question_text as string).replace(/^\d+\.\s*/, '')}`
                      if (newText !== q.question_text) {
                        await supabase.from('questions').update({ question_text: newText }).eq('id', q.id)
                        count++
                      }
                    }
                    setRenumberMsg(`已更新 ${count} 道题目`)
                    refetch()
                  } catch { setRenumberMsg('编号失败') }
                  setRenumbering(false)
                }}>
                {renumbering ? '编号中...' : '开始编号'}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
