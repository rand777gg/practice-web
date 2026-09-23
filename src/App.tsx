import { useEffect, type ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { router } from '@/router'
import { supabase } from '@/lib/supabase'
import { githubAvatarOf, hasGitHubIdentity } from '@/lib/avatar'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useSettingsStore, FONT_OPTIONS } from '@/stores/settings-store'
import type { Profile } from '@/types'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { PwaUpdatePrompt } from '@/components/layout/PwaUpdatePrompt'

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

function AppearanceInitializer({ children }: { children: ReactNode }) {
  const { theme } = useThemeStore()
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const fontFamily = useSettingsStore((s) => s.fontFamily)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const fontWeight = useSettingsStore((s) => s.fontWeight)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('eye-care-silk', 'eye-care-celadon', 'eye-care-lotus', 'eye-care-tea', 'eye-care-bamboo')
    if (eyeCare && theme !== 'dark') root.classList.add(`eye-care-${eyeCare}`)
  }, [eyeCare, theme])

  useEffect(() => {
    const root = document.documentElement
    const linkId = 'font-stylesheet'
    const oldLink = document.getElementById(linkId) as HTMLLinkElement | null
    if (oldLink) oldLink.remove()
    const opt = FONT_OPTIONS.find((f) => f.value === fontFamily)
    if (opt?.google) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      const { google, weights } = opt
      link.href = `https://fonts.googleapis.com/css2?family=${google}:wght@${weights}&display=swap`
      document.head.appendChild(link)
    }
    const fallback = 'system-ui, -apple-system, "Microsoft YaHei", sans-serif'
    root.style.setProperty('--font-sans', fontFamily === 'system' ? fallback : `'${fontFamily}', ${fallback}`)
  }, [fontFamily])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`)
  }, [fontSize])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-weight', String(fontWeight))
  }, [fontWeight])

  return <>{children}</>
}

function AuthInitializer({ children }: { children: ReactNode }) {
  const { setUser, setProfile, setLoading, setInitialized, isInitialized } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    async function loadProfile(user: User) {
      const userId = user.id
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
      // 绑定 GitHub 的账号默认用 GitHub 头像: 没自己挑过(avatar_preset 为空)就把 GitHub 头像落库,
      // 这样管理员列表、公开笔记里其他人也能看到同一张头像
      const ghAvatar = hasGitHubIdentity(user) ? githubAvatarOf(user) : null
      if (profile && ghAvatar && !profile.avatar_preset && profile.avatar_url !== ghAvatar) {
        const { error } = await supabase.from('profiles').update({ avatar_url: ghAvatar }).eq('id', userId)
        if (!error) {
          profile = { ...profile, avatar_url: ghAvatar }
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
          await loadProfile(user)
        } else {
          if (!cancelled) setProfile(null)
        }
      } catch (e) {
        console.error('Session init failed:', e)
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

        // 登录后记录日志并判断是否新设备（首次 SIGNED_IN 或登录后恢复 session）
        if (event === 'SIGNED_IN' && session?.user) {
          const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-notify`
          fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              // 函数现在要求登录: 身份取自这个 JWT, 不再接受 body 里的 userId
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({}),
          }).catch(() => {})
        }

        const user = session?.user ?? null
        const currentProfile = useAuthStore.getState().profile
        if (user && currentProfile && currentProfile.id === user.id) return
        if (!cancelled) setUser(user)
        if (user) {
          await loadProfile(user)
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
    return <LoadingTips className="h-screen" />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <AppearanceInitializer>
      <AuthInitializer>
        <RouterProvider router={router} />
      </AuthInitializer>
      <PwaUpdatePrompt />
    </AppearanceInitializer>
  )
}
