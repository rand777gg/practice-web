import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

interface PlanStore {
  todaySubjectDone: Record<string, number>
  loaded: boolean
  addDone: (subject: string) => void
  reset: () => void
  loadFromDb: (userId: string) => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function saveToDb(userId: string, data: Record<string, number>) {
  const entries = Object.entries(data).filter(([, c]) => c > 0)
  if (entries.length === 0) {
    supabase.from('plan_live_progress').delete().eq('user_id', userId).then(() => {})
    return
  }
  const rows = entries.map(([subject, count]) => ({
    user_id: userId, subject, count,
    updated_at: new Date().toISOString(),
  }))
  supabase.from('plan_live_progress').upsert(rows, { onConflict: 'user_id, subject' }).then(() => {})
}

export const usePlanStore = create<PlanStore>((set) => ({
  todaySubjectDone: {},
  loaded: false,

  addDone: (subject) => {
    const key = subject || 'Other'
    set((s) => {
      const next = { ...s.todaySubjectDone, [key]: (s.todaySubjectDone[key] ?? 0) + 1 }
      // Debounce save to DB
      const user = useAuthStore.getState().user
      if (user) {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => saveToDb(user.id, next), 500)
      }
      return { todaySubjectDone: next }
    })
  },

  reset: () => {
    const user = useAuthStore.getState().user
    if (user) supabase.from('plan_live_progress').delete().eq('user_id', user.id).then(() => {})
    set({ todaySubjectDone: {} })
  },

  loadFromDb: async (userId) => {
    const { data } = await supabase.from('plan_live_progress').select('subject, count').eq('user_id', userId)
    const map: Record<string, number> = {}
    for (const r of (data ?? []) as { subject: string; count: number }[]) {
      map[r.subject] = r.count
    }
    set({ todaySubjectDone: map, loaded: true })
  },
}))
