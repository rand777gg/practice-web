import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, Pencil, Check, X, Star } from 'lucide-react'
import type { UserAnswer, Question } from '@/types'
import { useT } from '@/i18n/use-t'
import { useFavorites } from '@/hooks/use-favorites'

type FilterMode = 'all' | 'practice' | 'exam'

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [mode, setMode] = useState<FilterMode>('all')
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)

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
    <div className="max-w-3xl space-y-4">
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

      {isLoading ? (
        <LoadingTips className="py-12" compact />
      ) : answers.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t('review.noWrong')}</p>
      ) : (
        <div className="space-y-4">
          {answers.map((ans) => (
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
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
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
