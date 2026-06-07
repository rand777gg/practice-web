import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
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

export const supabase = createClient(supabaseUrl, supabaseKey, {
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
    headers: { apikey: supabaseKey },
    fetch: fetchWithRetry,
  },
})
