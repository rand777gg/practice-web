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
import { Input } from '@/components/ui/input'
import { generateSecret, generateURI, verify } from 'otplib'
import { toDataURL } from 'qrcode'
import { supabase } from '@/lib/supabase'
import { Copy, Check } from 'lucide-react'

const APP_NAME = 'PracticeWeb'

interface Props {
  open: boolean
  hasCurrentTotp?: boolean
  onSetupComplete: () => void
  onCancel?: () => void
}

export function OtpSetupDialog({ open, hasCurrentTotp = false, onSetupComplete, onCancel }: Props) {
  const { t } = useT()
  const { user } = useAuthStore()
  const [step, setStep] = useState<'setup' | 'verify' | 'recovery'>('setup')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [currentCode, setCurrentCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(true)
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
      setCurrentCode('')
      setRecoveryCode('')
      setError('')
      setStep('setup')
      setRecoveryCodes([])
      setAutoSubmit(true)
    }
  }, [open, user?.email])

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || !user || isSubmitting) return
    if (hasCurrentTotp && currentCode.length !== 6 && recoveryCode.length !== 14) return
    setError('')
    setIsSubmitting(true)

    try {
      // Client-side verify first to confirm the setup
      const result = await verify({ secret, token: code, epochTolerance: 30 })
      if (!result.valid) {
        setAutoSubmit(false)
        setError(t('auth.otpInvalidCode'))
        setIsSubmitting(false)
        return
      }

      // Store secret via Edge Function
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
      const body: Record<string, unknown> = { action: 'setup', secret, code }
      if (hasCurrentTotp) {
        body.currentCode = currentCode || undefined
        body.recoveryCode = recoveryCode || undefined
      }
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.valid) {
        setRecoveryCodes(data.recoveryCodes || [])
        setStep('recovery')
      } else if (data.error === 'current-factor-required') {
        setAutoSubmit(false)
        setError(t('auth.otpReplaceInvalid'))
      } else {
        setAutoSubmit(false)
        setError(t('auth.otpVerifyError'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, currentCode, recoveryCode, hasCurrentTotp, user, secret, isSubmitting, t])

  // Auto-submit once all 6 digits are entered (turns off after one wrong attempt);
  // when replacing an existing authenticator the current-factor fields are required too.
  useEffect(() => {
    if (step === 'verify' && autoSubmit && !hasCurrentTotp && code.length === 6 && !isSubmitting) handleVerify()
  }, [step, code, isSubmitting, handleVerify, autoSubmit, hasCurrentTotp])

  const handleCopyCode = useCallback(async (code: string, index: number) => {
    await navigator.clipboard.writeText(code)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const handleConfirmSave = useCallback(() => {
    setConfirmOpen(false)
    onSetupComplete()
  }, [onSetupComplete])

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-md z-[130]"
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
              <DialogDescription>{hasCurrentTotp ? t('auth.otpReplaceDesc') : t('auth.otpVerifyDesc')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4 w-full">
              <InputOtp value={code} onChange={setCode} length={6} disabled={isSubmitting} />
              {hasCurrentTotp && (
                <>
                  <div className="w-full space-y-1.5 text-left">
                    <label className="text-xs text-muted-foreground">{t('auth.otpCurrentCodeLabel')}</label>
                    <InputOtp value={currentCode} onChange={setCurrentCode} length={6} disabled={isSubmitting} />
                  </div>
                  <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    {t('auth.otpOr')}
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="w-full space-y-1.5 text-left">
                    <label className="text-xs text-muted-foreground">{t('auth.otpRecoveryCodeLabel')}</label>
                    <Input
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX-XXXX"
                      maxLength={14}
                      disabled={isSubmitting}
                      className="font-mono text-center tracking-widest"
                    />
                  </div>
                </>
              )}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                onClick={handleVerify}
                disabled={code.length !== 6 || isSubmitting || (hasCurrentTotp && currentCode.length !== 6 && recoveryCode.length !== 14)}
                className="w-full"
              >
                {isSubmitting ? t('auth.otpVerifying') : t('auth.otpVerify')}
              </Button>
              <Button variant="link" size="sm" onClick={() => { setStep('setup'); setCode(''); setCurrentCode(''); setRecoveryCode(''); setError(''); setAutoSubmit(true) }}>
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
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('auth.obBack')}
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[140]">
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
