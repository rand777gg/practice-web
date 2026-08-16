import { supabase } from '@/lib/supabase'
import { getDeviceInfoSync } from '@/lib/device-info'

export interface AvailableMethods {
  passkey: boolean
  totp: boolean
  recovery: boolean
}

export interface MfaStatus {
  needsMfa: boolean
  sessionVerified: boolean
  deviceTrusted: boolean
  deviceExpiresAt: string | null
  graceUntil: string | null
  validityDays: number
  onboarded: boolean
  role: 'admin' | 'user'
  availableMethods: AvailableMethods
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-totp`
const DEVICE_TOKEN_KEY = 'mfa_device_token'

// --- Device token (random opaque secret, NOT a fingerprint) ---

export function getDeviceTokenSync(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY)
  } catch {
    return null
  }
}

export function getDeviceToken(): string {
  const existing = getDeviceTokenSync()
  if (existing) return existing
  const token = crypto.randomUUID()
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  } catch { /* noop */ }
  return token
}

export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY)
  } catch { /* noop */ }
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

/** Server-authoritative MFA gate decision — device trust is validated server-side. */
export async function getMfaStatus(): Promise<MfaStatus> {
  const token = await getToken()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'status', deviceToken: getDeviceToken() }),
  })
  const data = await res.json()
  return {
    needsMfa: data.needsMfa === true,
    sessionVerified: data.sessionVerified === true,
    deviceTrusted: data.deviceTrusted === true,
    deviceExpiresAt: data.deviceExpiresAt ?? null,
    graceUntil: data.graceUntil ?? null,
    validityDays: data.validityDays ?? 7,
    onboarded: data.onboarded === true,
    role: data.role === 'admin' ? 'admin' : 'user',
    availableMethods: {
      passkey: data.availableMethods?.passkey === true,
      totp: data.availableMethods?.totp === true,
      recovery: data.availableMethods?.recovery === true,
    },
  }
}

/** Verify a TOTP code; on success the server marks this session (L1) and optionally trusts this device. */
export async function verifyTotp(code: string, remember: boolean): Promise<{ valid: boolean; deviceExpiresAt: string | null }> {
  const token = await getToken()
  const deviceName = remember ? getDeviceInfoSync().displayName : undefined
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'verify', code, remember, deviceToken: getDeviceToken(), deviceName }),
  })
  return res.json()
}

/** Verify a recovery code and disable TOTP. */
export async function recoverWithCode(code: string): Promise<{ valid: boolean }> {
  const token = await getToken()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'recover', code }),
  })
  return res.json()
}

/** Mark onboarding as done (new-user full-screen guide skipped/completed). */
export async function completeOnboarding(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id)
}
