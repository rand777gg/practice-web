import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ArrowLeft, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Component() {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [countingDown, setCountingDown] = useState(false)
  const hasRedirected = useRef(false)

  useEffect(() => {
    // Sign out if still authenticated
    if (user) {
      signOut()
    }

    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => setCountingDown(true), 1500)
    const t3 = setTimeout(() => {
      if (!hasRedirected.current) {
        hasRedirected.current = true
        navigate('/login', { replace: true })
      }
    }, 4000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const handleGo = () => {
    if (hasRedirected.current) return
    hasRedirected.current = true
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/5 to-background">
      <div
        className={cn(
          'text-center space-y-6 max-w-md px-4 transition-all duration-700 ease-out',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        )}
      >
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted">
            <LogOut className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            {t('auth.farewell.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('auth.farewell.subtitle')}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                countingDown ? 'bg-primary' : 'bg-muted-foreground/50',
              )} />
              <span className={cn(
                'relative inline-flex rounded-full h-2.5 w-2.5',
                countingDown ? 'bg-primary' : 'bg-muted-foreground/50',
              )} />
            </span>
            <span className="text-muted-foreground">
              {countingDown ? t('auth.farewell.redirectText') : t('auth.farewell.redirectSoon')}
            </span>
          </div>

          <Button onClick={handleGo} variant="outline" size="lg" className="w-full gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('auth.farewell.goToLogin')}
          </Button>
        </div>
      </div>
    </div>
  )
}
