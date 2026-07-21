import { useState, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription as AlertDesc,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertTitle,
} from '@/components/ui/alert-dialog'
import { registerPasskey, listPasskeys, deletePasskey } from '@/lib/passkey'
import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@iconify/react'
import type { PasskeyCredential } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered?: () => void
}

export function PasskeySetupDialog({ open, onOpenChange, onRegistered }: Props) {
  const { t } = useT()
  const { user } = useAuthStore()
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [loading, setLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const fetchPasskeys = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await listPasskeys(user.id)
      setPasskeys(list)
    } catch { /* ignore */ }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (open) {
      setError('')
      setSuccess(false)
      fetchPasskeys()
    }
  }, [open, fetchPasskeys])

  const handleRegister = useCallback(async () => {
    if (!user) return
    setRegistering(true)
    setError('')
    try {
      await registerPasskey(user.id)
      setSuccess(true)
      await fetchPasskeys()
      onRegistered?.()
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        setError(t('auth.passkeyCancelled'))
      } else if (e?.name === 'SecurityError') {
        setError(t('auth.passkeySecurityError'))
      } else if (e?.message) {
        setError(e.message)
      } else {
        setError(t('auth.passkeyRegisterError'))
      }
    }
    setRegistering(false)
  }, [user, fetchPasskeys, onRegistered, t])

  const handleDelete = useCallback(async () => {
    if (!user || !deleteTarget) return
    await deletePasskey(user.id, deleteTarget)
    setPasskeys((prev) => prev.filter((p) => p.id !== deleteTarget))
    setDeleteTarget(null)
  }, [user, deleteTarget])

  const deviceIcon = (name: string | null) => {
    if (!name) return 'mdi:key-chain'
    if (name.includes('Platform')) return 'mdi:laptop'
    if (name.includes('Security Key')) return 'mdi:usb-flash-drive'
    return 'mdi:key-chain'
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.passkeySetupTitle')}</DialogTitle>
            <DialogDescription>{t('auth.passkeySetupDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                {t('auth.passkeyRegistered')}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Registered passkeys list */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('auth.passkeySavedDevices')}</p>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : passkeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('auth.passkeyNoDevices')}</p>
              ) : (
                <div className="space-y-1.5">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon icon={deviceIcon(pk.device_name)} className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{pk.device_name || 'Passkey'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(pk.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0 ml-2"
                        onClick={() => setDeleteTarget(pk.id)}
                      >
                        {t('auth.passkeyRemove')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleRegister}
              disabled={registering}
              className="w-full gap-2"
            >
              {registering ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon icon="mdi:key-chain" className="h-4 w-4" />
              )}
              {registering ? t('auth.passkeyRegistering') : t('auth.passkeyRegister')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertTitle>{t('auth.passkeyRemoveTitle')}</AlertTitle>
            <AlertDesc>{t('auth.passkeyRemoveDesc')}</AlertDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
