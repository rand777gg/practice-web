import { useNavigate } from 'react-router-dom'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
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
      <h1 className="text-xl lg:text-2xl font-bold">{t('questions.createTitle')}</h1>
      <QuestionForm onSubmit={handleSubmit} onCancel={() => navigate('/admin/questions')} />
    </div>
  )
}
