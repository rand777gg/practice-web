import { ExamSession } from '@/components/exam/ExamSession'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('exam.title')}</h1>
      <ExamSession />
    </div>
  )
}
