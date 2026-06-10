import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { Check, ChevronDown } from 'lucide-react'
import type { Question, QuestionType } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { favorites, isFavorite, toggleFavorite, loaded } = useFavorites()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')), [subjects])
  const yearCategories = useMemo(() => filteredCategories.filter(c => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)), [filteredCategories])
  const nonYearCategories = useMemo(() => filteredCategories.filter(c => !/^\d{4}年真题$/.test(c)), [filteredCategories])

  useEffect(() => { updateFilteredCategories(selectedSubject) }, [selectedSubject, updateFilteredCategories])

  useEffect(() => {
    if (!loaded) return
    async function load() {
      if (favorites.length === 0) { setQuestions([]); setIsLoading(false); return }
      setIsLoading(true)
      const { data } = await supabase.from('questions').select('*').in('id', favorites)
      setQuestions((data ?? []) as Question[])
      setIsLoading(false)
    }
    load()
  }, [favorites, loaded])

  const filtered = useMemo(() => questions.filter(q => {
    if (selectedSubject && q.subject !== selectedSubject) return false
    if (selectedCategory && q.category !== selectedCategory) return false
    if (selectedType && q.question_type !== selectedType) return false
    return true
  }), [questions, selectedSubject, selectedCategory, selectedType])

  if (!loaded || isLoading) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>
        <div className="space-y-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 lg:p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-1.5"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-12 rounded-full" /></div>
              <div className="space-y-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>

      <div className="flex gap-2 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">{selectedSubject || '学科'}<ChevronDown className="h-3 w-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}><span className="text-muted-foreground">学科</span>{!selectedSubject && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {sortedSubjects.map(s => <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>{s}{selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">{selectedCategory || '分类'}<ChevronDown className="h-3 w-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}><span className="text-muted-foreground">分类</span>{!selectedCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {yearCategories.length > 0 && (
              <DropdownMenuSub><DropdownMenuSubTrigger>历年真题</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {yearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {nonYearCategories.length > 0 && (<><DropdownMenuSeparator />{nonYearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">{selectedType ? t(`questionTypes.${selectedType}` as any) : '题型'}<ChevronDown className="h-3 w-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}><span className="text-muted-foreground">题型</span>{!selectedType && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map(o => <DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>{o.label}{selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">{t('favorites.empty')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">所选条件下暂无收藏题目</p></div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q) => (
            <QuestionCard key={q.id} question={q} disabled showResult isFavorited={isFavorite(q.id)} onToggleFavorite={() => toggleFavorite(q.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
