import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useFavorites } from '@/hooks/use-favorites'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { NoteEditor } from '@/components/notes/NoteEditor'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { OPTION_LABELS } from '@/lib/constants'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { Check, ChevronDown, Lightbulb, Pencil, Star, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Question, QuestionType, CorrectAnswer } from '@/types'
import { useT } from '@/i18n/use-t'
import { Badge } from '@/components/ui/badge'
import { POINT_COLORS } from '@/components/questions/QuestionCard'

type FavWithAnswer = Question & { latest_answer: CorrectAnswer | null; answered_at: string | null; note: string | null; answer_id: string | null }

function AnswerInfo({ q, selected, t }: { q: Question; selected: CorrectAnswer | null; t: (k: string) => string }) {
  if (!selected) return <span className="text-xs text-muted-foreground">{t('common.notAnswered')}</span>
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
            </div>
          )
        })}
      </div>
    )
  }
  const ok = isAnswerCorrect(selected, correct, type, q.allow_unordered)
  return <span className={`text-xs rounded px-1.5 py-0.5 ${ok ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700'}`}>{ok ? `✓ ${t('common.correct')}` : `✗ ${t('common.wrong')}`}</span>
}

function SkeletonCard() {
  return <div className="rounded-xl border bg-card p-4 space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-16 w-full" /></div>
}

const BATCH = 20

export function Component() {
  const { t } = useT()
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { favorites, isFavorite, toggleFavorite, loaded } = useFavorites()
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [questions, setQuestions] = useState<FavWithAnswer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('')
  const [selectedKp, setSelectedKp] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const kpBySubject = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const q of questions) {
      const subj = q.subject || '其他'
      if (!map.has(subj)) map.set(subj, new Set())
      if (q.key_points) for (const k of String(q.key_points).split(/[,，;；]/)) { const t = k.trim(); if (t) map.get(subj)!.add(t) }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([s, kps]) => ({ subject: s, keyPoints: [...kps].sort((a, b) => a.localeCompare(b, 'zh-CN')) }))
  }, [questions])

  useEffect(() => { updateFilteredCategories(selectedSubject) }, [selectedSubject, updateFilteredCategories])

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')), [subjects])
  const yearCategories = useMemo(() => filteredCategories.filter(c => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)), [filteredCategories])
  const nonYearCategories = useMemo(() => filteredCategories.filter(c => !/^\d{4}年真题$/.test(c)), [filteredCategories])

  useEffect(() => {
    if (!loaded) return
    async function load() {
      if (favorites.length === 0) { setQuestions([]); setIsLoading(false); return }
      setIsLoading(true)
      const { data } = await supabase.from('questions').select('*').in('id', favorites)
      const qs = (data ?? []) as Question[]
      const qMap = new Map(qs.map(q => [q.id, q]))
      // Get latest answer for each question
      const { data: answers } = await supabase.from('user_answers').select('question_id, selected_answer, is_correct, answered_at, note, id').in('question_id', favorites).order('answered_at', { ascending: false })
      const latestAnswer = new Map<string, { selected_answer: CorrectAnswer; is_correct: boolean; answered_at: string; note: string | null; id: string }>()
      for (const a of (answers ?? [])) {
        if (!latestAnswer.has(a.question_id)) latestAnswer.set(a.question_id, { selected_answer: a.selected_answer, is_correct: a.is_correct, answered_at: a.answered_at, note: a.note, id: a.id })
      }
      const merged: FavWithAnswer[] = favorites.map(id => {
        const q = qMap.get(id)
        const la = latestAnswer.get(id)
        return q ? { ...q, latest_answer: la?.selected_answer ?? null, answered_at: la?.answered_at ?? null, note: la?.note ?? null, answer_id: la?.id ?? null } : null
      }).filter(Boolean) as FavWithAnswer[]
      setQuestions(merged)
      setIsLoading(false)
    }
    load()
  }, [favorites, loaded])

  const filtered = useMemo(() => questions.filter(q => {
    if (selectedSubject && q.subject !== selectedSubject) return false
    if (selectedCategory && !(q.categories?.includes(selectedCategory) || q.category === selectedCategory)) return false
    if (selectedType && q.question_type !== selectedType) return false
    if (selectedKp && !(q.key_points || '').includes(selectedKp)) return false
    return true
  }), [questions, selectedSubject, selectedCategory, selectedType, selectedKp])

  // IntersectionObserver lazy load
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || visibleCount >= filtered.length) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisibleCount(p => Math.min(p + BATCH, filtered.length)) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visibleCount, filtered.length])

  const visible = filtered.slice(0, visibleCount)

  const handleSaveNote = useCallback(async (questionId: string, answerId: string | null) => {
    if (!answerId) return
    await supabase.from('user_answers').update({ note: editText }).eq('id', answerId)
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, note: editText } : q))
    setEditingId(null)
  }, [editText])

  if (!loaded || isLoading) {
    return (
      <div>
        <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>
        <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl lg:text-2xl font-bold mb-4">{t('favorites.title')}</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedSubject || t('questions.subject')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}><span className="text-muted-foreground">不限学科</span>{!selectedSubject && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {sortedSubjects.map(s => <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>{s}{selectedSubject === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedCategory || t('questions.category')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}><span className="text-muted-foreground">不限分类</span>{!selectedCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {yearCategories.length > 0 && <DropdownMenuSub><DropdownMenuSubTrigger>历年真题</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-64 overflow-y-auto">{yearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>}
            {nonYearCategories.length > 0 && (<><DropdownMenuSeparator />{nonYearCategories.map(c => <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>{c}{selectedCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}</>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedType ? t(`questionTypes.${selectedType}` as any) : '题型'}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}><span className="text-muted-foreground">不限题型</span>{!selectedType && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map(o => <DropdownMenuItem key={o.value} onClick={() => setSelectedType(o.value)}>{o.label}{selectedType === o.value && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{selectedKp || t('practice.keyPoint')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedKp('')}><span className="text-muted-foreground">不限知识点</span>{!selectedKp && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
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

      {questions.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">{t('favorites.empty')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12"><p className="text-muted-foreground">t('favorites.noFilter')</p></div>
      ) : (
        <div className="space-y-3">
          {visible.map((q) => (
            <div key={q.id} className="rounded-xl border bg-card grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-0 overflow-hidden">
              <div className="p-4 space-y-2 min-w-0">
                <div className="flex flex-wrap gap-1">
                  {q.subject && <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{q.subject}</span>}
                  {q.categories?.length ? q.categories.map((cat: string) => <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>) : null}
                  {q.key_points && String(q.key_points).split(/[,，;；]/).filter(Boolean).map((kp, i) => (
                    <Badge key={i} variant="secondary" className={POINT_COLORS[i % POINT_COLORS.length]}>{kp.trim()}</Badge>
                  ))}
                </div>
                <p className="text-sm font-medium leading-relaxed">{q.question_text}</p>
                <AnswerInfo q={q} selected={q.latest_answer} t={t} />
                {q.answered_at && <span className="text-xs text-muted-foreground">{new Date(q.answered_at).toLocaleDateString()}</span>}
              </div>
              <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden max-h-[400px]">
                <div className="flex-1 overflow-auto">
                  {analysisId === q.id && (q.analysis || q.answer_explanation) && (
                    <div className="p-3 border-b bg-amber-50/50 dark:bg-amber-950/20 text-sm leading-relaxed space-y-2">
                      {q.analysis && <MarkdownRenderer content={q.analysis} />}
                      {q.answer_explanation && <div className="pt-2 border-t text-xs text-muted-foreground"><MarkdownRenderer content={q.answer_explanation} /></div>}
                    </div>
                  )}
                  {editingId === q.id ? (
                    <div className="p-3"><NoteEditor value={editText} onChange={setEditText} placeholder={t("common.addNote")} /></div>
                  ) : (
                    <div className="p-4 h-full">
                      {q.note ? <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed"><MarkdownRenderer content={q.note} /></div>
                        : <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{t('common.noNote')}</div>}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 px-3 pb-3 pt-1 shrink-0 justify-end">
                  {(q.analysis || q.answer_explanation) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAnalysisId(analysisId === q.id ? null : q.id)} title={t("common.viewExplanation")}>
                      <Lightbulb className={cn('h-3.5 w-3.5', analysisId === q.id ? 'text-amber-500' : '')} />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleFavorite(q.id)}>
                    <Star className={cn('h-3.5 w-3.5', isFavorite(q.id) ? 'fill-amber-400 text-amber-400' : '')} />
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={`/admin/questions/${q.id}/edit?from=/favorites`}><Pencil className="h-3.5 w-3.5" /></Link>
                    </Button>
                  )}
                  {editingId === q.id ? (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /> {t('common.cancel')}</Button>
                      <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleSaveNote(q.id, q.answer_id)}><Check className="h-3.5 w-3.5" /> {t('common.save')}</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditText(q.note || ''); setEditingId(q.id) }}><Pencil className="h-3.5 w-3.5" /> {t('common.note')}</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visibleCount < filtered.length && <div ref={sentinelRef} className="h-4" />}
          {visibleCount < filtered.length && <p className="text-center text-xs text-muted-foreground">{visibleCount}/{filtered.length} </p>}
        </div>
      )}
    </div>
  )
}
