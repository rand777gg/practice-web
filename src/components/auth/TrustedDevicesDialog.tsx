import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { getDeviceTokenSync, clearDeviceToken } from '@/lib/mfa'
import { DeviceLabel } from '@/components/ui/device-label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChevronDown, Pencil, Check, X } from 'lucide-react'

// --- Types ---

interface TrustedDevice {
  id: string; user_id: string; device_id: string
  device_name: string | null; custom_name: string | null
  device_info: Record<string, any> | null
  expires_at: string; created_at: string
}

// --- Editable device name ---

const DeviceName = memo(function DeviceName({ device, onRename }: {
  device: TrustedDevice; onRename: (id: string, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(device.custom_name || '')

  const save = useCallback(() => {
    const trimmed = value.trim()
    setEditing(false)
    if (trimmed !== (device.custom_name || '')) {
      onRename(device.id, trimmed)
    }
  }, [value, device.custom_name, device.id, onRename])

  const cancel = useCallback(() => {
    setEditing(false)
    setValue(device.custom_name || '')
  }, [device.custom_name])

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-6 w-28 text-xs"
          placeholder="My Device"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={save}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel}>
          <X className="h-3 w-3" />
        </Button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 group">
      <span className="text-xs font-medium">
        {device.custom_name || `Device ${device.device_id.slice(0, 6)}`}
      </span>
      <Button
        size="icon" variant="ghost"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setValue(device.custom_name || ''); setEditing(true) }}
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </Button>
    </span>
  )
})

// Fields we always show at the top (metadata, not from FPJS)
const META_KEYS = ['ip', 'os', 'browser']

// Fields to skip (internal / uninteresting)
const SKIP_KEYS = new Set(['confidence'])

function isSkipKey(k: string) {
  return SKIP_KEYS.has(k) || META_KEYS.includes(k)
}

function formatVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return v < 1 && v > 0 ? `${Math.round(v * 100)}%` : String(v)
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

function fieldLabel(key: string, t: (k: string) => string): string {
  const tk = `device.${key}`
  const translated = t(tk)
  return translated !== tk ? translated : key
}

const DetailSkeleton = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-5 rounded-full" />
      <Skeleton className="h-5 w-5 rounded-full" />
      <Skeleton className="h-5 w-32" />
    </div>
    <Skeleton className="h-4 w-48" />
    <div className="space-y-2 pt-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  </div>
)

// --- Right / Bottom panel ---

const DeviceDetailPanel = memo(function DeviceDetailPanel({ device, onRename, onRevoke, revoking }: {
  device: TrustedDevice | null; onRename: (id: string, name: string) => void
  onRevoke: () => void; revoking: boolean
}) {
  const { t } = useT()

  if (!device) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
        {t('auth.otpNoDeviceSelected')}
      </div>
    )
  }

  const info = device.device_info || {}
  const entries = Object.entries(info).filter(([k, v]) => v != null && !isSkipKey(k))

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <DeviceName device={device} onRename={onRename} />
          <DeviceLabel deviceName={device.device_name} className="text-sm font-semibold" />
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0"
          disabled={revoking}
          onClick={onRevoke}
        >
          {revoking ? '…' : t('auth.otpRevokeDevice')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <span>{new Date(device.created_at).toLocaleString()}</span>
        <span>→ {new Date(device.expires_at).toLocaleString()}</span>
      </div>

      {/* Three-line table for all details */}
      <div className="border-t pt-3">
        <div className="overflow-auto">
          <Table>
            <TableBody>
              {META_KEYS.map(k => {
                const v = info[k]
                if (v == null) return null
                return (
                  <TableRow key={k}>
                    <TableCell className="text-muted-foreground text-xs w-[140px]">{fieldLabel(k, t)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatVal(v)}</TableCell>
                  </TableRow>
                )
              })}
              {entries.map(([key, val]) => {
                const v = val?.value !== undefined ? val.value : val
                if (v == null || val?.error) return null
                return (
                  <TableRow key={key}>
                    <TableCell className="text-muted-foreground text-xs w-[140px]">{fieldLabel(key, t)}</TableCell>
                    <TableCell className="font-mono text-xs break-all" title={formatVal(v)}>{formatVal(v)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
})

// --- List item ---

const DeviceListItem = memo(function DeviceListItem({
  device, isActive, isCurrent, onSelect, onRename,
}: {
  device: TrustedDevice; isActive: boolean; isCurrent: boolean
  onSelect: () => void; onRename: (id: string, name: string) => void
}) {
  const { t } = useT()

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 cursor-pointer transition-colors shrink-0',
        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <DeviceName device={device} onRename={onRename} />
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {t('auth.otpCurrentDevice')}
              </span>
            )}
          </div>
          <DeviceLabel deviceName={device.device_name} className="text-sm" />
        </div>
      </div>
    </div>
  )
})

// --- Main Dialog ---

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function TrustedDevicesDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user, signOut } = useAuthStore()
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ deviceId: string; isCurrent: boolean } | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const currentDeviceId = getDeviceTokenSync() || ''

  const fetchDevices = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('user_trusted_devices').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    const list = (data as TrustedDevice[]) || []
    setDevices(list)
    setLoading(false)
    if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id)
  }, [user])

  useEffect(() => { if (open) { setSelectedId(null); fetchDevices() } }, [open, fetchDevices])

  const selected = devices.find((d) => d.id === selectedId) || null

  const handleRename = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    await supabase.from('user_trusted_devices').update({ custom_name: trimmed || null }).eq('id', id)
    setDevices((prev) => prev.map((d) => d.id === id ? { ...d, custom_name: trimmed || null } : d))
  }, [])

  const handleAskRevoke = useCallback((deviceId: string) => {
    setRevokeTarget({ deviceId, isCurrent: deviceId === currentDeviceId })
  }, [currentDeviceId])

  const confirmRevoke = useCallback(async () => {
    if (!user || !revokeTarget) return
    const { deviceId, isCurrent } = revokeTarget
    setRevokeTarget(null)
    setRevoking(deviceId)
    await supabase.from('user_trusted_devices').delete().eq('user_id', user.id).eq('device_id', deviceId)
    if (isCurrent) {
      clearDeviceToken()
      signOut()
      return
    }
    setDevices((prev) => {
      const next = prev.filter((d) => d.device_id !== deviceId)
      if (selectedIdRef.current && !next.find((d) => d.id === selectedIdRef.current)) {
        setSelectedId(next[0]?.id || null)
      }
      return next
    })
    setRevoking(null)
  }, [user, revokeTarget])

  const selectHandlers = useRef<Map<string, () => void>>(new Map())
  const revokeHandlers = useRef<Map<string, () => void>>(new Map())

  const getSelectHandler = useCallback((id: string) => {
    let h = selectHandlers.current.get(id)
    if (!h) { h = () => setSelectedId(id); selectHandlers.current.set(id, h) }
    return h
  }, [])
  const getRevokeHandler = useCallback((deviceId: string) => {
    let h = revokeHandlers.current.get(deviceId)
    if (!h) { h = () => handleAskRevoke(deviceId); revokeHandlers.current.set(deviceId, h) }
    return h
  }, [handleAskRevoke])

  useEffect(() => {
    const ids = new Set(devices.map((d) => d.device_id))
    for (const key of selectHandlers.current.keys()) { if (!ids.has(key)) selectHandlers.current.delete(key) }
    for (const key of revokeHandlers.current.keys()) { if (!ids.has(key)) revokeHandlers.current.delete(key) }
  }, [devices])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('auth.otpTrustedDevices')}</DialogTitle>
        </DialogHeader>

        {/* Mobile: dropdown device picker */}
        {!loading && devices.length > 0 && (
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                  <DeviceLabel deviceName={selected?.device_name} iconOnly={false} className="text-xs" />
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[calc(100vw-3rem)] max-w-sm">
                {devices.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={getSelectHandler(d.id)} className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">
                          {d.custom_name || `Device ${d.device_id.slice(0, 6)}`}
                        </span>
                        {d.device_id === currentDeviceId && (
                          <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {t('auth.otpCurrentDevice')}
                          </span>
                        )}
                      </div>
                      <DeviceLabel deviceName={d.device_name} className="text-sm" />
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                      disabled={revoking === d.device_id}
                      onClick={(e) => { e.stopPropagation(); getRevokeHandler(d.device_id)() }}
                    >
                      {revoking === d.device_id ? '…' : t('auth.otpRevokeDevice')}
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator className="my-3" />
          </div>
        )}

        {/* Desktop: left list + detail */}
        <div className="hidden sm:flex gap-0 min-h-0 flex-1">
          {/* List */}
          <div className="w-[320px] shrink-0 overflow-y-auto max-h-[60vh] pr-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('auth.otpNoTrustedDevices')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {devices.map((d) => (
                  <DeviceListItem
                    key={d.id} device={d}
                    isActive={d.id === selectedId}
                    isCurrent={d.device_id === currentDeviceId}
                    onSelect={getSelectHandler(d.id)}
                    onRename={handleRename}
                  />
                ))}
              </div>
            )}
          </div>

          <Separator orientation="vertical" className="h-auto mx-3" />

          {/* Detail */}
          <div className="flex-1 min-w-0 overflow-y-auto max-h-[60vh]">
            {loading ? <DetailSkeleton /> : <DeviceDetailPanel device={selected} onRename={handleRename} onRevoke={() => selected && handleAskRevoke(selected.device_id)} revoking={selected ? revoking === selected.device_id : false} />}
          </div>
        </div>

        {/* Mobile: list below dropdown, detail below that */}
        <div className="sm:hidden flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto">
          {loading ? <DetailSkeleton /> : <DeviceDetailPanel device={selected} onRename={handleRename} onRevoke={() => selected && handleAskRevoke(selected.device_id)} revoking={selected ? revoking === selected.device_id : false} />}
        </div>
      </DialogContent>

      <AlertDialog open={revokeTarget != null} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth.otpRevokeDevice')}</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.isCurrent
                ? '撤销当前设备的信任后，你需要退出登录。下次登录将需要重新输入验证码。确定撤销吗？'
                : '撤销该设备的信任后，该设备下次登录将需要重新输入验证码。确定撤销吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke}>确定撤销</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}