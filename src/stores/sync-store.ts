import { create } from 'zustand'
import { getPendingCount, syncPendingAnswers } from '@/lib/offline-db'
import { insertAnswers } from '@/services/practice'
import { registerUserScopedStore } from '@/stores/user-scope'

interface SyncState {
  pendingCount: number
  syncing: boolean
  refresh: () => Promise<void>
  sync: () => Promise<void>
  reset: () => void
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
        await insertAnswers(answers.map((a) => ({
          user_id: a.user_id,
          question_id: a.question_id,
          selected_answer: a.selected_answer,
          is_correct: a.is_correct,
          mode: a.mode,
          exam_session_id: a.exam_session_id ?? null,
          source: a.source ?? null,
          answered_at: a.answered_at,
        })))
        return answers.map((a) => a.id!).filter(Boolean)
      })
      set({ pendingCount: result.failed })
    } finally {
      set({ syncing: false })
    }
  },

  // 待同步条数是上一个人的本地待办；换号后不能把它显示成新用户的，更不能顺手替他上传
  reset: () => set({ pendingCount: 0, syncing: false }),
}))

registerUserScopedStore(() => useSyncStore.getState().reset())
