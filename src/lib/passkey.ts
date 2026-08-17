import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { supabase } from '@/lib/supabase'
import { getDeviceToken } from '@/lib/mfa'
import { getDeviceInfoSync } from '@/lib/device-info'
import type { PasskeyCredential } from '@/types'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-passkey`

async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function callFn(action: string, payload: Record<string, unknown>) {
  const token = await getToken()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`)
  }
  return res.json()
}

/** Register a new passkey for the current user */
export async function registerPasskey(userId: string, deviceName?: string, platform?: string): Promise<boolean> {
  const options = await callFn('register-begin', { userId })
  if (options.error) throw new Error(options.error)

  const credential = await startRegistration({ optionsJSON: options })

  const result = await callFn('register-complete', { userId, credential, deviceName, platform })
  if (result.error) throw new Error(result.error)

  return result.verified === true
}

/** Authenticate with passkey — returns true if verified. remember=true (default) trusts this device. */
export async function authenticateWithPasskey(userId: string, remember = true): Promise<boolean> {
  const options = await callFn('authenticate-begin', { userId })
  if (options.error) throw new Error(options.error)

  const credential = await startAuthentication({ optionsJSON: options })

  const result = await callFn('authenticate-complete', {
    userId,
    credential,
    remember,
    deviceToken: getDeviceToken(),
    deviceName: getDeviceInfoSync().displayName,
  })
  if (result.error) throw new Error(result.error)

  return result.verified === true
}

/** List user's passkeys */
export async function listPasskeys(userId: string): Promise<PasskeyCredential[]> {
  const data = await callFn('list', { userId })
  return data as PasskeyCredential[]
}

/** Delete a passkey credential */
export async function deletePasskey(userId: string, credentialId: string): Promise<void> {
  await callFn('delete', { userId, credentialId })
}

/** Rename a passkey's display name */
export async function renamePasskey(userId: string, credentialId: string, name: string): Promise<void> {
  await callFn('rename', { userId, credentialId, name })
}
