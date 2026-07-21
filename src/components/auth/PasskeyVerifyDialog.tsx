import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { authenticateWithPasskey } from '@/lib/passkey'
import { Icon } from '@iconify/react'

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
  const attemptedRef = useRef(false)

  const handleVerify = useCallback(async () => {
    if (!user || attemptedRef.current) return
    attemptedRef.current = true
    setVerifying(true)
    setError('')

    try {
      const valid = await authenticateWithPasskey(user.id)
      if (valid) {
        onVerified()
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
    }
  }, [open])

  useEffect(() => {
    if (open && !attemptedRef.current) {
      // Small delay to ensure dialog is rendered before triggering WebAuthn
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

        <DialogHeader>
          <DialogTitle>{t('auth.passkeyVerifyTitle')}</DialogTitle>
          <DialogDescription>{t('auth.passkeyVerifyLoginDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          {verifying ? (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <Icon icon="mdi:key-chain" className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">{t('auth.passkeyWaiting')}</p>
            </>
          ) : error ? (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                <Icon icon="mdi:alert-circle" className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive text-center">{error}</p>
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

        <div className="border-t pt-4 text-center">
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            {t('auth.logout')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
