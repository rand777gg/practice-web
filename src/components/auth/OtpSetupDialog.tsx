import { useState, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { InputOtp } from '@/components/ui/input-otp'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { generateSecret, generateURI, verify } from 'otplib'
import { toDataURL } from 'qrcode'

const APP_NAME = 'PracticeWeb'

interface Props {
  open: boolean
  onSetupComplete: () => void
}

export function OtpSetupDialog({ open, onSetupComplete }: Props) {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const [step, setStep] = useState<'setup' | 'verify'>('setup')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open && user?.email) {
      const sec = generateSecret()
      setSecret(sec)
      const url = generateURI({ issuer: APP_NAME, label: user.email, secret: sec })
      toDataURL(url, { width: 200, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setError('Failed to generate QR code'))
      setCode('')
      setError('')
      setStep('setup')
    }
  }, [open, user?.email])

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || !user) return
    setError('')
    setIsSubmitting(true)

    try {
      // Client-side verify first to confirm the setup
      const result = await verify({ secret, token: code })
      if (!result.valid) {
        setError(t('auth.otpInvalidCode'))
        setIsSubmitting(false)
        return
      }

      // Store secret via Edge Function
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: 'setup', userId: user.id, secret, code }),
      })
      const data = await res.json()
      if (data.valid) {
        onSetupComplete()
      } else {
        setError(t('auth.otpVerifyError'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, user, secret, t])

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
        {/* Hide the default close button since this dialog is not dismissable */}
        <style>{`[data-radix-dialog-close]{display:none!important}`}</style>

        {step === 'setup' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('auth.otpSetupTitle')}</DialogTitle>
              <DialogDescription>{t('auth.otpSetupDesc')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="OTP QR Code" className="rounded-lg border" width={200} height={200} />
              ) : (
                <Spinner />
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('auth.otpManualKey')}</p>
                <code className="rounded bg-muted px-2 py-1 text-sm font-mono select-all">{secret}</code>
              </div>
              <Button onClick={() => setStep('verify')} className="w-full">
                {t('auth.otpNext')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('auth.otpVerifyTitle')}</DialogTitle>
              <DialogDescription>{t('auth.otpVerifyDesc')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <InputOtp value={code} onChange={setCode} length={6} disabled={isSubmitting} />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                onClick={handleVerify}
                disabled={code.length !== 6 || isSubmitting}
                className="w-full"
              >
                {isSubmitting ? t('auth.otpVerifying') : t('auth.otpVerify')}
              </Button>
              <Button variant="link" size="sm" onClick={() => { setStep('setup'); setCode(''); setError('') }}>
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        <div className="border-t pt-4 text-center">
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            {t('auth.logout')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
