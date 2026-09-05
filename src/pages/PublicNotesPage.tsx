import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
 DropdownMenu,
 DropdownMenuTrigger,
 DropdownMenuContent,
 DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import {
 AlertDialog,
 AlertDialogContent,
 AlertDialogTitle,
 AlertDialogDescription,
 AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
 Check, ChevronDown, Globe, Lock, Pencil, Trash2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { OPTION_LABELS } from '@/lib/constants'
import type { UserAnswer, Question, QuestionType, CorrectAnswer } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

type NoteWithQuestion = UserAnswer & { questions: Question }

// ── NoteCard (defined outside to prevent remounting) ──────────────────
interface NoteCardProps {
 note: NoteWithQuestion
 showAuthor?: boolean
 style: 'my' | 'public'
 editingNoteId: string | null
 editText: string
 userNicknames: Record<string, string>
 onEditText: (v: string) => void
 onStartEdit: (note: NoteWithQuestion) => void
 onCancelEdit: () => void
 onSaveEdit: (noteId: string) => void
 onTogglePublic: (note: NoteWithQuestion) => void
 onDeleteRequest: (noteId: string) => void
}

function AnswerInfo({ q, selected }: { q: Question; selected: CorrectAnswer }) {
 const type = q.question_type
 const correct = q.correct_answer
 const isChoice = type === 'single_choice' || type === 'multi_select'
 if (isChoice && q.options.length > 0) {
  return (
   <div className="text-xs space-y-0.5">
    {q.options.map((opt, i) => {
     const isCorrect = type === 'single_choice' ? correct === i : Array.isArray(correct) && (correct as number[]).includes(i)
     const isSelected = type === 'single_choice' ? selected === i : Array.isArray(selected) && (selected as number[]).includes(i)
     return (
      <div key={i} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${
       isCorrect ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
       isSelected && !isCorrect ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
       'text-muted-foreground'
      }`}>
       <span className="w-4 shrink-0 font-medium text-[10px]">{OPTION_LABELS[i]}</span>
       <span className="truncate">{opt}</span>
       {isCorrect && <span className="ml-auto text-[10px] shrink-0">✓</span>}
       {isSelected && !isCorrect && <span className="ml-auto text-[10px] shrink-0">✗</span>}
      </div>
     )
    })}
   </div>
  )
 }
 if (type === 'true_false') {
  const userAns = selected ? '正确' : '错误'
  const realAns = correct ? '正确' : '错误'
  const ok = selected === correct
  return (
   <div className="text-xs space-y-0.5">
    <div className={`rounded px-1.5 py-0.5 ${ok ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
     你的答案：{userAns} {ok ? '✓' : '✗'}
    </div>
    {!ok && <div className="rounded px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">正确答案：{realAns}</div>}
   </div>
  )
 }
 return (
  <div className="text-xs space-y-0.5">
   <div className="rounded px-1.5 py-0.5 bg-muted/50">
    <span className="text-muted-foreground">答案：</span>
    {Array.isArray(correct) ? (correct as string[]).join('；') || '（无）' : String(correct ?? '（无）')}
   </div>
   <div className={`rounded px-1.5 py-0.5 ${isAnswerCorrect(selected, correct, type, q.allow_unordered, q.unordered_blanks, q.case_questions) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
    <span className="text-muted-foreground">你的答案：</span>
    {Array.isArray(selected) ? (selected as string[]).join('；') || '（无）' : String(selected ?? '（无）')}
    {' '}{isAnswerCorrect(selected, correct, type, q.allow_unordered, q.unordered_blanks, q.case_questions) ? '✓' : '✗'}
   </div>
  </div>
 )
}

function NoteCard({
 note, showAuthor, style,
 editingNoteId, editText, userNicknames,
 onEditText, onStartEdit, onCancelEdit, onSaveEdit,
 onTogglePublic, onDeleteRequest,
}: NoteCardProps) {
 const { t } = useT()
 const isEditing = style === 'my' && editingNoteId === note.id

 return (
  <div className={cn(
   'rounded-xl border bg-card grid gap-0 transition-all duration-500 ease-in-out overflow-hidden',
   isEditing ? 'lg:grid-cols-[1fr]' : 'lg:grid-cols-[1fr_1.2fr]',
   'grid-cols-1',
  )}>
   {/* ── Left: Question info ─────────────────────────────────── */}
   <div className="p-4 space-y-2 min-w-0">
    {note.questions?.subject && (
     <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
      {note.questions.subject}
     </span>
    )}
    {(note.questions?.categories?.length ? note.questions.categories : note.questions?.category ? [note.questions.category] : []).map((cat: string) => (
     <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground ml-1.5">
      {cat}
     </span>
    ))}

    <div className="text-sm font-medium leading-relaxed">
     {note.questions?.question_text
      ? <MarkdownRenderer content={note.questions.question_text} className="[&_p]:my-0" />
      : t('notes.untitled')}
    </div>

    {note.questions && (
     <AnswerInfo q={note.questions} selected={note.selected_answer} />
    )}

    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
     <span className={note.is_public
      ? 'inline-flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
      : 'inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
     }>
      {note.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {note.is_public ? t('notes.publicLabel') : t('notes.privateLabel')}
     </span>
     {showAuthor && (
      <span>{t('notes.author')}: {userNicknames[note.user_id] || t('notes.anonymous')}</span>
     )}
     <span>{new Date(note.answered_at).toLocaleDateString()}</span>
    </div>
   </div>

   {/* ── Right: Preview / Editor ──────────────────────────────── */}
   <div className={cn(
    'border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden transition-all duration-500 ease-in-out',
    isEditing ? 'max-h-[800px]' : 'max-h-[400px]',
   )}>
    <div className="flex-1 overflow-auto transition-all duration-500 ease-in-out">
     {isEditing ? (
      <div className="p-3">
       <NoteEditor value={editText} onChange={onEditText} placeholder={t('practice.notePlaceholder')} />
      </div>
     ) : (
      <div className="p-4 h-full">
       {note.note ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
         <MarkdownRenderer content={note.note} />
        </div>
       ) : (
        <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
         {t('notes.noNote')}
        </div>
       )}
      </div>
     )}
    </div>

    {/* Action buttons — fixed at bottom, right-aligned */}
    <div className="flex gap-1 px-3 pb-3 pt-1 shrink-0 justify-end">
     {isEditing ? (
      <>
       <Button variant="ghost" size="sm" onClick={onCancelEdit} className="text-xs h-7">
        <X className="h-3 w-3 mr-1" />{t('plan.cancel')}
       </Button>
       <Button variant="default" size="sm" onClick={() => onSaveEdit(note.id)} className="text-xs h-7">
        <Check className="h-3 w-3 mr-1" />{t('plan.save')}
       </Button>
      </>
     ) : style === 'my' && (
      <>
       <Button variant="ghost" size="sm" onClick={() => onTogglePublic(note)} className="text-xs h-7">
        {note.is_public ? <Lock className="h-3 w-3 mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
        {note.is_public ? t('notes.setPrivate') : t('notes.setPublic')}
       </Button>
       <Button variant="ghost" size="sm" onClick={() => onStartEdit(note)} className="text-xs h-7">
        <Pencil className="h-3 w-3 mr-1" />{t('practice.note')}
       </Button>
       <Button variant="ghost" size="sm" onClick={() => onDeleteRequest(note.id)} className="text-xs h-7 text-destructive hover:text-destructive">
        <Trash2 className="h-3 w-3 mr-1" />{t('notes.delete')}
       </Button>
      </>
     )}
    </div>
   </div>
  </div>
 )
}

// ── Main Component ─────────────────────────────────────────────────
export function Component() {
 const { t } = useT()
 const { user } = useAuthStore()
 const [activeTab, setActiveTab] = useState('my')

 const [subjects, setSubjects] = useState<string[]>([])
 const [categories, setCategories] = useState<string[]>([])

 const [pubFilteredCategories, setPubFilteredCategories] = useState<string[]>([])
 const [pubSubject, setPubSubject] = useState('')
 const [pubCategory, setPubCategory] = useState('')

 const [myNotes, setMyNotes] = useState<NoteWithQuestion[]>([])
 const [myNotesLoading, setMyNotesLoading] = useState(true)
 const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
 const [editText, setEditText] = useState('')
 const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)

 const [myVisibility, setMyVisibility] = useState<'all' | 'public' | 'private'>('all')
 const [mySubject, setMySubject] = useState('')
 const [myCategory, setMyCategory] = useState('')
 const [myType, setMyType] = useState<QuestionType | ''>('')
 const [myFilteredCategories, setMyFilteredCategories] = useState<string[]>([])

 const [publicNotes, setPublicNotes] = useState<NoteWithQuestion[]>([])
 const [publicNotesLoading, setPublicNotesLoading] = useState(true)
 const [userNicknames, setUserNicknames] = useState<Record<string, string>>({})

 useEffect(() => {
  async function loadFilters() {
   const { data } = await supabase.from('questions').select('subject, category, categories')
   const subs = new Set<string>()
   const cats = new Set<string>()
   for (const row of data ?? []) {
    if (row.subject) subs.add(row.subject)
    if (row.category) cats.add(row.category)
    if (row.categories) for (const c of row.categories as string[]) { if (c) cats.add(c) }
   }
   setSubjects([...subs].sort())
   setCategories([...cats].sort())
   setPubFilteredCategories([...cats].sort())
   setMyFilteredCategories([...cats].sort())
  }
  loadFilters()
 }, [])

 useEffect(() => {
  let cancelled = false
  if (!pubSubject) { setPubFilteredCategories(categories); return }
  const load = async () => {
   const { data } = await supabase.from('questions').select('category, categories').eq('subject', pubSubject)
   if (cancelled) return
   const cats = new Set<string>()
   for (const row of data ?? []) {
    if (row.category) cats.add(row.category)
    if (row.categories) for (const c of row.categories as string[]) { if (c) cats.add(c) }
   }
   setPubFilteredCategories([...cats].sort())
  }
  setPubCategory('')
  load()
  return () => { cancelled = true }
 }, [pubSubject, categories])

 useEffect(() => {
  let cancelled = false
  if (!mySubject) { setMyFilteredCategories(categories); return }
  const load = async () => {
   const { data } = await supabase.from('questions').select('category, categories').eq('subject', mySubject)
   if (cancelled) return
   const cats = new Set<string>()
   for (const row of data ?? []) {
    if (row.category) cats.add(row.category)
    if (row.categories) for (const c of row.categories as string[]) { if (c) cats.add(c) }
   }
   setMyFilteredCategories([...cats].sort())
  }
  setMyCategory('')
  load()
  return () => { cancelled = true }
 }, [mySubject, categories])

 // ── My Notes ─────────────────
 const myGenRef = useRef(0)
 const fetchMyNotes = useCallback(async () => {
  if (!user) return
  myGenRef.current++
  const gen = myGenRef.current
  setMyNotesLoading(true)
  const { data } = await supabase.from('user_answers')
   .select('*, questions(*)').eq('user_id', user.id).not('note', 'is', null)
   .order('answered_at', { ascending: false }).limit(100)
  if (myGenRef.current !== gen) return
  setMyNotes((data ?? []) as NoteWithQuestion[])
  setMyNotesLoading(false)
 }, [user?.id])

 useEffect(() => { if (activeTab === 'my') fetchMyNotes() }, [activeTab, fetchMyNotes])

 const handleTogglePublic = async (note: NoteWithQuestion) => {
  const next = !note.is_public
  await supabase.from('user_answers').update({ is_public: next }).eq('id', note.id)
  setMyNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_public: next } : n)))
 }
 const handleStartEdit = (note: NoteWithQuestion) => { setEditingNoteId(note.id); setEditText(note.note ?? '') }
 const handleSaveEdit = async (noteId: string) => {
  await supabase.from('user_answers').update({ note: editText || null }).eq('id', noteId)
  setMyNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, note: editText || null } : n)))
  setEditingNoteId(null)
 }
 const handleDelete = async (noteId: string) => {
  await supabase.from('user_answers').update({ note: null, is_public: false }).eq('id', noteId)
  setMyNotes((prev) => prev.filter((n) => n.id !== noteId))
  setDeleteNoteId(null)
 }

 // ── Public Notes ─────────────
 const pubGenRef = useRef(0)
 const fetchPublicNotes = useCallback(async () => {
  pubGenRef.current++
  const gen = pubGenRef.current
  setPublicNotesLoading(true)
  let q = supabase.from('user_answers').select('*, questions(*)').eq('is_public', true)
   .order('answered_at', { ascending: false }).limit(50)
  const { data } = await q
  if (pubGenRef.current !== gen) return
  const result = (data ?? []) as NoteWithQuestion[]
  const filtered = pubSubject ? result.filter((n) => n.questions?.subject === pubSubject) : result
  const userIds = [...new Set(result.map((n) => n.user_id))]
  const nicknames: Record<string, string> = {}
  if (userIds.length > 0) {
   const { data: profiles } = await supabase.rpc('get_profile_nicknames', { user_ids: userIds })
   for (const p of (profiles ?? []) as { id: string; nickname: string | null }[]) {
    nicknames[p.id] = p.nickname || `用户${p.id.slice(0, 6)}`
   }
   for (const uid of userIds) { if (!nicknames[uid]) nicknames[uid] = `用户${uid.slice(0, 6)}` }
  }
  if (pubGenRef.current !== gen) return
  setPublicNotes(filtered)
  setUserNicknames(nicknames)
  setPublicNotesLoading(false)
 }, [pubSubject])

 useEffect(() => { if (activeTab === 'public') fetchPublicNotes() }, [activeTab, fetchPublicNotes])

 const handleTabChange = (v: string) => { if (v !== activeTab) setActiveTab(v) }

 return (
  <div className="space-y-4">
   <Tabs value={activeTab} onValueChange={handleTabChange}>
    <TabsList>
     <TabsTrigger value="my">{t('notes.tabMy')}</TabsTrigger>
     <TabsTrigger value="public">{t('notes.tabPublic')}</TabsTrigger>
    </TabsList>

    <TabsContent value="public" className="space-y-4">
     <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
       <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs">{pubSubject || t('questions.subject')}<ChevronDown className="h-3 w-3" /></Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => setPubSubject('')}><span className="text-muted-foreground">{t('questions.subject')}</span>{!pubSubject && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
        {subjects.map((s) => (<DropdownMenuItem key={s} onClick={() => setPubSubject(s)}>{s}{pubSubject === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
       </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
       <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs">{pubCategory || t('questions.category')}<ChevronDown className="h-3 w-3" /></Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => setPubCategory('')}><span className="text-muted-foreground">{t('questions.category')}</span>{!pubCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
        {pubFilteredCategories.map((c) => (<DropdownMenuItem key={c} onClick={() => setPubCategory(c)}>{c}{pubCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
       </DropdownMenuContent>
      </DropdownMenu>
     </div>
     {publicNotesLoading ? (
      <div className="space-y-3">{[...Array(3)].map((_, i) => (<div key={i} className="rounded-xl border p-4 space-y-3"><div className="flex gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-16 w-full rounded-lg" /></div>))}</div>
     ) : publicNotes.length === 0 ? (
      <div className="text-center py-12"><Globe className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">{t('notes.noNotes')}</p></div>
     ) : (
      <div className="space-y-3">
       {publicNotes.filter((n) => !pubCategory || n.questions?.category === pubCategory || (n.questions?.categories as string[])?.includes(pubCategory))
        .map((note) => <NoteCard key={note.id} note={note} showAuthor style="public" editingNoteId={editingNoteId} editText={editText} userNicknames={userNicknames}
       onEditText={setEditText} onStartEdit={handleStartEdit} onCancelEdit={() => { setEditingNoteId(null); setEditText('') }}
       onSaveEdit={handleSaveEdit} onTogglePublic={handleTogglePublic} onDeleteRequest={setDeleteNoteId} />)}
      </div>
     )}
    </TabsContent>

    <TabsContent value="my" className="space-y-4">
     <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-input bg-background">
       {(['all', 'public', 'private'] as const).map((v) => (
        <button key={v} type="button" onClick={() => setMyVisibility(v)} className={cn('px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md', myVisibility === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
         {v === 'all' ? t('notes.visibilityAll') : v === 'public' ? t('notes.visibilityPublic') : t('notes.visibilityPrivate')}
        </button>
       ))}
      </div>
      <DropdownMenu>
       <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{mySubject || t('questions.subject')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
       <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => setMySubject('')}><span className="text-muted-foreground">{t('questions.subject')}</span>{!mySubject && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
        {subjects.map((s) => (<DropdownMenuItem key={s} onClick={() => setMySubject(s)}>{s}{mySubject === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
       </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
       <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{myCategory || t('questions.category')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
       <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => setMyCategory('')}><span className="text-muted-foreground">{t('questions.category')}</span>{!myCategory && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
        {myFilteredCategories.map((c) => (<DropdownMenuItem key={c} onClick={() => setMyCategory(c)}>{c}{myCategory === c && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
       </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
       <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs">{myType ? t(`questionTypes.${myType}` as any) : t('questions.questionType')}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
       <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setMyType('')}><span className="text-muted-foreground">{t('questions.questionType')}</span>{!myType && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
        {QUESTION_TYPE_OPTIONS.map((o) => (<DropdownMenuItem key={o.value} onClick={() => setMyType(o.value)}>{t(`questionTypes.${o.value}` as any)}{myType === o.value && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>))}
       </DropdownMenuContent>
      </DropdownMenu>
     </div>
     {myNotesLoading ? (
      <div className="space-y-3">{[...Array(3)].map((_, i) => (<div key={i} className="rounded-xl border p-4 space-y-3"><div className="flex gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-16 w-full rounded-lg" /></div>))}</div>
     ) : (
      <>
       {myNotes.length === 0 ? (
        <div className="text-center py-12"><Pencil className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">{t('notes.noMyNotes')}</p></div>
       ) : (
        <div className="space-y-3">
         {myNotes.filter((n) => myVisibility === 'all' || (myVisibility === 'public' ? n.is_public : !n.is_public))
          .filter((n) => !mySubject || n.questions?.subject === mySubject)
          .filter((n) => !myCategory || n.questions?.category === myCategory || (n.questions?.categories as string[])?.includes(myCategory))
          .filter((n) => !myType || n.questions?.question_type === myType)
          .map((note) => <NoteCard key={note.id} note={note} style="my" editingNoteId={editingNoteId} editText={editText} userNicknames={userNicknames}
       onEditText={setEditText} onStartEdit={handleStartEdit} onCancelEdit={() => { setEditingNoteId(null); setEditText('') }}
       onSaveEdit={handleSaveEdit} onTogglePublic={handleTogglePublic} onDeleteRequest={setDeleteNoteId} />)}
        </div>
       )}
      </>
     )}
    </TabsContent>
   </Tabs>

   <AlertDialog open={deleteNoteId !== null} onOpenChange={(open) => { if (!open) setDeleteNoteId(null) }}>
    <AlertDialogContent>
     <AlertDialogTitle>{t('notes.delete')}</AlertDialogTitle>
     <AlertDialogDescription>{t('notes.confirmDelete')}</AlertDialogDescription>
     <div className="flex gap-3 mt-4 justify-end">
      <AlertDialogCancel asChild><Button variant="outline" size="sm">{t('plan.cancel')}</Button></AlertDialogCancel>
      <Button variant="destructive" size="sm" onClick={() => deleteNoteId && handleDelete(deleteNoteId)}>{t('notes.delete')}</Button>
     </div>
    </AlertDialogContent>
   </AlertDialog>
  </div>
 )
}
