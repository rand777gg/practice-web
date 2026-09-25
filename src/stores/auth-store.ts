import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/services/profiles'
import { logError, toAppError, type AppError } from '@/services/errors'
import type { Profile } from '@/types'
import { syncUserScope } from '@/stores/user-scope'

/**
 * 认证状态。以前是 isLoading + isInitialized 两个布尔，加上 user / profile 两个可空字段 ——
 * 四个值能组合出 16 种情况，其中大部分是非法的（比如 isLoading=false 且 isInitialized=false）。
 * 这里收成一个状态机：没有"未初始化但又不在加载"这种中间态可言。
 */
export type AuthStatus =
  /** 还没问过服务器；此时不能判断用户是登录还是没登录 */
  | 'unknown'
  | 'authenticated'
  | 'unauthenticated'
  /** 会话恢复了但资料取不到（触发器还没落库、或网络失败）—— 与"没登录"是两回事 */
  | 'error'

interface AuthState {
  status: AuthStatus
  user: User | null
  profile: Profile | null
  error: AppError | null
  /** 发布认证结果；同时按用户身份清理用户级 Store */
  publish: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setError: (e: unknown) => void
  /** 重新拉一次自己的资料（改完昵称/头像/计划后调用） */
  refreshProfile: () => Promise<void>
  signOut: (scope?: 'local' | 'global') => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  profile: null,
  error: null,

  publish: (user) => {
    syncUserScope(user?.id ?? null)
    set({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      profile: user ? get().profile : null,
      error: null,
    })
  },

  setProfile: (profile) => set({ profile }),

  setError: (e) => {
    logError('auth', e)
    set({ status: 'error', error: toAppError(e, 'auth') })
  },

  refreshProfile: async () => {
    const { user } = get()
    if (!user) return
    try {
      const profile = await fetchProfile(user.id, { context: 'auth.refreshProfile' })
      if (profile) set({ profile })
    } catch (e) {
      logError('auth.refreshProfile', e)
    }
  },

  signOut: async (scope = 'local') => {
    // Default scope is 'local' on purpose: supabase-js defaults to 'global', which revokes every
    // session of the account — other devices, other browsers and any other deployment sharing
    // this Supabase project. Settings offers 'global' explicitly as "log out everywhere".
    await supabase.auth.signOut({ scope })
    get().publish(null)
  },
}))

/** 会话是否已经问过服务器；替代原来的 isInitialized */
export const selectAuthSettled = (s: AuthState): boolean => s.status !== 'unknown'
/** 是否还在等第一次会话结果；替代原来的 isLoading */
export const selectAuthPending = (s: AuthState): boolean => s.status === 'unknown'
