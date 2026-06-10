import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

// Don't throw at module level — it would white-screen the entire app.
// Instead, supabase calls will fail with a clear error at runtime.
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)')
}

// Retry wrapper for unstable mobile networks
function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true // network offline, fetch failed
  const msg = String(err)
  return msg.includes('NETWORK_CHANGED') ||
    msg.includes('QUIC_PROTOCOL_ERROR') ||
    msg.includes('CONNECTION_RESET') ||
    msg.includes('CONNECTION_REFUSED') ||
    msg.includes('ERR_INTERNET_DISCONNECTED') ||
    msg.includes('ERR_NETWORK_IO_SUSPENDED') ||
    msg.includes('ERR_TIMED_OUT') ||
    msg.includes('ERR_NAME_NOT_RESOLVED')
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(input, init)
      return res
    } catch (err) {
      if (i < retries && isRetryableError(err)) {
        const delay = Math.min(1000 * Math.pow(2, i), 8000) // 1s, 2s, 4s, 8s cap
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('fetchWithRetry: unreachable')
}

// Create client only when env vars are present — otherwise use a no-op
// placeholder that won't crash the app. Auth / data calls will fail
// gracefully at call sites.
function createSafeClient(url: string, key: string) {
  if (!url || !key) {
    return new Proxy({} as ReturnType<typeof createClient>, {
      get(_, prop) {
        if (prop === 'auth') return { getSession: () => Promise.resolve({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: () => Promise.resolve({ error: null }) }
        return () => Promise.resolve({ data: null, error: new Error('Supabase not configured') })
      },
    })
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: { apikey: key },
      fetch: fetchWithRetry,
    },
  })
}

export const supabase = createSafeClient(supabaseUrl, supabaseKey)
