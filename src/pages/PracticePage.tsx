import { PracticeSession } from '@/components/practice/PracticeSession'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  return (
    <div className="max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('practice.title')}</h1>
      <PracticeSession />
    </div>
  )
}
