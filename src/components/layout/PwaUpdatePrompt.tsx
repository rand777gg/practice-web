import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

export function PwaUpdatePrompt() {
  const { t } = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-80 rounded-xl border bg-card p-4 shadow-lg">
      <p className="text-sm font-semibold">{t('pwa.updateTitle')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('pwa.updateDesc')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setNeedRefresh(false)}>
          {t('pwa.dismiss')}
        </Button>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          {t('pwa.refresh')}
        </Button>
      </div>
    </div>
  )
}
