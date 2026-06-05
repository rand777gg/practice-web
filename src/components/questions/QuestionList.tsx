import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Question } from '@/types'
import { Pencil, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/use-t'

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
            <TableHead>{t('questions.question')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('questions.category')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('questions.options')}</TableHead>
            <TableHead className="w-20">{t('questions.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="max-w-[200px] lg:max-w-xs truncate">{q.question_text}</TableCell>
              <TableCell className="hidden sm:table-cell">{q.category ?? '-'}</TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {q.options.length} {t('questions.options')}
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
