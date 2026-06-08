import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, Globe } from 'lucide-react'
import type { UserAnswer, Question } from '@/types'
import { useT } from '@/i18n/use-t'

type NoteWithQuestion = UserAnswer & { questions: Question }

export function Component() {
  const { t } = useT()
  const [notes, setNotes] = useState<NoteWithQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userNicknames, setUserNicknames] = useState<Record<string, string>>({})

  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filteredCategories, setFilteredCategories] = useState<string[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

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

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('user_answers')
      .select('*, questions(*)')
      .eq('is_public', true)
      .order('answered_at', { ascending: false })
      .limit(50)

    const { data } = await query
    const result = (data ?? []) as NoteWithQuestion[]

    if (selectedSubject) {
      const filtered = result.filter((n) => n.questions?.subject === selectedSubject)
      setNotes(filtered)
    } else {
      setNotes(result)
    }

    // Fetch user nicknames in batch
    const userIds = [...new Set(result.map((n) => n.user_id))]
    const nicknames: Record<string, string> = {}
    await Promise.all(
      userIds.map(async (uid) => {
        const { data: prof } = await supabase.from('profiles').select('nickname').eq('id', uid).single()
        nicknames[uid] = prof?.nickname || uid.slice(0, 8) + '...'
      }),
    )
    setUserNicknames(nicknames)
    setIsLoading(false)
  }, [selectedSubject])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const displayNotes = selectedCategory
    ? notes.filter((n) => n.questions?.category === selectedCategory)
    : notes

  if (isLoading) {
    return <LoadingTips className="py-12" compact />
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">{t('notes.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {displayNotes.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('notes.noNotes')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayNotes.map((ans) => (
            <div key={ans.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {ans.questions?.subject && (
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {ans.questions.subject}
                  </span>
                )}
                {ans.questions?.category && (
                  <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {ans.questions.category}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {t('notes.author')}: {userNicknames[ans.user_id] || ans.user_id.slice(0, 8) + '...'}
                </span>
              </div>
              <p className="text-sm font-medium">{ans.questions?.question_text}</p>
              <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                {ans.note}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
