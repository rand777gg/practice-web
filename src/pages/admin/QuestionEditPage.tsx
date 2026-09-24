import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
import { Button } from '@/components/ui/button'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import type { Question, QuestionInput } from '@/types'
import { useT } from '@/i18n/use-t'
import { deleteDraft, getDraft, saveDraft } from '@/lib/question-drafts'

export function Component() {
 const { t } = useT()
 const { questionId } = useParams<{ questionId: string }>()
 const navigate = useNavigate()
 const [searchParams, setSearchParams] = useSearchParams()
 const returnTo = searchParams.get('from') || '/admin/questions'
 const { updateQuestion } = useQuestions()
 const [question, setQuestion] = useState<Question | null>(null)
 const [draftId, setDraftId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('draft'))
 const [draftPayload, setDraftPayload] = useState<QuestionInput | undefined>()
 const [isLoading, setIsLoading] = useState(true)
 const loadedRef = useRef(false)

 useEffect(() => {
  if (!questionId || loadedRef.current) return
  loadedRef.current = true
  const draftParam = searchParams.get('draft')
  void (async () => {
   const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .single()
   setQuestion(data as Question | null)
   // 有草稿就先看草稿: 上次存到一半的内容比库里的旧版本更接近真实意图
   if (draftParam) {
    const d = await getDraft(draftParam).catch(() => null)
    if (d) { setDraftId(d.id); setDraftPayload(d.payload) }
    else setDraftId(null)
   }
   setIsLoading(false)
  })()
 }, [questionId, searchParams])

 const handleSaveDraft = async (data: QuestionInput) => {
  const id = await saveDraft(data, { draftId, questionId })
  setDraftId(id)
  const next = new URLSearchParams(searchParams)
  next.set('draft', id)
  setSearchParams(next, { replace: true })
 }

 const handleSubmit = async (data: QuestionInput) => {
  if (!question) return
  await updateQuestion(question.id, data)
  if (draftId) await deleteDraft(draftId).catch(() => {})
  navigate(returnTo)
 }

 if (isLoading) {
  return <LoadingTips className="py-12" compact />
 }

 if (!question) {
  return <p className="text-muted-foreground">{t('questions.notFound')}</p>
 }

 return (
  <div className="space-y-6">
   <div className="flex items-center gap-3">
    <Button variant="ghost" size="icon" onClick={() => navigate(returnTo)}>
     <ArrowLeft className="h-4 w-4" />
    </Button>
    <h1 className="text-xl font-bold flex-1">{draftPayload ? t('questions.draftEditTitle') : t('questions.editTitle')}</h1>
    <Button variant="outline" size="sm" asChild>
      <Link to={`/admin/questions/test?id=${questionId}`} target="_blank">
        <FlaskConical className="size-3.5 mr-1" />
        测试题目
      </Link>
    </Button>
   </div>
   <QuestionForm
    initialData={draftPayload ?? question}
    onSubmit={handleSubmit}
    onSaveDraft={handleSaveDraft}
    draftId={draftId}
    onCancel={() => navigate(returnTo)}
   />
  </div>
 )
}
