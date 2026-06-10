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
import type { UserAnswer, Question, QuestionType } from '@/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { useT } from '@/i18n/use-t'

type NoteWithQuestion = UserAnswer & { questions: Question }

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('my')

  // Shared filter metadata
  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  // Public tab filters
  const [pubFilteredCategories, setPubFilteredCategories] = useState<string[]>([])
  const [pubSubject, setPubSubject] = useState('')
  const [pubCategory, setPubCategory] = useState('')

  // My notes state
  const [myNotes, setMyNotes] = useState<NoteWithQuestion[]>([])
  const [myNotesLoading, setMyNotesLoading] = useState(true)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)

  // My notes filters
  const [myVisibility, setMyVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [mySubject, setMySubject] = useState('')
  const [myCategory, setMyCategory] = useState('')
  const [myType, setMyType] = useState<QuestionType | ''>('')
  const [myFilteredCategories, setMyFilteredCategories] = useState<string[]>([])

  // Public notes state
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
        if (row.categories) {
          for (const c of row.categories as string[]) {
            if (c) cats.add(c)
          }
        }
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
      setPubFilteredCategories([...cats].sort())
      setMyFilteredCategories([...cats].sort())
    }
    loadFilters()
  }, [])

  // Public tab category filter
  useEffect(() => {
    let cancelled = false
    if (!pubSubject) {
      setPubFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category, categories')
          .eq('subject', pubSubject)
        if (cancelled) return
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
          if (row.categories) {
            for (const c of row.categories as string[]) { if (c) cats.add(c) }
          }
        }
        setPubFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    setPubCategory('')
    return () => { cancelled = true }
  }, [pubSubject, categories])

  // My notes tab category filter
  useEffect(() => {
    let cancelled = false
    if (!mySubject) {
      setMyFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category, categories')
          .eq('subject', mySubject)
        if (cancelled) return
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
          if (row.categories) {
            for (const c of row.categories as string[]) { if (c) cats.add(c) }
          }
        }
        setMyFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    setMyCategory('')
    return () => { cancelled = true }
  }, [mySubject, categories])

  // ---- My Notes ----
  const myGenRef = useRef(0)

  const fetchMyNotes = useCallback(async () => {
    if (!user) return
    myGenRef.current++
    const myGen = myGenRef.current
    setMyNotesLoading(true)

    const { data } = await supabase
      .from('user_answers')
      .select('*, questions(*)')
      .eq('user_id', user.id)
      .not('note', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(100)
    if (myGenRef.current !== myGen) return

    setMyNotes((data ?? []) as NoteWithQuestion[])
    setMyNotesLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (activeTab === 'my') fetchMyNotes()
  }, [activeTab, fetchMyNotes])

  const handleTogglePublic = async (note: NoteWithQuestion) => {
    const newPublic = !note.is_public
    await supabase.from('user_answers').update({ is_public: newPublic }).eq('id', note.id)
    setMyNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_public: newPublic } : n)))
  }

  const handleStartEdit = (note: NoteWithQuestion) => {
    setEditingNoteId(note.id)
    setEditText(note.note ?? '')
  }

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

  // ---- Public Notes ----
  const publicGenRef = useRef(0)

  const fetchPublicNotes = useCallback(async () => {
    publicGenRef.current++
    const myGen = publicGenRef.current
    setPublicNotesLoading(true)

    let query = supabase
      .from('user_answers')
      .select('*, questions(*)')
      .eq('is_public', true)
      .order('answered_at', { ascending: false })
      .limit(50)

    const { data } = await query
    if (publicGenRef.current !== myGen) return
    const result = (data ?? []) as NoteWithQuestion[]

    const filtered = pubSubject
      ? result.filter((n) => n.questions?.subject === pubSubject)
      : result

    const userIds = [...new Set(result.map((n) => n.user_id))]
    const nicknames: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', userIds)
      for (const p of profiles ?? []) {
        nicknames[p.id] = p.nickname || `用户${p.id.slice(0, 6)}`
      }
      for (const uid of userIds) {
        if (!nicknames[uid]) nicknames[uid] = `用户${uid.slice(0, 6)}`
      }
    }
    if (publicGenRef.current !== myGen) return
    setPublicNotes(filtered)
    setUserNicknames(nicknames)
    setPublicNotesLoading(false)
  }, [pubSubject])

  useEffect(() => {
    if (activeTab === 'public') fetchPublicNotes()
  }, [activeTab, fetchPublicNotes])

  // ---- Note Card (shared) ----
  function NoteCard({ note, showAuthor, style }: { note: NoteWithQuestion; showAuthor?: boolean; style: 'my' | 'public' }) {
    const isEditing = style === 'my' && editingNoteId === note.id
    return (
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {note.questions?.subject && (
            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {note.questions.subject}
            </span>
          )}
          {(note.questions?.categories?.length ? note.questions.categories : note.questions?.category ? [note.questions.category] : []).map((cat: string) => (
            <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {cat}
            </span>
          ))}
          {style === 'my' && (
            <span className={note.is_public
              ? 'inline-flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300'
              : 'inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
            }>
              {note.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {note.is_public ? t('notes.publicLabel') : t('notes.privateLabel')}
            </span>
          )}
          {showAuthor && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {t('notes.author')}: {userNicknames[note.user_id] || t('notes.anonymous')}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(note.answered_at).toLocaleDateString()}
          </span>
        </div>

        <p className="text-sm font-medium">{note.questions?.question_text || t('notes.untitled')}</p>

        {isEditing ? (
          <div className="space-y-2">
            <NoteEditor
              value={editText}
              onChange={setEditText}
              placeholder={t('practice.notePlaceholder')}
              rows={3}
            />
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>
                <X className="h-3 w-3" />
                {t('plan.cancel')}
              </Button>
              <Button variant="default" size="sm" onClick={() => handleSaveEdit(note.id)}>
                <Check className="h-3 w-3" />
                {t('plan.save')}
              </Button>
            </div>
          </div>
        ) : (
          note.note && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
              {note.note}
            </div>
          )
        )}

        {style === 'my' && !isEditing && (
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" onClick={() => handleTogglePublic(note)} className="text-xs h-7">
              {note.is_public ? <Lock className="h-3 w-3 mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
              {note.is_public ? t('notes.setPrivate') : t('notes.setPublic')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleStartEdit(note)} className="text-xs h-7">
              <Pencil className="h-3 w-3 mr-1" />
              {t('practice.note')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteNoteId(note.id)} className="text-xs h-7 text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3 mr-1" />
              {t('notes.delete')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ---- Tab change handler ----
  const handleTabChange = (v: string) => {
    if (v !== activeTab) {
      setActiveTab(v)
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl lg:text-2xl font-bold">{t('notes.title')}</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="my">{t('notes.tabMy')}</TabsTrigger>
          <TabsTrigger value="public">{t('notes.tabPublic')}</TabsTrigger>
        </TabsList>

        {/* Public Notes Filters */}
        <TabsContent value="public" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {pubSubject || t('questions.subject')}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuItem onClick={() => setPubSubject('')}>
                  <span className="text-muted-foreground">{t('questions.subject')}</span>
                  {!pubSubject && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
                {subjects.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setPubSubject(s)}>
                    {s}
                    {pubSubject === s && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {pubCategory || t('questions.category')}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuItem onClick={() => setPubCategory('')}>
                  <span className="text-muted-foreground">{t('questions.category')}</span>
                  {!pubCategory && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
                {pubFilteredCategories.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setPubCategory(c)}>
                    {c}
                    {pubCategory === c && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {publicNotesLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-3">
                  <div className="flex gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {publicNotes.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t('notes.noNotes')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {publicNotes
                    .filter((n) => !pubCategory || n.questions?.category === pubCategory || (n.questions?.categories as string[])?.includes(pubCategory))
                    .map((note) => (
                      <NoteCard key={note.id} note={note} showAuthor style="public" />
                    ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* My Notes */}
        <TabsContent value="my" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-input bg-background">
              {(['all', 'public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMyVisibility(v)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md',
                    myVisibility === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'all' ? t('notes.visibilityAll') : v === 'public' ? t('notes.visibilityPublic') : t('notes.visibilityPrivate')}
                </button>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {mySubject || t('questions.subject')}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuItem onClick={() => setMySubject('')}>
                  <span className="text-muted-foreground">{t('questions.subject')}</span>
                  {!mySubject && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
                {subjects.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setMySubject(s)}>
                    {s}
                    {mySubject === s && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {myCategory || t('questions.category')}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuItem onClick={() => setMyCategory('')}>
                  <span className="text-muted-foreground">{t('questions.category')}</span>
                  {!myCategory && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
                {myFilteredCategories.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setMyCategory(c)}>
                    {c}
                    {myCategory === c && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  {myType ? t(`questionTypes.${myType}` as any) : t('questions.questionType')}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setMyType('')}>
                  <span className="text-muted-foreground">{t('questions.questionType')}</span>
                  {!myType && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
                {QUESTION_TYPE_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.value} onClick={() => setMyType(o.value)}>
                    {t(`questionTypes.${o.value}` as any)}
                    {myType === o.value && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {myNotesLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-3">
                  <div className="flex gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {myNotes.length === 0 ? (
                <div className="text-center py-12">
                  <Pencil className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t('notes.noMyNotes')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myNotes
                    .filter((n) => myVisibility === 'all' || (myVisibility === 'public' ? n.is_public : !n.is_public))
                    .filter((n) => !mySubject || n.questions?.subject === mySubject)
                    .filter((n) => !myCategory || n.questions?.category === myCategory || (n.questions?.categories as string[])?.includes(myCategory))
                    .filter((n) => !myType || n.questions?.question_type === myType)
                    .map((note) => (
                      <NoteCard key={note.id} note={note} style="my" />
                    ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteNoteId !== null} onOpenChange={(open) => { if (!open) setDeleteNoteId(null) }}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('notes.delete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('notes.confirmDelete')}
          </AlertDialogDescription>
          <div className="flex gap-3 mt-4 justify-end">
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">{t('plan.cancel')}</Button>
            </AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={() => deleteNoteId && handleDelete(deleteNoteId)}>
              {t('notes.delete')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
