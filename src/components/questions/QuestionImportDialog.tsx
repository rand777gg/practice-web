import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { ImportedQuestion } from '@/types'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

type ImportState = 'select' | 'preview' | 'importing' | 'done' | 'error'

export function QuestionImportDialog({ open, onClose, onImported }: Props) {
  const { t } = useT()
  const [state, setState] = useState<ImportState>('select')
  const [parsed, setParsed] = useState<ImportedQuestion[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setState('select')
    setErrors([])
    setParsed([])

    try {
      const text = await file.text()
      const ext = file.name.split('.').pop()?.toLowerCase()

      let questions: ImportedQuestion[] = []

      if (ext === 'json') {
        const raw = JSON.parse(text)
        const arr = Array.isArray(raw) ? raw : [raw]
        questions = arr.map((item: Record<string, unknown>) => ({
          question_text: String(item.question_text ?? ''),
          options: Array.isArray(item.options) ? item.options.map(String) : [],
          correct_answer: Number(item.correct_answer ?? 0),
          category: item.category ? String(item.category) : undefined,
        }))
      } else {
        const lines = text.split('\n').filter((l) => l.trim())
        if (lines.length < 2) {
          setErrors([t('questions.importCsvHeader')])
          setState('error')
          return
        }
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
        const rows = lines.slice(1)

        const parseErrors: string[] = []
        questions = rows.map((row, i) => {
          const cols = row.split(',').map((c) => c.trim())
          const obj: Record<string, string> = {}
          header.forEach((h, idx) => {
            obj[h] = cols[idx] ?? ''
          })

          const options = [obj.option_a, obj.option_b, obj.option_c, obj.option_d].filter(Boolean)
          if (options.length < 2) {
            parseErrors.push(`Row ${i + 2}: ${t('questions.importNeedOptions')}`)
          }

          return {
            question_text: obj.question_text ?? '',
            options,
            correct_answer: Number(obj.correct_answer ?? 0),
            category: obj.category || undefined,
          }
        })

        if (parseErrors.length > 0) {
          setErrors(parseErrors)
        }

        questions = questions.filter((q) => q.question_text && q.options.length >= 2)
      }

      setParsed(questions)
      setState('preview')
    } catch {
      setErrors([t('questions.importParseError')])
      setState('error')
    }
  }

  const handleImport = async () => {
    setState('importing')
    const { error } = await supabase.from('questions').insert(
      parsed.map((q) => ({
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        category: q.category ?? null,
      })),
    )

    if (error) {
      setMessage(error.message)
      setState('error')
    } else {
      setMessage(`${t('questions.importSuccess')} ${parsed.length} ${t('questions.importQuestions')}`)
      setState('done')
      onImported()
    }
  }

  const handleClose = () => {
    setState('select')
    setParsed([])
    setErrors([])
    setMessage('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('questions.importTitle')}</DialogTitle>
          <DialogDescription>{t('questions.importDesc')}</DialogDescription>
        </DialogHeader>

        {state === 'select' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">{t('questions.importSelectFile')}</Label>
              <Input id="file" type="file" accept=".csv,.json" onChange={handleFile} />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{t('questions.importCsvHint')}</p>
              <p>{t('questions.importJsonHint')}</p>
            </div>
          </div>
        )}

        {state === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm">
              {t('questions.importFound')} <strong>{parsed.length}</strong> {t('questions.importValid')}
            </p>
            {errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {parsed.slice(0, 10).map((q, i) => (
                <div key={i} className="text-sm border rounded p-2">
                  <p className="font-medium truncate">{q.question_text}</p>
                  <p className="text-muted-foreground">{q.options.length} {t('questions.options')}</p>
                </div>
              ))}
              {parsed.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  {t('questions.importMore')} {parsed.length - 10} {t('questions.importMore2')}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t('questions.cancel')}</Button>
              <Button onClick={handleImport}>{t('questions.importBtn')} {parsed.length} {t('questions.importQuestions')}</Button>
            </DialogFooter>
          </div>
        )}

        {state === 'importing' && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {(state === 'done' || state === 'error') && (
          <div className="space-y-4">
            <div className={`rounded-md p-3 text-sm ${state === 'done' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-destructive/10 text-destructive'}`}>
              {message}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
