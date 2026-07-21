import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDeviceId, clearDeviceTrust } from '@/lib/otp-trust'
import { DeviceLabel } from '@/components/ui/device-label'

interface TrustedDevice {
  id: string
  user_id: string
  device_id: string
  device_name: string | null
  expires_at: string
  created_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TrustedDevicesDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user } = useAuthStore()
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const currentDeviceId = getDeviceId()

  const fetchDevices = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('user_trusted_devices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setDevices((data as TrustedDevice[]) || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (open) fetchDevices()
  }, [open, fetchDevices])

  const handleRevoke = useCallback(async (deviceId: string) => {
    if (!user) return
    setRevoking(deviceId)
    await supabase
      .from('user_trusted_devices')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
    // If revoking current device, clear local trust too
    if (deviceId === currentDeviceId) {
      clearDeviceTrust()
    }
    setDevices((prev) => prev.filter((d) => d.device_id !== deviceId))
    setRevoking(null)
  }, [user, currentDeviceId])

  function formatDeviceLabel(d: TrustedDevice): string {
    return d.device_name || `Device ${d.device_id.slice(0, 8)}…`
  }

  const isCurrentDevice = (id: string) => id === currentDeviceId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('auth.otpTrustedDevices')}</DialogTitle>
          <DialogDescription>
            {t('auth.otpTrustExpires')} 7 {t('auth.otpVerifyDesc') ? '' : 'days'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('common.loading')}</p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('auth.otpNoTrustedDevices')}</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <DeviceLabel
                      deviceName={formatDeviceLabel(d)}
                      className="text-sm font-medium"
                      iconClassName="text-muted-foreground"
                    />
                      {isCurrentDevice(d.device_id) && (
                        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {t('auth.otpCurrentDevice')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('auth.otpTrustedSince')}: {new Date(d.created_at).toLocaleDateString()}
                      {' · '}
                      {t('auth.otpTrustExpires')}: {new Date(d.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                    disabled={revoking === d.device_id}
                    onClick={() => handleRevoke(d.device_id)}
                  >
                    {revoking === d.device_id ? '…' : t('auth.otpRevokeDevice')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
