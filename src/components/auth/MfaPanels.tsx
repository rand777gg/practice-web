import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { InputOtp } from '@/components/ui/input-otp'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { authenticateWithPasskey } from '@/lib/passkey'
import { verifyTotp, recoverWithCode, type MfaStatus } from '@/lib/mfa'
import { KeyRound, Smartphone, ShieldAlert } from 'lucide-react'

type Panel = 'passkey' | 'totp' | 'recovery'
export type { Panel as MfaPanel }

interface Props {
  status: MfaStatus
  panel: Panel
  onPanelChange: (panel: Panel) => void
  onVerified: () => void
}

/** Shared MFA verification panels (passkey / TOTP / recovery) — controlled by the current route panel. */
export function MfaPanels({ status, panel, onPanelChange, onVerified }: Props) {
  const { t } = useT()
  const { user } = useAuthStore()

  // passkey panel state
  const [pkError, setPkError] = useState('')
  const [pkVerifying, setPkVerifying] = useState(true)
  const [pkSuccess, setPkSuccess] = useState(false)
  const pkAttempted = useRef(false)

  // totp panel state
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [remember, setRemember] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(true)
  const [totpSuccess, setTotpSuccess] = useState(false)

  // recovery panel state
  const [rcCode, setRcCode] = useState('')
  const [rcError, setRcError] = useState('')
  const [rcSubmitting, setRcSubmitting] = useState(false)
  const [rcSuccess, setRcSuccess] = useState(false)

  // Reset panel-local state whenever the route-driven panel changes
  useEffect(() => {
    pkAttempted.current = false
    setPkError('')
    setPkVerifying(true)
    setPkSuccess(false)
    setCode('')
    setError('')
    setRcCode('')
    setRcError('')
    setRemember(false)
    setAutoSubmit(true)
    setTotpSuccess(false)
    setRcSuccess(false)
  }, [panel])

  const runPasskey = useCallback(async () => {
    if (!user || pkAttempted.current) return
    pkAttempted.current = true
    setPkVerifying(true)
    setPkError('')
    try {
      const valid = await authenticateWithPasskey(user.id, true)
      if (valid) {
        setPkSuccess(true)
        setPkVerifying(false)
        setTimeout(() => onVerified(), 1500)
      } else {
        setPkError(t('auth.passkeyVerifyFailed'))
        setPkVerifying(false)
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.message?.includes('cancelled') || e?.message?.includes('Cancelled')) {
        setPkError(t('auth.passkeyCancelled'))
      } else {
        setPkError(e?.message || t('auth.passkeyVerifyError'))
      }
      setPkVerifying(false)
    }
  }, [user, remember, onVerified, t])

  useEffect(() => {
    if (panel === 'passkey' && !pkAttempted.current) {
      const timer = setTimeout(() => runPasskey(), 300)
      return () => clearTimeout(timer)
    }
  }, [panel, runPasskey])

  const handleTotp = useCallback(async () => {
    if (code.length !== 6 || isSubmitting) return
    setError('')
    setIsSubmitting(true)
    try {
      const res = await verifyTotp(code, remember)
      if (res.valid) {
        setTotpSuccess(true)
        setTimeout(() => onVerified(), 1200)
      } else {
        // Wrong code once → disable auto-submit, require manual button click
        setAutoSubmit(false)
        setError(t('auth.otpInvalidCode'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, remember, isSubmitting, onVerified, t])

  // Auto-submit once all 6 digits are entered (turns off after one wrong attempt)
  useEffect(() => {
    if (autoSubmit && code.length === 6 && !isSubmitting) handleTotp()
  }, [code, isSubmitting, handleTotp, autoSubmit])

  const handleRecover = useCallback(async () => {
    if (rcCode.length < 14) return
    setRcError('')
    setRcSubmitting(true)
    try {
      const res = await recoverWithCode(rcCode)
      if (res.valid) {
        setRcSuccess(true)
        setTimeout(() => onVerified(), 1200)
      } else {
        setRcError(t('auth.otpInvalidCode'))
      }
    } catch {
      setRcError(t('auth.otpVerifyError'))
    } finally {
      setRcSubmitting(false)
    }
  }, [rcCode, onVerified, t])

  const switchTo = useCallback((p: Panel) => {
    setCode('')
    setError('')
    onPanelChange(p)
  }, [onPanelChange])

  // More Options = available methods except the current panel (GitHub style)
  const moreOptions: { key: string; label: string; icon: React.ReactNode; go: () => void }[] = []
  if (panel !== 'passkey' && status.availableMethods.passkey) {
    moreOptions.push({ key: 'passkey', label: t('auth.passkeyMethod'), icon: <KeyRound className="h-4 w-4" />, go: () => switchTo('passkey') })
  }
  if (panel !== 'totp' && status.availableMethods.totp) {
    moreOptions.push({ key: 'totp', label: t('auth.mfaAuthenticatorApp'), icon: <Smartphone className="h-4 w-4" />, go: () => switchTo('totp') })
  }
  if (panel !== 'recovery' && status.availableMethods.recovery) {
    moreOptions.push({ key: 'recovery', label: t('auth.mfaRecoverCode'), icon: <ShieldAlert className="h-4 w-4" />, go: () => switchTo('recovery') })
  }

  return (
    <div className="flex flex-col">
      {/* key remounts on panel switch → transition animation; min-h keeps the card size stable */}
      <div
        key={panel}
        className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200 flex flex-col items-center justify-center w-full min-h-[210px]"
      >
        {/* ---- passkey panel ---- */}
        {panel === 'passkey' && (
          <div className="flex flex-col items-center gap-4 py-6 w-full">
            {pkVerifying ? (
              <div className="flex flex-col items-center gap-6">
                <div className="relative flex items-center justify-center w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-[passkey-ripple_1.5s_ease-out_infinite]" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-[passkey-ripple_1.5s_ease-out_infinite_0.5s]" />
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-medium text-foreground">{t('auth.passkeyVerifyTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('auth.passkeyWaiting')}</p>
                </div>
              </div>
            ) : pkSuccess ? (
              <div className="flex flex-col items-center gap-6">
                <div className="animate-[passkey-success-pop_0.6s_ease-out] flex items-center justify-center w-20 h-20">
                  <svg className="h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" strokeDasharray="113" strokeDashoffset="113" className="animate-[passkey-check-circle_0.6s_ease-out_0.3s_forwards]" />
                    <path d="M8 12l3 3 5-5" strokeDasharray="48" strokeDashoffset="48" className="animate-[passkey-check-path_0.5s_ease-out_0.9s_forwards]" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('auth.passkeyVerified')}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                  <svg className="h-8 w-8 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                  </svg>
                </div>
                <p className="text-sm text-destructive text-center max-w-xs">{pkError}</p>
                <div className="flex gap-2">
                  <Button onClick={() => { pkAttempted.current = false; runPasskey() }} variant="default" size="sm">
                    {t('auth.passkeyRetry')}
                  </Button>
                  {status.availableMethods.totp && (
                    <Button onClick={() => switchTo('totp')} variant="outline" size="sm">
                      {t('auth.passkeyFallbackToTOTP')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- totp panel ---- */}
        {panel === 'totp' && (
          <div className="flex flex-col items-center gap-4 py-4 w-full">
            {totpSuccess ? (
              <div className="flex flex-col items-center gap-6 py-6">
                <div className="animate-[passkey-success-pop_0.6s_ease-out] flex items-center justify-center w-20 h-20">
                  <svg className="h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" strokeDasharray="113" strokeDashoffset="113" className="animate-[passkey-check-circle_0.6s_ease-out_0.3s_forwards]" />
                    <path d="M8 12l3 3 5-5" strokeDasharray="48" strokeDashoffset="48" className="animate-[passkey-check-path_0.5s_ease-out_0.9s_forwards]" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('auth.passkeyVerified')}</p>
              </div>
            ) : (
              <>
                <InputOtp value={code} onChange={setCode} length={6} disabled={isSubmitting} />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex items-center gap-2">
                  <Checkbox id="mfa-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  <label htmlFor="mfa-remember" className="text-sm text-muted-foreground cursor-pointer">
                    {t('auth.mfaRemember')}
                  </label>
                </div>
                <Button onClick={handleTotp} disabled={code.length !== 6 || isSubmitting} className="w-full">
                  {isSubmitting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      {t('auth.otpVerifying')}
                    </span>
                  ) : t('auth.otpVerify')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ---- recovery panel ---- */}
        {panel === 'recovery' && (
          <div className="flex flex-col items-center gap-4 py-4 w-full">
            {rcSuccess ? (
              <div className="flex flex-col items-center gap-6 py-6">
                <div className="animate-[passkey-success-pop_0.6s_ease-out] flex items-center justify-center w-20 h-20">
                  <svg className="h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" strokeDasharray="113" strokeDashoffset="113" className="animate-[passkey-check-circle_0.6s_ease-out_0.3s_forwards]" />
                    <path d="M8 12l3 3 5-5" strokeDasharray="48" strokeDashoffset="48" className="animate-[passkey-check-path_0.5s_ease-out_0.9s_forwards]" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('auth.passkeyVerified')}</p>
              </div>
            ) : (
              <>
                <Input
                  value={rcCode}
                  onChange={(e) => setRcCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  className="font-mono text-center text-lg tracking-widest"
                  maxLength={14}
                  disabled={rcSubmitting}
                />
                {rcError && <p className="text-sm text-destructive">{rcError}</p>}
                <Button onClick={handleRecover} disabled={rcCode.length < 14 || rcSubmitting} className="w-full">
                  {rcSubmitting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      {t('auth.otpVerifying')}
                    </span>
                  ) : t('auth.otpRecoverBtn')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- More Options ---- */}
      {moreOptions.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-3 text-center">{t('auth.mfaMoreOptions')}</p>
          <div className="flex flex-col gap-2">
            {moreOptions.map((opt) => (
              <Button
                key={opt.key}
                variant="ghost"
                size="sm"
                className="justify-center gap-2 text-sm bg-muted/50 hover:bg-muted w-full"
                onClick={opt.go}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
