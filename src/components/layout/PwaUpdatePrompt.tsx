import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Periodically check for updates every hour
      r && setInterval(() => r.update(), 60 * 60 * 1000)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="rounded-lg border bg-card p-3 shadow-lg text-sm flex items-center gap-3">
        <span>有新版本可用</span>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          立即更新
        </Button>
      </div>
    </div>
  )
}
