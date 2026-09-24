import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuestions } from '@/hooks/use-questions'
import { QuestionForm } from '@/components/questions/QuestionForm'
import { Button } from '@/components/ui/button'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { ArrowLeft } from 'lucide-react'
import type { QuestionInput } from '@/types'
import { useT } from '@/i18n/use-t'
import { deleteDraft, getDraft, saveDraft } from '@/lib/question-drafts'

export function Component() {
 const navigate = useNavigate()
 const { createQuestion } = useQuestions()
 const { t } = useT()
 const [searchParams, setSearchParams] = useSearchParams()
 const [draftId, setDraftId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('draft'))
 const [initialData, setInitialData] = useState<QuestionInput | undefined>()
 const [loadingDraft, setLoadingDraft] = useState(() => !!new URLSearchParams(window.location.search).get('draft'))
 const loadedRef = useRef(false)

 // 只在进页面时读一次 draft 参数: 存完草稿会把 id 写回地址栏, 不能因此重载表单把没存完的改动冲掉
 useEffect(() => {
  if (loadedRef.current) return
  loadedRef.current = true
  const id = searchParams.get('draft')
  if (!id) return
  getDraft(id)
   .then((d) => { if (d) setInitialData(d.payload) })
   .catch(() => { setDraftId(null) })
   .finally(() => setLoadingDraft(false))
 }, [searchParams])

 const handleSaveDraft = async (data: QuestionInput) => {
  const id = await saveDraft(data, { draftId })
  setDraftId(id)
  setSearchParams({ draft: id }, { replace: true })
 }

 const handleSubmit = async (data: QuestionInput) => {
  await createQuestion(data)
  if (draftId) await deleteDraft(draftId).catch(() => {})
  navigate('/admin/questions')
 }

 if (loadingDraft) return <LoadingTips className="py-12" compact />

 return (
  <div className="space-y-6">
   <div className="flex items-center gap-3">
    <Button variant="ghost" size="icon" onClick={() => navigate('/admin/questions')}>
     <ArrowLeft className="h-4 w-4" />
    </Button>
    <h1 className="text-xl font-bold">{draftId ? t('questions.draftEditTitle') : t('questions.createTitle')}</h1>
   </div>
   <QuestionForm
    initialData={initialData}
    onSubmit={handleSubmit}
    onSaveDraft={handleSaveDraft}
    draftId={draftId}
    onCancel={() => navigate('/admin/questions')}
   />
  </div>
 )
}
