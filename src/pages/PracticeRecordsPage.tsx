import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
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
import { Check, Pencil, Star, Trash2, X, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAnswerCorrect } from '@/lib/answer-utils'
import { OPTION_LABELS } from '@/lib/constants'
import type { UserAnswer, Question, CorrectAnswer } from '@/types'
import { useT } from '@/i18n/use-t'
import { useFavorites } from '@/hooks/use-favorites'

type NoteWithQuestion = UserAnswer & { questions: Question }

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
              {isCorrect && <span className="ml-auto text-[10px] shrink-0">&#10003;</span>}
              {isSelected && !isCorrect && <span className="ml-auto text-[10px] shrink-0">&#10007;</span>}
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
      <div className={`rounded px-1.5 py-0.5 ${isAnswerCorrect(selected, correct, type, q.allow_unordered) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
        <span className="text-muted-foreground">你的答案：</span>
        {Array.isArray(selected) ? (selected as string[]).join('；') || '（无）' : String(selected ?? '（无）')}
        {' '}{isAnswerCorrect(selected, correct, type, q.allow_unordered) ? '✓' : '✗'}
      </div>
    </div>
  )
}

function RecordCard({ record, onDelete }: { record: NoteWithQuestion; onDelete?: (id: string) => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(record.note || '')
  const { isFavorite, toggleFavorite } = useFavorites()

  const handleSaveNote = async () => {
    await supabase.from('user_answers').update({ note: editText }).eq('id', record.id)
    record.note = editText
    setEditing(false)
  }

  const fav = isFavorite(record.question_id)

  return (
    <div className="rounded-xl border bg-card grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-0 overflow-hidden">
      <div className="p-4 space-y-2 min-w-0">
        {record.questions?.subject && (
          <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {record.questions.subject}
          </span>
        )}
        <div className="text-sm font-medium leading-relaxed">
          {record.questions?.question_text
            ? <MarkdownRenderer content={record.questions.question_text} className="[&_p]:my-0" />
            : t('notes.untitled')}
        </div>
        {record.questions && <AnswerInfo q={record.questions} selected={record.selected_answer} />}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs',
            record.is_correct
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300')}>
            {record.is_correct ? '✓ 正确' : '✗ 错误'}
          </span>
          <span>{new Date(record.answered_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-hidden max-h-[400px]">
        <div className="flex-1 overflow-auto">
          {editing ? (
            <div className="p-3">
              <NoteEditor value={editText} onChange={setEditText} placeholder={t('practice.notePlaceholder')} />
            </div>
          ) : (
            <div className="p-4 h-full">
              {record.note ? (
                <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                  <MarkdownRenderer content={record.note} />
                </div>
              ) : (
                <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{t('notes.noNote')}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1 px-3 pb-3 pt-1 shrink-0 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleFavorite(record.question_id)} title={fav ? '取消收藏' : '收藏'}>
            <Star className={cn('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : '')} />
          </Button>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /> 取消</Button>
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={handleSaveNote}><Check className="h-3.5 w-3.5" /> 保存</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditText(record.note || ''); setEditing(true) }}><Pencil className="h-3.5 w-3.5" /> 笔记</Button>
              {onDelete && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onDelete(record.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

export function Component() {
  const { user } = useAuthStore()

  const [tab, setTab] = useState('wrong')
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<NoteWithQuestion[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let query = supabase.from('user_answers').select('*, questions(*)').eq('user_id', user.id).order('answered_at', { ascending: false }).limit(200)

      if (tab === 'wrong') {
        query = query.eq('is_correct', false)
      } else if (tab === 'notes') {
        query = query.not('note', 'is', null)
      } else if (tab === 'favorites') {
        const { data: favs } = await supabase.from('favorites').select('question_id').eq('user_id', user.id)
        const favIds = (favs ?? []).map(f => f.question_id)
        if (favIds.length === 0) { setRecords([]); setLoading(false); return }
        query = supabase.from('user_answers').select('*, questions(*)').eq('user_id', user.id).in('question_id', favIds).order('answered_at', { ascending: false }).limit(200)
      }

      const { data } = await query
      setRecords((data ?? []) as NoteWithQuestion[])
    } catch (e) { console.error('Load records failed:', e) }
    setLoading(false)
  }, [user, tab])

  useEffect(() => { loadRecords() }, [loadRecords])

  const handleDelete = async (id: string) => {
    await supabase.from('user_answers').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
    setDeleteId(null)
  }

  return (
    <div className="space-y-4 w-full">
      <h1 className="text-xl lg:text-2xl font-bold">做题记录</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wrong" className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" />错题</TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5"><Star className="h-3.5 w-3.5" />收藏</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><Pencil className="h-3.5 w-3.5" />笔记</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : records.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">
              {{ wrong: '暂无错题，继续加油！', favorites: '暂无收藏题目', notes: '暂无笔记' }[tab]}
            </p>
          ) : (
            <div className="space-y-3">
              {records.map(r => (
                <RecordCard key={r.id} record={r} onDelete={(id) => setDeleteId(id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogTitle>删除记录</AlertDialogTitle>
          <AlertDialogDescription>确定删除这条做题记录？</AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={() => deleteId && handleDelete(deleteId)}>删除</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
