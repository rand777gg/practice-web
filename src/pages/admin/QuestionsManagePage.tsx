import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestions } from '@/hooks/use-questions'
import type { QuestionType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { QuestionImportDialog } from '@/components/questions/QuestionImportDialog'
import { QuestionList } from '@/components/questions/QuestionList'
import { Upload, Plus, Check, ChevronDown, Sparkles } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { questions, count, isLoading, deleteQuestion, refetch } = useQuestions()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  // Filters
  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filteredCategories, setFilteredCategories] = useState<string[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
      setFilteredCategories([...cats].sort())
    }
    loadFilters()
  }, [])

  useEffect(() => {
    if (!selectedSubject) {
      setFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category')
          .eq('subject', selectedSubject)
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
        }
        setFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    setSelectedCategory('')
  }, [selectedSubject, categories])

  const filtered = questions.filter((q) => {
    if (!q.question_text.toLowerCase().includes(search.toLowerCase())) return false
    if (selectedSubject && q.subject !== selectedSubject) return false
    if (selectedCategory && q.category !== selectedCategory) return false
    if (selectedType && q.question_type !== selectedType) return false
    return true
  })

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">{t('questions.title')}</h1>
          <p className="text-sm text-muted-foreground">{count} {t('questions.total')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/ai-import">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">AI 导入</span>
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
            {(['single_choice', 'multi_select', 'true_false', 'fill_blank', 'short_answer', 'analysis'] as QuestionType[]).map((qt) => (
              <DropdownMenuItem key={qt} onClick={() => setSelectedType(qt)}>
                {t(`questionTypes.${qt}` as any)}
                {selectedType === qt && <Check className="h-4 w-4 ml-auto" />}
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
        <QuestionList questions={filtered} onDelete={deleteQuestion} />
      )}

      <QuestionImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refetch}
      />
    </div>
  )
}
