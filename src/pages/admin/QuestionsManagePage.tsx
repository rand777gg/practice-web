import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuestions } from '@/hooks/use-questions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { QuestionImportDialog } from '@/components/questions/QuestionImportDialog'
import { QuestionList } from '@/components/questions/QuestionList'
import { Upload, Plus } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { questions, count, isLoading, deleteQuestion, refetch } = useQuestions()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  const filtered = questions.filter((q) =>
    q.question_text.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">{t('questions.title')}</h1>
          <p className="text-sm text-muted-foreground">{count} {t('questions.total')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">{t('questions.import')}</span>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/questions/new">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">{t('questions.addQuestion')}</span>
            </Link>
          </Button>
        </div>
      </div>

      <Input
        placeholder={t('questions.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <LoadingTips className="py-12" compact />
      ) : (
        <QuestionList questions={filtered} onDelete={deleteQuestion} />
      )}

      <QuestionImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refetch}
      />
    </div>
  )
}
