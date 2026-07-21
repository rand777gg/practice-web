import { getDeviceInfo } from '@/lib/device-info'

export const DEVICE_ID_KEY = 'otp_device_id'
export const TRUST_KEY = 'otp_trusted_until'

export interface TrustInfo {
  deviceId: string
  deviceName: string
  expiresAt: number
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getTrustInfo(): TrustInfo | null {
  try {
    const raw = localStorage.getItem(TRUST_KEY)
    if (!raw) return null
    const { deviceId, deviceName, expiresAt } = JSON.parse(raw)
    if (!deviceId || !expiresAt) return null
    return { deviceId, deviceName: deviceName || '', expiresAt }
  } catch {
    return null
  }
}

export function isDeviceTrusted(): boolean {
  const info = getTrustInfo()
  if (!info) return false
  const currentId = getDeviceId()
  return info.deviceId === currentId && info.expiresAt > Date.now()
}

export async function setTrustInfo(deviceId: string, expiresAt: number): Promise<void> {
  const { displayName } = await getDeviceInfo()
  localStorage.setItem(TRUST_KEY, JSON.stringify({ deviceId, deviceName: displayName, expiresAt }))
}

export function clearDeviceTrust(): void {
  localStorage.removeItem(TRUST_KEY)
}

export async function trustDeviceRemote(userId: string, deviceId: string): Promise<void> {
  const { displayName } = await getDeviceInfo()
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
  await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action: 'trust', userId, deviceId, deviceName: displayName }),
  })
}
