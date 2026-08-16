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
import { registerPasskey, listPasskeys, deletePasskey, renamePasskey } from '@/lib/passkey'
import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@/lib/icons'
import { Pencil, Check, X } from 'lucide-react'
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
  const [deviceName, setDeviceName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [renaming, setRenaming] = useState(false)

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
      const ua = navigator.userAgent
      let platform = ''
      if (/Windows/i.test(ua)) platform = 'Windows'
      else if (/Mac OS X/i.test(ua)) platform = 'macOS'
      else if (/Android/i.test(ua)) platform = 'Android'
      else if (/Linux/i.test(ua) && !/Android/i.test(ua)) platform = 'Linux'
      else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS'
      else platform = 'Unknown'

      await registerPasskey(user.id, deviceName.trim() || undefined, platform)
      setSuccess(true)
      setDeviceName('')
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
  }, [user, fetchPasskeys, onRegistered, t, deviceName])

  const handleDelete = useCallback(async () => {
    if (!user || !deleteTarget) return
    await deletePasskey(user.id, deleteTarget)
    setPasskeys((prev) => prev.filter((p) => p.id !== deleteTarget))
    setDeleteTarget(null)
  }, [user, deleteTarget])

  const startRename = useCallback((pk: PasskeyCredential) => {
    setEditingId(pk.id)
    setEditName(pk.device_name || '')
  }, [])

  const handleRename = useCallback(async () => {
    if (!user || !editingId) return
    const name = editName.trim()
    if (!name) return
    setRenaming(true)
    try {
      await renamePasskey(user.id, editingId, name)
      setPasskeys((prev) => prev.map((p) => (p.id === editingId ? { ...p, device_name: name } : p)))
    } catch {
      /* ignore */
    }
    setRenaming(false)
    setEditingId(null)
  }, [user, editingId, editName])

  const platformIcon = (p: string | null) => {
    if (!p) return 'mingcute:computer-line'
    if (p === 'Windows') return 'devicon:windows11'
    if (p === 'macOS') return 'catppuccin:macos'
    if (p === 'Android') return 'catppuccin:android'
    if (p === 'Linux') return 'selfhst:linux'
    if (p === 'iOS') return 'mingcute:ios-fill'
    return 'mingcute:computer-line'
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

            {/* Device name input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('auth.passkeyDeviceNamePlaceholder') || '为这个设备起个名字...'}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                maxLength={50}
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button
                onClick={handleRegister}
                disabled={registering}
                className="gap-2 shrink-0"
              >
                {registering ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon icon="mdi:key-chain" className="h-4 w-4" />
                )}
                {registering ? t('auth.passkeyRegistering') : t('auth.passkeyRegister')}
              </Button>
            </div>

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
                      {editingId === pk.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={50}
                            autoFocus
                            className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
                          />
                          <Button
                            variant="outline" size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={handleRename}
                            disabled={renaming || !editName.trim()}
                            title={t('common.confirm')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 shrink-0 text-muted-foreground"
                            onClick={() => setEditingId(null)}
                            title={t('common.cancel')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon icon={platformIcon(pk.platform)} className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm truncate">{pk.device_name || 'Passkey'}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(pk.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 ml-2">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startRename(pk)}
                              title={t('auth.passkeyRename')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(pk.id)}
                            >
                              {t('auth.passkeyRemove')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
