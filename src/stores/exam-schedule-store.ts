import { create } from 'zustand'
import { createExamSchedule, deleteExamSchedule, fetchExamSchedules, updateExamSchedule } from '@/services/exam'
import { logError, userMessage } from '@/services/errors'
import type { ExamSchedule, ExamTemplate } from '@/types'
import { registerUserScopedStore } from '@/stores/user-scope'

export interface ExamScheduleDraft {
  name: string
  days_of_week: number[]
  fire_time: number
  template: ExamTemplate
  enabled: boolean
  /** IANA 时区(建约设备), 服务端 cron 按其换算到点时刻 */
  tz: string
  /** 定时邮件通知: 开关 + 发送日期 + 自选发送时刻(分钟) */
  email_enabled?: boolean
  email_time?: number | null
  email_send_date?: string | null
}

interface ExamScheduleState {
  schedules: ExamSchedule[]
  isLoading: boolean
  error: string | null

  load: (userId: string) => Promise<void>
  create: (userId: string, draft: ExamScheduleDraft) => Promise<ExamSchedule | null>
  update: (id: string, patch: Partial<ExamScheduleDraft>) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 开考成功后标记今天已处理(本地 + 远端) */
  markFired: (id: string, date: string) => void
  clear: () => void
}

export const useExamScheduleStore = create<ExamScheduleState>((set, get) => ({
  schedules: [],
  isLoading: false,
  error: null,

  load: async (userId) => {
    set({ isLoading: true, error: null })
    try {
      set({ schedules: await fetchExamSchedules(userId), isLoading: false })
    } catch (e) {
      logError('examSchedule.load', e)
      set({ isLoading: false, error: userMessage(e) })
    }
  },

  create: async (userId, draft) => {
    set({ error: null })
    try {
      const created = await createExamSchedule(userId, draft)
      if (!created) {
        set({ error: 'Failed to create schedule' })
        return null
      }
      set({ schedules: [...get().schedules, created] })
      return created
    } catch (e) {
      logError('examSchedule.create', e)
      set({ error: userMessage(e) })
      return null
    }
  },

  update: async (id, patch) => {
    set({ error: null })
    try {
      const updated = await updateExamSchedule(id, patch)
      if (!updated) {
        set({ error: 'Failed to update schedule' })
        return
      }
      set({ schedules: get().schedules.map((s) => (s.id === id ? updated : s)) })
    } catch (e) {
      logError('examSchedule.update', e)
      set({ error: userMessage(e) })
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await deleteExamSchedule(id)
      set({ schedules: get().schedules.filter((s) => s.id !== id) })
    } catch (e) {
      logError('examSchedule.remove', e)
      set({ error: userMessage(e) })
    }
  },

  markFired: (id, date) => {
    const s = get().schedules.find((x) => x.id === id)
    if (s) set({ schedules: get().schedules.map((x) => (x.id === id ? { ...x, last_fire_date: date } : x)) })
  },

  clear: () => set({ schedules: [], isLoading: false, error: null }),
}))

registerUserScopedStore(() => useExamScheduleStore.getState().clear())
