import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import type { PasskeyCredential } from '@/types'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-passkey`
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

async function callFn(action: string, payload: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
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
export async function registerPasskey(userId: string): Promise<boolean> {
  const options = await callFn('register-begin', { userId })
  if (options.error) throw new Error(options.error)

  const credential = await startRegistration({ optionsJSON: options })

  const result = await callFn('register-complete', { userId, credential })
  if (result.error) throw new Error(result.error)

  return result.verified === true
}

/** Authenticate with passkey — returns true if verified */
export async function authenticateWithPasskey(userId: string): Promise<boolean> {
  const options = await callFn('authenticate-begin', { userId })
  if (options.error) throw new Error(options.error)

  const credential = await startAuthentication({ optionsJSON: options })

  const result = await callFn('authenticate-complete', { userId, credential })
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
