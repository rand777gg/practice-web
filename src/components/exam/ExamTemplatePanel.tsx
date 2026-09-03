import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Layers, Settings2, Plus } from 'lucide-react'
import { useExamTemplateStore, selectAllTemplates } from '@/stores/exam-template-store'
import { isBuiltinTemplate, totalQuestions, totalScore } from '@/lib/exam-presets'
import { ExamTemplateEditorDialog } from './ExamTemplateEditorDialog'
import { useT } from '@/i18n/use-t'
import type { ExamTemplate } from '@/types'

interface Props {
  userId: string
  subjects: string[]
  categories: string[]
  value: ExamTemplate | null
  onChange: (template: ExamTemplate | null) => void
}

export function ExamTemplatePanel({ userId, subjects, categories, value, onChange }: Props) {
  const { t } = useT()
  const { templates, load } = useExamTemplateStore()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ExamTemplate | null>(null)

  useEffect(() => {
    if (userId) load(userId)
  }, [userId, load])

  const all = selectAllTemplates(templates)
  const builtins = all.filter((x) => isBuiltinTemplate(x.id))
  const mine = all.filter((x) => !isBuiltinTemplate(x.id))

  const questions = value ? totalQuestions(value.sections) : 0
  const score = value ? totalScore(value.sections) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 flex-1 justify-between gap-1 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <Layers className="h-3.5 w-3.5 shrink-0" />
                {value ? value.name : t('examTemplate.noTemplate')}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuItem onClick={() => onChange(null)}>{t('examTemplate.noTemplate')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">{t('examTemplate.builtinGroup')}</DropdownMenuLabel>
            {builtins.map((x) => (
              <DropdownMenuItem key={x.id} onClick={() => onChange(x)}>
                {x.name}
                <span className="ml-auto text-[10px] text-muted-foreground">{totalQuestions(x.sections)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">{t('examTemplate.myGroup')}</DropdownMenuLabel>
            {mine.length === 0 && (
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('examTemplate.noCustom')}</div>
            )}
            {mine.map((x) => (
              <DropdownMenuItem key={x.id} onClick={() => onChange(x)}>
                {x.name}
                <span className="ml-auto text-[10px] text-muted-foreground">{totalQuestions(x.sections)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t('examTemplate.manage')}
          onClick={() => {
            setEditing(value ?? null)
            setEditorOpen(true)
          }}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {value && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('examTemplate.totalQuestions')} {questions}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            {t('examTemplate.totalScore')} {score}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            {value.duration_min} {t('exam.minutes')}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5">{t(`examTemplate.order_${value.order_mode}`)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">{t(`examTemplate.sample_${value.sample_mode}`)}</span>
          {isBuiltinTemplate(value.id) && (
            <span className="rounded bg-muted px-1.5 py-0.5">{t('examTemplate.builtin')}</span>
          )}
        </div>
      )}

      {!value && (
        <button
          type="button"
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          <Plus className="mr-0.5 inline h-3 w-3" />
          {t('examTemplate.new')}
        </button>
      )}

      <ExamTemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing}
        subjects={subjects}
        categories={categories}
        userId={userId}
        onSaved={(saved) => {
          onChange(saved)
          setEditing(saved)
        }}
        onDeleted={(id) => {
          if (value?.id === id) onChange(null)
        }}
      />
    </div>
  )
}
