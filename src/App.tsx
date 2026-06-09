import { useEffect, type ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useSettingsStore } from '@/stores/settings-store'
import type { Profile } from '@/types'
import { LoadingScreen } from '@/components/layout/LoadingScreen'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('fetchProfile error:', error)
    return null
  }
  return data as Profile | null
}

async function createProfile(userId: string): Promise<Profile | null> {
  const { count, error: countErr } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    console.error('createProfile count error:', countErr)
    return null
  }

  const role = count === 0 ? 'admin' : 'user'

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, role })
    .select()
    .maybeSingle()

  if (error) {
    // If insert failed due to duplicate, try fetching again
    if (error.code === '23505') {
      return fetchProfile(userId)
    }
    console.error('createProfile insert error:', error)
    return null
  }

  return data as Profile | null
}

function ThemeInitializer({ children }: { children: ReactNode }) {
  const { theme } = useThemeStore()

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return <>{children}</>
}

function AuthInitializer({ children }: { children: ReactNode }) {
  const { setUser, setProfile, setLoading, setInitialized, isInitialized } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    async function loadProfile(userId: string) {
      let profile = await fetchProfile(userId)
      if (!profile) {
        profile = await createProfile(userId)
      }
      // Auto-assign nickname if not set (await DB before setting profile)
      if (profile && !profile.nickname) {
        const rand = Math.random().toString(36).slice(2, 10)
        const nickname = `刷题网用户${rand}`
        const { error } = await supabase.from('profiles').update({ nickname }).eq('id', userId)
        if (!error) {
          profile = { ...profile, nickname }
        }
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
      async (event, session) => {
        // Skip token refresh entirely — no store update, no re-render
        if (event === 'TOKEN_REFRESHED') return
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

function EyeCareInitializer({ children }: { children: ReactNode }) {
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (eyeCare && theme !== 'dark') {
      root.classList.add('eye-care')
    } else {
      root.classList.remove('eye-care')
    }
  }, [eyeCare, theme])

  return <>{children}</>
}

export default function App() {
  return (
    <ThemeInitializer>
      <EyeCareInitializer>
        <AuthInitializer>
          <RouterProvider router={router} />
        </AuthInitializer>
      </EyeCareInitializer>
    </ThemeInitializer>
  )
}
