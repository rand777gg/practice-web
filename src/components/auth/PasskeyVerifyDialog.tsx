import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { authenticateWithPasskey } from '@/lib/passkey'

interface Props {
  open: boolean
  onVerified: () => void
  onFallback?: () => void
}

export function PasskeyVerifyDialog({ open, onVerified, onFallback }: Props) {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(true)
  const [success, setSuccess] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const attemptedRef = useRef(false)

  const handleVerify = useCallback(async () => {
    if (!user || attemptedRef.current) return
    attemptedRef.current = true
    setVerifying(true)
    setError('')

    try {
      const valid = await authenticateWithPasskey(user.id)
      if (valid) {
        setSuccess(true)
        setVerifying(false)
        // Show success checkmark fully, then fade out
        setTimeout(() => {
          setFadingOut(true)
          setTimeout(() => onVerified(), 300)
        }, 1500)
      } else {
        setError(t('auth.passkeyVerifyFailed'))
        setVerifying(false)
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.message?.includes('cancelled') || e?.message?.includes('Cancelled')) {
        setError(t('auth.passkeyCancelled'))
      } else {
        setError(e?.message || t('auth.passkeyVerifyError'))
      }
      setVerifying(false)
    }
  }, [user, onVerified, t])

  useEffect(() => {
    if (open) {
      attemptedRef.current = false
      setError('')
      setVerifying(true)
      setSuccess(false)
    }
  }, [open])

  useEffect(() => {
    if (open && !attemptedRef.current) {
      const timer = setTimeout(() => handleVerify(), 300)
      return () => clearTimeout(timer)
    }
  }, [open, handleVerify])

  const handleRetry = useCallback(() => {
    attemptedRef.current = false
    handleVerify()
  }, [handleVerify])

  const handleLogout = useCallback(async () => {
    await signOut()
  }, [signOut])

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <style>{`[data-radix-dialog-close]{display:none!important}`}</style>

        <div className="transition-opacity duration-300" style={{ opacity: fadingOut ? 0 : 1 }}>
        <DialogHeader>
          <DialogTitle>{t('auth.passkeyVerifyTitle')}</DialogTitle>
          <DialogDescription>{t('auth.passkeyVerifyLoginDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-8">
          {verifying ? (
            <div className="flex flex-col items-center gap-6">
              {/* Ripple container */}
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
          ) : success ? (
            <div className="flex flex-col items-center gap-6">
              {/* Animated checkmark */}
              <div className="animate-[passkey-success-pop_0.6s_ease-out] flex items-center justify-center w-20 h-20">
                <svg className="h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="113" strokeDashoffset="113" className="animate-[passkey-check-circle_0.6s_ease-out_0.3s_forwards]" />
                  <path d="M8 12l3 3 5-5" strokeDasharray="48" strokeDashoffset="48" className="animate-[passkey-check-path_0.5s_ease-out_0.9s_forwards]" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('auth.passkeyVerified')}</p>
              </div>
            </div>
          ) : error ? (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                <svg className="h-8 w-8 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </div>
              <p className="text-sm text-destructive text-center max-w-xs">{error}</p>
              <div className="flex gap-2">
                <Button onClick={handleRetry} variant="default" size="sm">
                  {t('auth.passkeyRetry')}
                </Button>
                {onFallback && (
                  <Button onClick={onFallback} variant="outline" size="sm">
                    {t('auth.passkeyFallbackToTOTP')}
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>

        </div>
        <div className="border-t pt-4 text-center">
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            {t('auth.logout')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
