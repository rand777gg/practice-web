import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
import { Spinner } from '@/components/ui/spinner'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { questionId } = useParams<{ questionId: string }>()
  const navigate = useNavigate()
  const { updateQuestion } = useQuestions()
  const [question, setQuestion] = useState<Question | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!questionId) return
    supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single()
      .then(({ data }) => {
        setQuestion(data as Question | null)
        setIsLoading(false)
      })
  }, [questionId])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (!question) {
    return <p className="text-muted-foreground">{t('questions.notFound')}</p>
  }

  const handleSubmit = async (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => {
    await updateQuestion(question.id, data)
    navigate('/admin/questions')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold">{t('questions.editTitle')}</h1>
      <QuestionForm
        initialData={question}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/questions')}
      />
    </div>
  )
}
