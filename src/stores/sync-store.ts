import { create } from 'zustand'
import { getPendingCount, syncPendingAnswers } from '@/lib/offline-db'
import { supabase } from '@/lib/supabase'

interface SyncState {
  pendingCount: number
  syncing: boolean
  refresh: () => Promise<void>
  sync: () => Promise<void>
}

export const useSyncStore = create<SyncState>((set, get) => ({
  pendingCount: 0,
  syncing: false,

  refresh: async () => {
    const count = await getPendingCount()
    set({ pendingCount: count })
  },

  sync: async () => {
    if (get().syncing) return
    set({ syncing: true })
    try {
      const result = await syncPendingAnswers(async (answers) => {
        const rows = answers.map((a) => ({
          user_id: a.user_id,
          question_id: a.question_id,
          selected_answer: a.selected_answer,
          is_correct: a.is_correct,
          mode: a.mode,
          exam_session_id: a.exam_session_id ?? null,
          answered_at: a.answered_at,
        }))
        const { error } = await supabase.from('user_answers').insert(rows)
        if (error) throw error
        return answers.map((a) => a.id!).filter(Boolean)
      })
      set({ pendingCount: result.failed })
    } finally {
      set({ syncing: false })
    }
  },
}))
