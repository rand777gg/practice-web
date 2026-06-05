import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'

export function LoadingScreen() {
  const { t } = useT()
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  )
}
