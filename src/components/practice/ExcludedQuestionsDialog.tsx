import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Question, CorrectAnswer } from '@/types'

interface ExcludedItem {
  question: Question
  latest_answer: { selected_answer: CorrectAnswer | null; is_correct: boolean; note: string | null; answered_at: string } | null
  attempts: number
  wrongs: number
}

interface Props {
  userId: string
  kp: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestored?: () => void
}

export function ExcludedQuestionsDialog({ userId, kp, open, onOpenChange, onRestored }: Props) {
  const [items, setItems] = useState<ExcludedItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (!open) return
    let c = false
    setLoading(true)
    supabase.rpc('get_excluded_kp_questions', { p_user_id: userId, p_kp: kp }).then(({ data }) => {
      if (c) return
      const list = (data ?? []) as ExcludedItem[]
      setItems(list)
      setSelectedId(prev => prev && list.some(i => i.question.id === prev) ? prev : (list[0]?.question.id ?? null))
      setLoading(false)
    })
    return () => { c = true }
  }, [open, kp, userId])

  const restore = async (id: string) => {
    setRestoring(id)
    await supabase.from('user_excluded_questions').delete().eq('user_id', userId).eq('question_id', id)
    dirtyRef.current = true
    const next = items.filter(i => i.question.id !== id)
    setItems(next)
    if (selectedId === id) setSelectedId(next[0]?.question.id ?? null)
    setRestoring(null)
  }

  const restoreAll = async () => {
    if (items.length === 0) return
    setRestoring('__all__')
    await supabase.from('user_excluded_questions').delete().eq('user_id', userId).in('question_id', items.map(i => i.question.id))
    dirtyRef.current = true
    setItems([])
    setSelectedId(null)
    setRestoring(null)
  }

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o)
    if (!o && dirtyRef.current) {
      dirtyRef.current = false
      onRestored?.()
    }
  }

  const selected = items.find(i => i.question.id === selectedId) ?? null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>恢复已排除的题目 · {kp}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
          <div className="w-72 shrink-0 flex flex-col min-h-0 rounded-lg border">
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">加载中...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">该知识点下暂无被排除的题目</p>
              ) : (
                items.map(i => {
                  const ok = i.latest_answer?.is_correct
                  return (
                    <button
                      key={i.question.id}
                      type="button"
                      onClick={() => setSelectedId(i.question.id)}
                      className={cn(
                        'w-full text-left rounded-lg border px-2.5 py-2 transition-colors',
                        selectedId === i.question.id ? 'border-primary/50 bg-primary/5' : 'border-border/60 bg-background hover:bg-accent',
                      )}
                    >
                      <p className="text-xs leading-relaxed line-clamp-3">{i.question.question_text}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        {ok != null && (
                          <span className={cn('rounded-full px-1.5 py-0.5', ok ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700')}>
                            {ok ? '答对' : '答错'}
                          </span>
                        )}
                        {i.wrongs > 0 && <span className="text-muted-foreground">错 {i.wrongs} 次</span>}
                        <span className="ml-auto text-muted-foreground">{i.attempts} 次作答</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto pr-1">
            {selected ? (
              <div className="space-y-3">
                <QuestionCard
                  question={selected.question}
                  selectedAnswer={selected.latest_answer?.selected_answer ?? null}
                  showResult
                  disabled
                  attemptCount={selected.attempts}
                  wrongCount={selected.wrongs}
                  note={selected.latest_answer?.note ?? null}
                />
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" disabled={restoring !== null} onClick={() => restore(selected.question.id)}>
                    {restoring === selected.question.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    恢复此题
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">{loading ? '加载中...' : '请选择左侧题目查看'}</p>
            )}
          </div>
        </div>
        <DialogFooter className="pt-2 border-t">
          {items.length > 0 && (
            <Button variant="outline" size="sm" disabled={restoring !== null} onClick={restoreAll}>
              {restoring === '__all__' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
              恢复全部 ({items.length})
            </Button>
          )}
          <Button size="sm" onClick={() => handleOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
