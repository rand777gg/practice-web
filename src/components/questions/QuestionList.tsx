import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Question, QuestionType } from '@/types'
import { Pencil, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/use-t'

const TYPE_COLORS: Record<QuestionType, string> = {
  single_choice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  multi_select:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  true_false:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  judge_correct: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  fill_blank:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  short_answer:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  analysis:      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
}

interface Props {
  questions: Question[]
  onDelete: (id: string) => Promise<void>
}

export function QuestionList({ questions, onDelete }: Props) {
  const { t } = useT()

  if (questions.length === 0) {
    return <p className="text-muted-foreground text-center py-12">{t('questions.noQuestions')}</p>
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">{t('questions.question')}</TableHead>
            <TableHead>{t('questions.subject')}</TableHead>
            <TableHead>{t('questions.category')}</TableHead>
            <TableHead>{t('questions.questionType')}</TableHead>
            <TableHead className="w-20">{t('questions.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="max-w-[200px] lg:max-w-xs truncate">{q.question_text}</TableCell>
              <TableCell className="whitespace-nowrap">{q.subject ?? '-'}</TableCell>
              <TableCell className="whitespace-nowrap">{q.category ?? '-'}</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_COLORS[q.question_type]}`}>
                  {t(`questionTypes.${q.question_type}` as any) || q.question_type}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link to={`/admin/questions/${q.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(q.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
