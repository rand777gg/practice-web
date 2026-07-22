import { getFingerprint, getDeviceDetail, getFpComponents } from '@/lib/device-info'

export const DEVICE_ID_KEY = 'otp_device_id'
export const TRUST_KEY = 'otp_trusted_until'

export interface TrustInfo {
  deviceId: string
  deviceName: string
  expiresAt: number
}

export async function getDeviceId(): Promise<string> {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = await getFingerprint()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getDeviceIdSync(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY)
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
  const currentId = localStorage.getItem(DEVICE_ID_KEY)
  return currentId != null && info.deviceId === currentId && info.expiresAt > Date.now()
}

export async function setTrustInfo(deviceId: string, expiresAt: number): Promise<void> {
  const detail = await getDeviceDetail()
  localStorage.setItem(TRUST_KEY, JSON.stringify({
    deviceId,
    deviceName: detail.displayName,
    expiresAt,
  }))
}

export function clearDeviceTrust(): void {
  localStorage.removeItem(TRUST_KEY)
}

export async function trustDeviceRemote(_userId: string, deviceId: string): Promise<void> {
  const detail = await getDeviceDetail()
  const components = getFpComponents() || {}
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || ''
  await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'trust',
      deviceId,
      deviceName: detail.displayName,
      deviceInfo: { ...components, os: detail.os, browser: detail.browser },
    }),
  })
}
