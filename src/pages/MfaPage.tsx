import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { getMfaStatus, type MfaStatus } from '@/lib/mfa'
import { MfaPanels, type MfaPanel } from '@/components/auth/MfaPanels'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { ShieldCheck } from 'lucide-react'

// /mfa/webauthn → passkey panel, /mfa/app → totp panel, /mfa/recovery → recovery panel
const METHOD_TO_PANEL: Record<string, MfaPanel> = { webauthn: 'passkey', app: 'totp', recovery: 'recovery' }
const PANEL_TO_METHOD: Record<MfaPanel, string> = { passkey: 'webauthn', totp: 'app', recovery: 'recovery' }

/** Card-style MFA verification page — used by password login, GitHub OAuth, QR login and guard fallback. */
export function Component() {
  const { method } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [defaultMethod, setDefaultMethod] = useState<'webauthn' | 'app'>('app')

  useEffect(() => {
    if (user === null) navigate('/login', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMfaStatus()
      .then(async (st) => {
        if (cancelled) return
        const forceVerify = sessionStorage.getItem('mfa_force_verify') === '1'
        // Regular flow: skip when MFA isn't needed. Forced flow (device trust revoked): always verify.
        if (!forceVerify && !st.needsMfa) {
          navigate('/', { replace: true })
          return
        }
        setStatus(st)
        // Default method strictly follows the user's setting (falls back to app if passkey isn't registered)
        let def: 'webauthn' | 'app' = 'app'
        if (profile?.preferred_2fa === 'passkey' && st.availableMethods.passkey) {
          def = 'webauthn'
        }
        setDefaultMethod(def)
      })
      .catch(() => navigate('/', { replace: true }))
    return () => { cancelled = true }
  }, [user, navigate, profile?.preferred_2fa])

  const requestedPanel = method ? METHOD_TO_PANEL[method] : undefined

  // Redirect to the default method when the URL has no method or the method is unavailable
  useEffect(() => {
    if (!status || !defaultMethod) return
    const target = method ? (METHOD_TO_PANEL[method] ? `/mfa/${method}` : null) : `/mfa/${defaultMethod}`
    if (!target) return
    if (requestedPanel && requestedPanel !== 'recovery' && !status.availableMethods[requestedPanel]) {
      navigate(`/mfa/${defaultMethod}`, { replace: true })
      return
    }
    if (requestedPanel === 'recovery' && !status.availableMethods.recovery) {
      navigate(`/mfa/${defaultMethod}`, { replace: true })
      return
    }
    if (!method) navigate(target, { replace: true })
  }, [status, method, defaultMethod, requestedPanel, navigate])

  if (!user) return null
  if (!status) return <LoadingTips className="h-screen" />

  const panel: MfaPanel = requestedPanel ?? (defaultMethod === 'webauthn' ? 'passkey' : 'totp')

  const handleVerified = () => {
    sessionStorage.removeItem('mfa_pending')
    sessionStorage.removeItem('mfa_force_verify')
    navigate('/', { replace: true })
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm border-gray-200 bg-white/80 backdrop-blur-md shadow-xl dark:border-white/10 dark:bg-black/30 dark:shadow-2xl">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
            <span className="inline-flex items-center justify-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('auth.mfaTitle')}
            </span>
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-white/60">
            {sessionStorage.getItem('mfa_force_verify') === '1' && (
              <span className="block text-xs text-destructive mb-1">{t('auth.mfaDeviceRevoked')}</span>
            )}
            {panel === 'passkey' && t('auth.mfaAuthenticatePasskey')}
            {panel === 'totp' && t('auth.mfaAuthenticateTotp')}
            {panel === 'recovery' && t('auth.otpRecoveryDialogDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <MfaPanels
            status={status}
            panel={panel}
            onPanelChange={(p) => navigate(`/mfa/${PANEL_TO_METHOD[p]}`)}
            onVerified={handleVerified}
          />
          <div className="mt-4 border-t pt-4 text-center">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleLogout}>
              {t('auth.logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
