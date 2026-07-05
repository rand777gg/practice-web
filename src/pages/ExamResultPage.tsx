import { useParams } from 'react-router-dom'
import { ExamResultCard } from '@/components/exam/ExamResultCard'
import { useT } from '@/i18n/use-t'

export function Component() {
 const { t } = useT()
 const { sessionId } = useParams<{ sessionId: string }>()

 if (!sessionId) {
 return <p className="text-muted-foreground">{t('exam.sessionNotFound')}</p>
 }

 return (
 <div className="">
 <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('exam.score')}</h1>
 <ExamResultCard sessionId={sessionId} />
 </div>
 )
}
