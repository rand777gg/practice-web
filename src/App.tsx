import { useEffect, type ReactNode } from 'react'
import { RouterProvider } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { router } from '@/router'
import { supabase } from '@/lib/supabase'
import { githubAvatarOf, hasGitHubIdentity } from '@/lib/avatar'
import { fetchProfileWithRetry, backfillLoginProfile } from '@/services/profiles'
import { logError } from '@/services/errors'
import { useAuthStore, selectAuthPending } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useSettingsStore, FONT_OPTIONS } from '@/stores/settings-store'
import type { Profile } from '@/types'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { PwaUpdatePrompt } from '@/components/layout/PwaUpdatePrompt'

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

/** 登录通知与设备识别落在服务端函数里，失败不该影响登录本身，所以只记日志。 */
function notifyLogin(session: Session): void {
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-notify`
  void fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      // 函数要求登录: 身份取自这个 JWT, 不接受 body 里的 userId
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  }).catch(() => {})
}

/**
 * 恢复会话并发布认证状态。这里只做这一件事 ——
 * 昵称、头像补齐和资料读取都在 SessionPublisher 之外异步进行，别再往首屏路径上串请求。
 */
function SessionRestorer({ children }: { children: ReactNode }) {
  const pending = useAuthStore(selectAuthPending)

  useEffect(() => {
    let cancelled = false
    const { publish, setError } = useAuthStore.getState()

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) publish(session?.user ?? null)
      })
      .catch((e) => {
        // 拿不到会话既不能当"已登录"也不能当"没登录" —— 必须显式变成 error 状态，
        // 否则用户会在一个假的未登录态里被反复弹回首页。
        if (!cancelled) setError(e)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // 令牌刷新不改变"是谁"，跳过可以省掉一次全应用重渲染
      if (event === 'TOKEN_REFRESHED') return
      if (event === 'SIGNED_IN' && session) notifyLogin(session)
      if (cancelled) return
      useAuthStore.getState().publish(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  if (pending) return <LoadingTips className="h-screen" />
  return <>{children}</>
}

/** 登录后异步补昵称与头像：写库成功前界面先用本地推出来的值，不让用户干等。 */
async function backfillLoginIdentity(user: User, profile: Profile): Promise<void> {
  const patch: { nickname?: string; avatar_url?: string } = {}
  if (!profile.nickname) {
    patch.nickname = `刷题网用户${Math.random().toString(36).slice(2, 10)}`
  }
  // 绑定 GitHub 的账号默认用 GitHub 头像: 没自己挑过(avatar_preset 为空)就落库,
  // 这样管理员列表、公开笔记里其他人也能看到同一张头像
  const ghAvatar = hasGitHubIdentity(user) ? githubAvatarOf(user) : null
  if (ghAvatar && !profile.avatar_preset && profile.avatar_url !== ghAvatar) {
    patch.avatar_url = ghAvatar
  }
  if (Object.keys(patch).length === 0) return

  try {
    await backfillLoginProfile(user.id, patch, { context: 'app.backfillLoginIdentity' })
    // setProfile 只在用户仍是本人时生效：补写期间可能已经切号了
    const { user: current, profile: latest } = useAuthStore.getState()
    if (current?.id === user.id && latest) useAuthStore.getState().setProfile({ ...latest, ...patch })
  } catch (e) {
    // 补写失败不影响使用，下次登录会重试
    logError('app.backfillLoginIdentity', e)
  }
}

/**
 * 拉取自己的资料。用户资料由 auth.users 上的 on_auth_user_created 触发器创建，
 * 客户端不再做「先 count 再 insert」——那条路径既多一次往返，又在并发注册时和触发器抢主键。
 */
function ProfileLoader({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const hasProfile = useAuthStore((s) => s.profile !== null)

  useEffect(() => {
    if (status !== 'authenticated' || !userId || hasProfile) return
    let cancelled = false

    void (async () => {
      try {
        const profile = await fetchProfileWithRetry(userId, { context: 'app.profileLoader' })
        if (cancelled) return
        const user = useAuthStore.getState().user
        if (!profile) {
          useAuthStore.getState().setError(new Error('profile missing after retries'))
          return
        }
        useAuthStore.getState().setProfile(profile)
        if (user && user.id === profile.id) void backfillLoginIdentity(user, profile)
      } catch (e) {
        if (!cancelled) useAuthStore.getState().setError(e)
      }
    })()

    return () => { cancelled = true }
  }, [status, userId, hasProfile])

  return <>{children}</>
}

export default function App() {
  return (
    <AppearanceInitializer>
      <SessionRestorer>
        <ProfileLoader>
          <RouterProvider router={router} />
        </ProfileLoader>
      </SessionRestorer>
      <PwaUpdatePrompt />
    </AppearanceInitializer>
  )
}
