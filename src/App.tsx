import { useEffect, type ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { Profile } from '@/types'
import { LoadingScreen } from '@/components/layout/LoadingScreen'

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data as Profile | null
  } catch {
    return null
  }
}

async function upsertProfile(userId: string): Promise<Profile | null> {
  try {
    // Check if any profiles exist — first user becomes admin
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    const role = count === 0 ? 'admin' : 'user'

    const { data } = await supabase
      .from('profiles')
      .upsert({ id: userId, role })
      .select()
      .single()

    return data as Profile | null
  } catch {
    return null
  }
}

function AuthInitializer({ children }: { children: ReactNode }) {
  const { setUser, setProfile, setLoading, setInitialized, isInitialized } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    async function loadProfile(userId: string) {
      let profile = await fetchProfile(userId)
      if (!profile) {
        profile = await upsertProfile(userId)
      }
      if (!cancelled) {
        setProfile(profile)
      }
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user ?? null
        if (!cancelled) setUser(user)
        if (user) {
          await loadProfile(user.id)
        } else {
          if (!cancelled) setProfile(null)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          setProfile(null)
        }
      }
      if (!cancelled) {
        setLoading(false)
        setInitialized(true)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const user = session?.user ?? null
        if (!cancelled) setUser(user)
        if (user) {
          await loadProfile(user.id)
        } else {
          if (!cancelled) setProfile(null)
        }
        if (!cancelled) {
          setLoading(false)
          setInitialized(true)
        }
      },
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, setProfile, setLoading, setInitialized])

  if (!isInitialized) {
    return <LoadingScreen />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <AuthInitializer>
      <RouterProvider router={router} />
    </AuthInitializer>
  )
}
