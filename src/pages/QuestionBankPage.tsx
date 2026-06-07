import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('nav.questionBank')}</h1>
    </div>
  )
}
