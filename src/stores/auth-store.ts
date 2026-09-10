import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isInitialized: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  refreshProfile: () => Promise<void>
  signOut: (scope?: 'local' | 'global') => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  refreshProfile: async () => {
    const { user } = get()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (data) set({ profile: data as Profile })
  },
  signOut: async (scope = 'local') => {
    // Default scope is 'local' on purpose: supabase-js defaults to 'global', which revokes every
    // session of the account — other devices, other browsers and any other deployment sharing
    // this Supabase project. Settings offers 'global' explicitly as "log out everywhere".
    await supabase.auth.signOut({ scope })
    set({ user: null, profile: null })
  },
}))
