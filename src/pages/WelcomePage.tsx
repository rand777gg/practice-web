import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ArrowRight, PartyPopper, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Component() {
  const { t } = useT()
  const { user, isInitialized } = useAuthStore()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [countingDown, setCountingDown] = useState(false)
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (!isInitialized) return
    if (!user && !hasRedirected.current) {
      hasRedirected.current = true
      navigate('/login', { replace: true })
      return
    }
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => setCountingDown(true), 1500)
    const t3 = setTimeout(() => {
      if (!hasRedirected.current) {
        hasRedirected.current = true
        navigate('/', { replace: true })
      }
    }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [isInitialized, user, navigate])

  const handleGo = () => {
    if (hasRedirected.current) return
    hasRedirected.current = true
    navigate('/', { replace: true })
  }

  if (!isInitialized || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-background">
      <div
        className={cn(
          'text-center space-y-6 max-w-md px-4 transition-all duration-700 ease-out',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        )}
      >
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10">
            <PartyPopper className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            {t('auth.welcome.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('auth.welcome.subtitle')}
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
              {countingDown ? t('auth.welcome.redirectText') : t('auth.welcome.redirectSoon')}
            </span>
          </div>

          <Button onClick={handleGo} size="lg" className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            {t('auth.welcome.enterDashboard')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('auth.welcome.manualHint')}
        </p>
      </div>
    </div>
  )
}
