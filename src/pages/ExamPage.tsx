import { ExamSession } from '@/components/exam/ExamSession'
import { ExamHistory } from '@/components/exam/ExamHistory'
import { useExamStore } from '@/stores/exam-store'
import { useT } from '@/i18n/use-t'

export function Component() {
 const { t } = useT()
 const session = useExamStore((s) => s.session)
 const isActive = session && session.status === 'in_progress'

 return (
  <div className="space-y-8">
   <div>
    <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('exam.title')}</h1>
    <ExamSession />
   </div>
   {!isActive && (
    <div>
     <h2 className="text-lg font-semibold mb-3">{t('exam.history')}</h2>
     <ExamHistory />
    </div>
   )}
  </div>
 )
}
