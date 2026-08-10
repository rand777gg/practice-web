import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'

interface Props {
  open: boolean
  onVerified: () => void
  onBack: () => void
}

async function verifyRecoveryCode(code: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || ''
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'recover', code }),
  })
  const data = await res.json()
  return data.valid === true
}

export function RecoveryCodeDialog({ open, onVerified, onBack }: Props) {
  const { t } = useT()
  const { signOut } = useAuthStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRecover = useCallback(async () => {
    setError('')
    setIsSubmitting(true)
    try {
      const valid = await verifyRecoveryCode(code)
      if (valid) {
        onVerified()
      } else {
        setError(t('auth.otpInvalidCode'))
      }
    } catch {
      setError(t('auth.otpVerifyError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [code, onVerified, t])

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
          <DialogTitle>{t('auth.otpRecoveryDialogTitle')}</DialogTitle>
          <DialogDescription>{t('auth.otpRecoveryDialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            className="font-mono text-center text-lg tracking-widest"
            maxLength={14}
            disabled={isSubmitting}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleRecover}
            disabled={code.length < 14 || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t('auth.otpVerifying') : t('auth.otpRecoverBtn')}
          </Button>

          <Button variant="link" size="sm" onClick={onBack}>
            {t('common.cancel')}
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
