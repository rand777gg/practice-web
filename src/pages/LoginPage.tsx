import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { LoginForm } from '@/components/login-form'
import { useEffect, useState } from 'react'
import { StarsBackground } from '@/components/animate-ui/components/backgrounds/stars'
import { useForceDarkPage } from '@/hooks/use-force-dark-page'

export function Component() {
  const { user } = useAuthStore()
  const [ready, setReady] = useState(false)
  useForceDarkPage()

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Stay on this page while the login form is handling MFA/onboarding (mfa_pending is set)
  if (user && !sessionStorage.getItem('mfa_pending')) return <Navigate to="/" replace />

  return (
    <StarsBackground className="min-h-svh w-full flex flex-col items-center justify-center gap-6 px-4 py-6 md:p-10">
      <div className="relative z-10 w-full max-w-sm page-enter">
        <LoginForm visible={ready} />
      </div>
    </StarsBackground>
  )
}
