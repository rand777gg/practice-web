import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { InputOtp } from '@/components/ui/input-otp'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDeviceId, setTrustInfo, trustDeviceRemote } from '@/lib/otp-trust'

async function verifyOtp(userId: string, code: string): Promise<boolean> {
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action: 'verify', userId, code }),
  })
  const data = await res.json()
  return data.valid === true
}

interface Props {
  open: boolean
  onVerified: () => void
}

export function OtpVerifyDialog({ open, onVerified }: Props) {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [trustThisDevice, setTrustThisDevice] = useState(false)

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || !user) return
    setError('')
    setIsSubmitting(true)

    try {
      const valid = await verifyOtp(user.id, code)
      if (valid) {
        if (trustThisDevice) {
          const deviceId = await getDeviceId()
          const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
          await setTrustInfo(deviceId, expiresAt)
          trustDeviceRemote(user.id, deviceId).catch(() => {})
        }
        setCode('')
        onVerified()
      } else {
        setError(t('auth.otpInvalidCode'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, user, trustThisDevice, onVerified, t])

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
          <DialogTitle>{t('auth.otpVerifyTitle')}</DialogTitle>
          <DialogDescription>{t('auth.otpVerifyLoginDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <InputOtp value={code} onChange={setCode} length={6} disabled={isSubmitting} />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Checkbox
              id="trust-device"
              checked={trustThisDevice}
              onCheckedChange={(v) => setTrustThisDevice(v === true)}
            />
            <label htmlFor="trust-device" className="text-sm text-muted-foreground cursor-pointer">
              {t('auth.otpTrustDevice')}
            </label>
          </div>

          <Button
            onClick={handleVerify}
            disabled={code.length !== 6 || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t('auth.otpVerifying') : t('auth.otpVerify')}
          </Button>
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

export { isDeviceTrusted } from '@/lib/otp-trust'
