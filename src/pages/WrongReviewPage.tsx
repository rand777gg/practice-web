import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { Trash2, Pencil, Check, X, Star, ChevronDown } from 'lucide-react'
import type { UserAnswer, Question, QuestionType } from '@/types'
import { useT } from '@/i18n/use-t'
import { useFavorites } from '@/hooks/use-favorites'

type FilterMode = 'all' | 'practice' | 'exam'

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [mode, setMode] = useState<FilterMode>('all')
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')), [subjects])
  const yearCategories = useMemo(() => filteredCategories.filter(c => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)), [filteredCategories])
  const nonYearCategories = useMemo(() => filteredCategories.filter(c => !/^\d{4}年真题$/.test(c)), [filteredCategories])

  useEffect(() => { updateFilteredCategories(selectedSubject) }, [selectedSubject, updateFilteredCategories])

  const filtered = useMemo(() => answers.filter(a => {
    const q = a.questions
    if (!q) return false
    if (selectedSubject && q.subject !== selectedSubject) return false
    if (selectedCategory && q.category !== selectedCategory) return false
    if (selectedType && q.question_type !== selectedType) return false
    return true
  }), [answers, selectedSubject, selectedCategory, selectedType])

  const fetchGenRef = useRef(0)

  const fetchAnswers = useCallback(async () => {
    if (!user) return
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    setIsLoading(true)
    let query = supabase
      .from('user_answers')
      .select('*, questions(*)')
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .order('answered_at', { ascending: false })

    if (mode !== 'all') {
      query = query.eq('mode', mode)
    }

    const { data } = await query
    if (fetchGenRef.current !== myGen) return

    setAnswers((data ?? []) as (UserAnswer & { questions: Question })[])
    setIsLoading(false)
  }, [user?.id, mode])

  useEffect(() => {
    fetchAnswers()
  }, [fetchAnswers])

  const handleDelete = async (id: string) => {
    await supabase.from('user_answers').delete().eq('id', id)
    setAnswers((prev) => prev.filter((a) => a.id !== id))
  }

  const startEdit = (id: string, note: string, isPublic: boolean) => {
    setEditingNote(id)
    setEditText(note)
    setEditIsPublic(isPublic)
  }

  const cancelEdit = () => {
    setEditingNote(null)
    setEditText('')
  }

  const saveNote = async (id: string) => {
    await supabase.from('user_answers').update({ note: editText || null, is_public: editIsPublic }).eq('id', id)
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, note: editText || null, is_public: editIsPublic } : a)))
    setEditingNote(null)
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">{t('review.title')}</h1>
        <div className="flex gap-1">
          {(['all', 'practice', 'exam'] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode(m)}
              className="text-xs h-8"
            >
              {t(`review.${m}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
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

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 lg:p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <div className="space-y-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            </div>
          ))}
        </div>
      ) : answers.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t('review.noWrong')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">所选条件下无错题记录</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((ans) => (
            <div key={ans.id} className="space-y-2">
              <QuestionCard
                question={ans.questions}
                selectedAnswer={ans.selected_answer}
                showResult
                note={editingNote === ans.id ? editText : ans.note}
              />
              <div className="flex items-center gap-1 justify-end">
                {editingNote === ans.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavorite(ans.questions.id)}
                      className="text-xs h-7"
                    >
                      <Star className={isFavorite(ans.questions.id) ? 'h-3 w-3 fill-yellow-500 text-yellow-500' : 'h-3 w-3'} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => saveNote(ans.id)} className="text-xs h-7">
                      <Check className="h-3 w-3" />
                      {t('plan.save')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-xs h-7">
                      <X className="h-3 w-3" />
                      {t('plan.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavorite(ans.questions.id)}
                      className="text-xs h-7"
                    >
                      <Star className={isFavorite(ans.questions.id) ? 'h-3 w-3 fill-yellow-500 text-yellow-500' : 'h-3 w-3'} />
                      {isFavorite(ans.questions.id) ? t('favorites.remove') : t('favorites.add')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(ans.id, ans.note ?? '', ans.is_public)} className="text-xs h-7">
                      <Pencil className="h-3 w-3" />
                      {t('practice.note')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(ans.id)}
                      className="text-xs h-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('review.remove')}
                    </Button>
                  </>
                )}
              </div>
              {editingNote === ans.id && (
                <div className="space-y-2">
                  <NoteEditor
                    value={editText}
                    onChange={setEditText}
                    placeholder={t('practice.notePlaceholder')}
                    rows={3}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsPublic}
                      onChange={(e) => setEditIsPublic(e.target.checked)}
                      className="rounded"
                    />
                    {t('notes.makePublic')}
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
