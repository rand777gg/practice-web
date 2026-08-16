import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingGuide } from '@/components/auth/OnboardingGuide'
import { getMfaStatus, type MfaStatus } from '@/lib/mfa'
import { useAuthStore } from '@/stores/auth-store'
import { LoadingTips } from '@/components/layout/LoadingTips'

export function Component() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [status, setStatus] = useState<MfaStatus | null>(null)

  // Signed out (e.g. 退出 in the TOTP setup dialog) → back to login
  useEffect(() => {
    if (user === null) navigate('/login', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    let cancelled = false
    getMfaStatus()
      .then((st) => {
        if (cancelled) return
        const hasAnyMfa = st.availableMethods.passkey || st.availableMethods.totp
        // Allow re-entering /guide whenever no MFA is configured (incl. skipped onboarding)
        if (hasAnyMfa) {
          navigate('/', { replace: true })
          return
        }
        setStatus(st)
      })
      .catch(() => navigate('/', { replace: true }))
    return () => { cancelled = true }
  }, [navigate])

  if (!status) return <LoadingTips className="h-screen" />

  return (
    <OnboardingGuide
      status={status}
      onDone={() => {
        sessionStorage.removeItem('mfa_pending')
        navigate('/', { replace: true })
      }}
    />
  )
}
