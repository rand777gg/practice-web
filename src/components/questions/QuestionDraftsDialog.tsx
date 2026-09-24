import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QUESTION_TYPE_LABELS, TYPE_COLORS } from '@/lib/constants'
import { deleteDraft, listDrafts, publishBlocker, publishDraft } from '@/lib/question-drafts'
import type { QuestionDraft } from '@/types'
import { FileText, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onClose: () => void
  /** 发布成功后通知外面刷新列表与草稿数 */
  onPublished: () => void
  /** 草稿增删后通知外面更新草稿数 */
  onChanged: () => void
}

export function QuestionDraftsDialog({ open, onClose, onPublished, onChanged }: Props) {
  const { t } = useT()
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<QuestionDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // setState 全放进回调里: 在 effect 体里同步改状态会触发级联渲染
  useEffect(() => {
    if (!open) return
    listDrafts()
      .then((rows) => { setDrafts(rows); setError('') })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open])

  const close = () => {
    setConfirmId(null)
    onClose()
  }

  const openDraft = (d: QuestionDraft) => {
    close()
    navigate(d.question_id
      ? `/admin/questions/${d.question_id}/edit?draft=${d.id}`
      : `/admin/questions/new?draft=${d.id}`)
  }

  const handlePublish = async (d: QuestionDraft) => {
    setBusyId(d.id)
    setError('')
    try {
      await publishDraft(d)
      setDrafts((prev) => prev.filter((x) => x.id !== d.id))
      onPublished()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusyId(null)
  }

  const handleDelete = async (d: QuestionDraft) => {
    setBusyId(d.id)
    setError('')
    try {
      await deleteDraft(d.id)
      setDrafts((prev) => prev.filter((x) => x.id !== d.id))
      onChanged()
      setConfirmId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusyId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('questions.draftBox')}</DialogTitle>
          <DialogDescription>{t('questions.draftBoxDesc')}</DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>}

        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : error ? null : drafts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('questions.draftEmpty')}</p>
          ) : (
            drafts.map((d) => {
              const payload = d.payload ?? ({} as QuestionDraft['payload'])
              const cats = payload.categories?.length ? payload.categories : payload.category ? [payload.category] : []
              const blocker = publishBlocker(payload)
              const busy = busyId === d.id
              return (
                <div key={d.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className={cn('shrink-0 text-[10px] rounded-full px-2 py-0.5 font-medium mt-0.5', TYPE_COLORS[d.question_type])}>
                      {QUESTION_TYPE_LABELS[d.question_type] ?? d.question_type}
                    </span>
                    <span className="flex-1 text-sm line-clamp-2 break-words">
                      {payload.question_text?.trim() || <span className="text-muted-foreground">{t('questions.draftUntitled')}</span>}
                    </span>
                    {d.question_id && (
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t('questions.draftEditOf')}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {payload.subject && <span>{t('questions.subject')}: {payload.subject}</span>}
                    {cats.length > 0 && <span>{t('questions.category')}: {cats.join(', ')}</span>}
                    <span className="tabular-nums">
                      {t('questions.draftUpdatedAt')} {new Date(d.updated_at).toLocaleString('zh-CN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {blocker && <span className="mr-auto text-[11px] text-amber-600 dark:text-amber-400">{blocker}</span>}
                    <div className="ml-auto flex items-center gap-2">
                      {confirmId === d.id ? (
                        <>
                          <span className="text-[11px] text-muted-foreground">{t('questions.draftDeleteAsks')}</span>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy}
                            onClick={() => handleDelete(d)}>
                            {t('questions.draftDelete')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmId(null)}>
                            {t('questions.cancel')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openDraft(d)}>
                            <FileText className="h-3.5 w-3.5" />
                            {t('questions.draftContinue')}
                          </Button>
                          <Button size="sm" className="h-7 text-xs" disabled={!!blocker || busy}
                            onClick={() => handlePublish(d)}>
                            {busy ? t('questions.draftPublishing') : t('questions.draftPublish')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            disabled={busy} onClick={() => setConfirmId(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
