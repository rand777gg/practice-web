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
  if (!token) throw new Error('not authenticated')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'status', deviceToken: getDeviceToken() }),
  })
  // A failed lookup (401 once the session was revoked elsewhere, 429 from the function's rate
  // limiter, 5xx) must never be read as "this account has no MFA". The all-false default made a
  // signed-in user look like an un-onboarded new account and bounced them to /guide.
  if (!res.ok) throw new Error(`mfa status failed: ${res.status}`)
  const data = await res.json().catch(() => null)
  if (!data || typeof data.needsMfa !== 'boolean' || typeof data.availableMethods !== 'object' || data.availableMethods === null) {
    throw new Error('mfa status malformed')
  }
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
  if (!token) throw new Error('not authenticated')
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
  if (!token) throw new Error('not authenticated')
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
