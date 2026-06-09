import { useNavigate } from 'react-router-dom'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const navigate = useNavigate()
  const { createQuestion } = useQuestions()
  const { t } = useT()

  const handleSubmit = async (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => {
    await createQuestion(data)
    navigate('/admin/questions')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/questions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">{t('questions.createTitle')}</h1>
      </div>
      <QuestionForm onSubmit={handleSubmit} onCancel={() => navigate('/admin/questions')} />
    </div>
  )
}
