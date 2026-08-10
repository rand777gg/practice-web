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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { generateSecret, generateURI, verify } from 'otplib'
import { toDataURL } from 'qrcode'
import { supabase } from '@/lib/supabase'
import { Copy, Check } from 'lucide-react'

const APP_NAME = 'PracticeWeb'

interface Props {
  open: boolean
  onSetupComplete: () => void
}

export function OtpSetupDialog({ open, onSetupComplete }: Props) {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const [step, setStep] = useState<'setup' | 'verify' | 'recovery'>('setup')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

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
      setRecoveryCodes([])
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
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'setup', secret, code }),
      })
      const data = await res.json()
      if (data.valid) {
        setRecoveryCodes(data.recoveryCodes || [])
        setStep('recovery')
      } else {
        setError(t('auth.otpVerifyError'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, user, secret, t])

  const handleCopyCode = useCallback(async (code: string, index: number) => {
    await navigator.clipboard.writeText(code)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const handleConfirmSave = useCallback(() => {
    setConfirmOpen(false)
    onSetupComplete()
  }, [onSetupComplete])

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

        {step === 'setup' && (
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
        )}

        {step === 'verify' && (
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

        {step === 'recovery' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('auth.otpRecoveryTitle')}</DialogTitle>
              <DialogDescription>{t('auth.otpRecoveryDesc')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((rc, i) => (
                  <div key={i} className="flex items-center gap-1 rounded border bg-muted/50 px-2 py-1.5">
                    <code className="text-xs font-mono flex-1 select-all">{rc}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleCopyCode(rc, i)}
                      title="Copy"
                    >
                      {copiedIndex === i ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-destructive font-medium text-center">{t('auth.otpRecoveryWarning')}</p>
              <Button
                onClick={() => setConfirmOpen(true)}
                className="w-full"
              >
                {t('auth.otpRecoverySaved')}
              </Button>
              <Button variant="link" size="sm" onClick={() => { setStep('verify'); setCode(''); setError('') }}>
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth.otpRecoveryConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('auth.otpRecoveryConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleConfirmSave}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
