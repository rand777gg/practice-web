import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
import { Button } from '@/components/ui/button'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { ArrowLeft } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
 const { t } = useT()
 const { questionId } = useParams<{ questionId: string }>()
 const navigate = useNavigate()
 const [searchParams] = useSearchParams()
 const returnTo = searchParams.get('from') || '/admin/questions'
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
  return <LoadingTips className="py-12" compact />
 }

 if (!question) {
  return <p className="text-muted-foreground">{t('questions.notFound')}</p>
 }

 const handleSubmit = async (data: Omit<Question, 'id' | 'created_at' | 'created_by'>) => {
  await updateQuestion(question.id, data)
  navigate(returnTo)
 }

 return (
  <div className="space-y-6">
   <div className="flex items-center gap-3">
    <Button variant="ghost" size="icon" onClick={() => navigate(returnTo)}>
     <ArrowLeft className="h-4 w-4" />
    </Button>
    <h1 className="text-xl font-bold">{t('questions.editTitle')}</h1>
   </div>
   <QuestionForm
    initialData={question}
    onSubmit={handleSubmit}
    onCancel={() => navigate(returnTo)}
   />
  </div>
 )
}
