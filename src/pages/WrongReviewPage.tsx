import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { NoteEditor } from '@/components/notes/NoteEditor'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { QUESTION_TYPE_OPTIONS, OPTION_LABELS } from '@/lib/constants'

import { Trash2, Lightbulb, Pencil, Check, X, Star, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { UserAnswer, Question, QuestionType, CorrectAnswer } from '@/types'
import { useT } from '@/i18n/use-t'
import { useFavorites } from '@/hooks/use-favorites'
import { Badge } from '@/components/ui/badge'
import { POINT_COLORS } from '@/components/questions/QuestionCard'

type WrongWithQuestion = UserAnswer & { questions: Question }

function AnswerInfo({ q, selected, t }: { q: Question; selected: CorrectAnswer; t: (k: string) => string }) {
  const type = q.question_type
  const correct = q.correct_answer
  const isChoice = type === 'single_choice' || type === 'multi_select'
  if (isChoice && q.options.length > 0) {
    return (
      <div className="text-xs space-y-0.5">
        {q.options.map((opt, i) => {
          const isC = type === 'single_choice' ? correct === i : Array.isArray(correct) && (correct as number[]).includes(i)
          const isS = type === 'single_choice' ? selected === i : Array.isArray(selected) && (selected as number[]).includes(i)
          return (
            <div key={i} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${isC ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : isS && !isC ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
              <span className="w-4 shrink-0 font-medium text-[10px]">{OPTION_LABELS[i]}</span><span className="truncate">{opt}</span>
              {isC && <span className="ml-auto text-[10px] shrink-0">&#10003;</span>}
              {isS && !isC && <span className="ml-auto text-[10px] shrink-0">&#10007;</span>}
            </div>
          )
        })}
      </div>
    )
  }
  if (type === 'true_false') {
    return (
      <div className="text-xs space-y-0.5">
        <div className={`rounded px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300`}>{t('common.yourAnswer')}{selected ? t('common.true') : t('common.false')} ✗</div>
        <div className="rounded px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">{t('common.correctAnswer')}{correct ? t('common.true') : t('common.false')}</div>
      </div>
    )
  }
  return (
    <div className="text-xs space-y-0.5">
      <div className="rounded px-1.5 py-0.5 bg-muted/50"><span className="text-muted-foreground">{t('common.answer')}</span>{Array.isArray(correct) ? (correct as string[]).join('；') || t('common.noAnswer') : String(correct ?? t('common.noAnswer'))}</div>
      <div className="rounded px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"><span className="text-muted-foreground">{t('common.yourAnswer')}</span>{Array.isArray(selected) ? (selected as string[]).join('；') || t('common.noAnswer') : String(selected ?? t('common.noAnswer'))} ✗</div>
    </div>
  )
}

function SkeletonCard() {
  return <div className="rounded-xl border bg-card p-4 space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-16 w-full" /></div>
}

type FilterMode = 'all' | 'practice' | 'exam'
const BATCH = 20

export function Component() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const { isFavorite, toggleFavorite } = useFavorites()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [mode, setMode] = useState<FilterMode>('all')
  const [answers, setAnswers] = useState<WrongWithQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')
  const [selectedKp, setSelectedKp] = useState('')
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')), [subjects])
  const yearCategories = useMemo(() => filteredCategories.filter(c => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)), [filteredCategories])
  const nonYearCategories = useMemo(() => filteredCategories.filter(c => !/^\d{4}年真题$/.test(c)), [filteredCategories])
  const kpBySubject = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const a of answers) {
      const q = a.questions
      if (!q) continue
      const subj = q.subject || '其他'
      if (!map.has(subj)) map.set(subj, new Set())
      if (q.key_points) for (const k of String(q.key_points).split(/[,，;；]/)) { const t = k.trim(); if (t) map.get(subj)!.add(t) }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([s, kps]) => ({ subject: s, keyPoints: [...kps].sort((a, b) => a.localeCompare(b, 'zh-CN')) }))
  }, [answers])

  useEffect(() => { updateFilteredCategories(selectedSubject) }, [selectedSubject, updateFilteredCategories])

  const filtered = useMemo(() => answers.filter(a => {
    const q = a.questions
    if (!q) return false
    if (selectedSubject && q.subject !== selectedSubject) return false
    if (selectedCategory && !(q.categories?.includes(selectedCategory) || q.category === selectedCategory)) return false
    if (selectedType && q.question_type !== selectedType) return false
    if (selectedKp && !(q.key_points || '').includes(selectedKp)) return false
    return true
  }), [answers, selectedSubject, selectedCategory, selectedType, selectedKp])

  const fetchGenRef = useRef(0)

  const fetchAnswers = useCallback(async () => {
    if (!user) return
    fetchGenRef.current++
    const myGen = fetchGenRef.current
    setIsLoading(true)
    let query = supabase.from('user_answers').select('*, questions(*)').eq('user_id', user.id).eq('is_correct', false).order('answered_at', { ascending: false }).limit(200)
    if (mode !== 'all') query = query.eq('mode', mode)
    const { data } = await query
    if (fetchGenRef.current !== myGen) return
    setAnswers((data ?? []) as WrongWithQuestion[])
    setIsLoading(false)
  }, [user, mode])

  useEffect(() => { fetchAnswers() }, [fetchAnswers])

  const handleDelete = async (id: string) => {
    await supabase.from('user_answers').delete().eq('id', id)
    setAnswers(prev => prev.filter(a => a.id !== id))
  }

  const handleSaveNote = async (id: string) => {
    await supabase.from('user_answers').update({ note: editText }).eq('id', id)
    setAnswers(prev => prev.map(a => a.id === id ? { ...a, note: editText } : a))
    setEditingId(null)
  }

  // IntersectionObserver lazy load
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || visibleCount >= filtered.length) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisibleCount(p => Math.min(p + BATCH, filtered.length)) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, filtered.length])

  useEffect(() => { setVisibleCount(BATCH) }, [selectedSubject, selectedCategory, selectedType, selectedKp, mode])

  const visible = filtered.slice(0, visibleCount)

  if (isLoading) {
    return (
      <div>
        <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('nav.wrongReview')}</h1>
        <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl lg:text-2xl font-bold mb-4">{t('nav.wrongReview')}</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant={mode === 'all' ? 'default' : 'outline'} size="sm" className="gap-1 text-xs">{mode === 'all' ? t('review.all') : mode === 'practice' ? t('review.practice') : t('review.exam')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setMode('all')}>{t('review.all')}{ mode === 'all' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode('practice')}>{t('review.practice')}{ mode === 'practice' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode('exam')}>{t('review.exam')}{ mode === 'exam' && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedSubject || t('questions.subject')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}><span className="text-muted-foreground">{t('common.noFilterSubject')}</span>{!selectedSubject && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {sortedSubjects.map(s => <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>{s}{selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedCategory || t('questions.category')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}><span className="text-muted-foreground">{t('common.noFilterCategory')}</span>{!selectedCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {yearCategories.length > 0 && <DropdownMenuSub><DropdownMenuSubTrigger>{t('common.pastExams')}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{yearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>}
            {nonYearCategories.length > 0 && (<><DropdownMenuSeparator />{nonYearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedType ? t(`questionTypes.${selectedType}` as any) : t('questions.questionType')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}><span className="text-muted-foreground">{t('common.noFilterType')}</span>{!selectedType && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map(o => <DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>{o.label}{selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedKp || t('practice.keyPoint')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedKp('')}><span className="text-muted-foreground">{t('common.noFilterPoint')}</span>{!selectedKp && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {kpBySubject.map(({ subject, keyPoints }) => (
              <DropdownMenuSub key={subject}>
                <DropdownMenuSubTrigger className="text-xs">{subject}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {keyPoints.map(k => <DropdownMenuItem key={k} onClick={() => setSelectedKp(k)}>{k}{selectedKp === k && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {answers.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">{t('review.noWrongYet')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">{t('review.noWrongFilter')}</p></div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const q = a.questions
            const fav = isFavorite(a.question_id)
            if (!q) return null
            return (
              <div key={a.id} className="rounded-xl border bg-card grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-0 overflow-hidden">
                <div className="p-4 space-y-2 min-w-0">
                  <div className="flex flex-wrap gap-1">
                    {q.subject && <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{q.subject}</span>}
                    {q.categories?.length ? q.categories.map((cat: string) => <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>) : null}
                    {q.key_points && String(q.key_points).split(/[,，;；]/).filter(Boolean).map((kp, i) => (
  <Badge key={i} variant="secondary" className={POINT_COLORS[i % POINT_COLORS.length]}>{kp.trim()}</Badge>
))}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                  <AnswerInfo q={q} selected={a.selected_answer} t={t} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn('rounded-full px-1.5 py-0.5 text-xs', a.mode === 'exam' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700')}>{a.mode === 'exam' ? t('review.exam') : t('review.practice')}</span>
                    <span>{new Date(a.answered_at).toLocaleDateString()}</span>
                    <Link to={`/practice`} className="text-primary hover:underline ml-auto">{t('review.goPractice')}</Link>
                  </div>
                </div>
                <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden max-h-[400px]">
                  <div className="flex-1 overflow-auto">
                    {analysisId === a.id && (q.analysis || q.answer_explanation) && (
                      <div className="p-3 border-b bg-amber-50/50 dark:bg-amber-950/20 text-sm leading-relaxed space-y-2">
                        {q.analysis && <MarkdownRenderer content={q.analysis} />}
                        {q.answer_explanation && <div className="pt-2 border-t text-xs text-muted-foreground"><MarkdownRenderer content={q.answer_explanation} /></div>}
                      </div>
                    )}
                    {editingId === a.id ? (
                      <div className="p-3"><NoteEditor value={editText} onChange={setEditText} placeholder={t('common.addNote')} /></div>
                    ) : (
                      <div className="p-4 h-full">
                        {a.note ? <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed"><MarkdownRenderer content={a.note} /></div>
                          : <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{t('common.noNote')}</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 px-3 pb-3 pt-1 shrink-0 justify-end">
                    {(q.analysis || q.answer_explanation) && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAnalysisId(analysisId === a.id ? null : a.id)} title={t('common.viewExplanation')}>
                        <Lightbulb className={cn('h-3.5 w-3.5', analysisId === a.id ? 'text-amber-500' : '')} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleFavorite(a.question_id)}>
                      <Star className={cn('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : '')} />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <Link to={`/admin/questions/${a.question_id}/edit?from=/review`}><Pencil className="h-3.5 w-3.5" /></Link>
                      </Button>
                    )}
                    {editingId === a.id ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /> {t('common.cancel')}</Button>
                        <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleSaveNote(a.id)}><Check className="h-3.5 w-3.5" /> {t('common.save')}</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditText(a.note || ''); setEditingId(a.id) }}><Pencil className="h-3.5 w-3.5" /> {t('common.note')}</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
          {visibleCount < filtered.length && <p className="text-center text-xs text-muted-foreground">{visibleCount}/{filtered.length} </p>}
        </div>
      )}
    </div>
  )
}
