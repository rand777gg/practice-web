import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { getMfaStatus, getDeviceTokenSync, type MfaStatus } from '@/lib/mfa'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ShieldCheck, X } from 'lucide-react'

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

export function OtpGuard({ children }: Props) {
  const { user, isInitialized, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const [showReminder, setShowReminder] = useState(false)
  const [otpCleared, setOtpCleared] = useState(false)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!user || !isInitialized || checkedRef.current) return
    checkedRef.current = true

    let cancelled = false

    async function run() {
      // The login form is handling MFA / onboarding — skip the dialog
      if (sessionStorage.getItem('mfa_pending')) return
      await refreshProfile()
      if (cancelled) return

      let status: MfaStatus | null = null
      try {
        status = await getMfaStatus()
      } catch {
        status = null
      }
      if (cancelled || !status) return

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
    return () => { cancelled = true }
  }, [user, isInitialized, refreshProfile, navigate])

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

  if (!user || !isInitialized) return <>{children}</>

  return (
    <>
      {children}
      {otpCleared && showReminder && (
        <MfaReminder onGo={handleGoSettings} onDismiss={handleReminderDismiss} />
      )}
    </>
  )
}
