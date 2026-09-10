import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { getMfaStatus, getDeviceTokenSync } from '@/lib/mfa'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ShieldAlert, ShieldCheck, X } from 'lucide-react'

interface Props {
  children: ReactNode
}

function MfaReminder({ onGo, onDismiss }: { onGo: () => void; onDismiss: () => void }) {
  const { t } = useT()
  const [visible, setVisible] = useState(true)
  return (
    <div
      className={
        'fixed top-4 right-4 z-[60] max-w-xs rounded-lg border bg-background px-4 py-3 shadow-lg transition-all duration-500 ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none')
      }
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t('auth.mfaReminderTitle')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('auth.mfaReminderDesc')}</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={onGo}>
              {t('auth.mfaReminderGo')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('auth.mfaReminderLater')}
            </Button>
          </div>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => { setVisible(false); onDismiss() }}
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

const GATE_ATTEMPTS = 3
const GATE_RETRY_MS = 1500

function MfaGateBlocked({ onRetry, onLogout, busy }: { onRetry: () => void; onLogout: () => void; busy: boolean }) {
  const { t } = useT()
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-base font-semibold">{t('auth.mfaGateErrorTitle')}</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('auth.mfaGateErrorDesc')}</p>
        <div className="flex justify-center gap-2 pt-1">
          <Button size="sm" onClick={onRetry} disabled={busy}>{t('auth.mfaGateRetry')}</Button>
          <Button size="sm" variant="outline" onClick={onLogout} disabled={busy}>{t('auth.logout')}</Button>
        </div>
      </div>
    </div>
  )
}

export function OtpGuard({ children }: Props) {
  const { user, isInitialized, refreshProfile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [showReminder, setShowReminder] = useState(false)
  const [otpCleared, setOtpCleared] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [gateError, setGateError] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // No checkedRef dedup here: under React StrictMode (dev) the effect is
  // setup→cleanup→setup, so a ref set on the first run would cancel the
  // second run and the guard would never act. Rely on per-run `cancelled`
  // cleanup instead — the stale StrictMode run aborts, the live one proceeds.
  useEffect(() => {
    if (!user || !isInitialized) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    async function run() {
      // The login form is handling MFA / onboarding — skip the dialog
      if (sessionStorage.getItem('mfa_pending')) return
      await refreshProfile()
      if (cancelled) return

      const status = await getMfaStatus().catch(() => null)
      if (cancelled) return

      // An unknown gate state must never silently drop the 2FA requirement (and must never be
      // read as "no MFA configured"): retry, then block behind an explicit retry/logout screen.
      if (!status) {
        if (attempt < GATE_ATTEMPTS - 1) {
          retryTimer = setTimeout(() => { if (!cancelled) setAttempt((a) => a + 1) }, GATE_RETRY_MS)
        } else {
          setGateError(true)
        }
        return
      }
      setGateError(false)

      // No MFA method configured yet
      const hasAnyMfa = status.availableMethods.passkey || status.availableMethods.totp
      if (!hasAnyMfa) {
        // New user (never onboarded) or admin (mandatory) → dedicated /guide page
        if (!status.onboarded || status.role === 'admin') {
          sessionStorage.setItem('mfa_pending', '1')
          navigate('/guide', { replace: true })
          return
        }
        // Existing regular user without MFA → lightweight per-login reminder
        setShowReminder(true)
        setOtpCleared(true)
        return
      }

      if (status.needsMfa) {
        // Card-style verification page — password login, GitHub/QR login and fallback all land here
        sessionStorage.setItem('mfa_pending', '1')
        navigate('/mfa', { replace: true })
        return
      }

      setOtpCleared(true)
    }

    run()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [user, isInitialized, refreshProfile, navigate, attempt])

  // Realtime: when this device's trust row is deleted elsewhere → force re-verification immediately
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`device-trust-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_trusted_devices', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const deletedDeviceId = (payload.old as { device_id?: string } | null)?.device_id
          if (!deletedDeviceId || deletedDeviceId !== getDeviceTokenSync()) return
          if (sessionStorage.getItem('mfa_pending')) return
          // Ignore when this device just revoked itself (e.g. setting validity to 0)
          if (sessionStorage.getItem('mfa_self_revoke') === '1') {
            sessionStorage.removeItem('mfa_self_revoke')
            return
          }
          sessionStorage.setItem('mfa_pending', '1')
          sessionStorage.setItem('mfa_force_verify', '1')
          navigate('/mfa', { replace: true })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, navigate])

  const handleGoSettings = useCallback(() => {
    setShowReminder(false)
    sessionStorage.setItem('mfa_pending', '1')
    navigate('/guide')
  }, [navigate])

  const handleReminderDismiss = useCallback(() => {
    setShowReminder(false)
  }, [])

  const handleGateRetry = useCallback(() => {
    setGateError(false)
    setAttempt(0)
  }, [])

  const handleGateLogout = useCallback(async () => {
    setLoggingOut(true)
    await signOut()
    navigate('/', { replace: true })
  }, [signOut, navigate])

  if (!user || !isInitialized) return <>{children}</>

  if (gateError) {
    return <MfaGateBlocked onRetry={handleGateRetry} onLogout={handleGateLogout} busy={loggingOut} />
  }

  return (
    <>
      {children}
      {otpCleared && showReminder && (
        <MfaReminder onGo={handleGoSettings} onDismiss={handleReminderDismiss} />
      )}
    </>
  )
}
