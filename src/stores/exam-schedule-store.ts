import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ExamSchedule, ExamTemplate } from '@/types'
import { rowToSchedule } from '@/lib/exam-schedule'

export interface ExamScheduleDraft {
  name: string
  days_of_week: number[]
  fire_time: number
  template: ExamTemplate
  enabled: boolean
  /** IANA 时区(建约设备), 服务端 cron 按其换算到点时刻 */
  tz: string
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
    const { data, error } = await supabase
      .from('exam_schedules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) {
      set({ isLoading: false, error: error.message })
      return
    }
    set({ schedules: (data ?? []).map((r) => rowToSchedule(r as Record<string, unknown>)), isLoading: false })
  },

  create: async (userId, draft) => {
    set({ error: null })
    const { data, error } = await supabase
      .from('exam_schedules')
      .insert({
        user_id: userId,
        name: draft.name,
        days_of_week: draft.days_of_week,
        fire_time: draft.fire_time,
        template: draft.template as unknown as Record<string, unknown>,
        enabled: draft.enabled,
        tz: draft.tz,
      })
      .select()
      .single()
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to create schedule' })
      return null
    }
    const created = rowToSchedule(data as Record<string, unknown>)
    set({ schedules: [...get().schedules, created] })
    return created
  },

  update: async (id, patch) => {
    set({ error: null })
    const payload: Record<string, unknown> = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.days_of_week !== undefined) payload.days_of_week = patch.days_of_week
    if (patch.fire_time !== undefined) payload.fire_time = patch.fire_time
    if (patch.template !== undefined) payload.template = patch.template as unknown as Record<string, unknown>
    if (patch.enabled !== undefined) payload.enabled = patch.enabled
    if (patch.tz !== undefined) payload.tz = patch.tz

    const { data, error } = await supabase
      .from('exam_schedules')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to update schedule' })
      return
    }
    const updated = rowToSchedule(data as Record<string, unknown>)
    set({ schedules: get().schedules.map((s) => (s.id === id ? updated : s)) })
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from('exam_schedules').delete().eq('id', id)
    if (error) {
      set({ error: error.message })
      return
    }
    set({ schedules: get().schedules.filter((s) => s.id !== id) })
  },

  markFired: (id, date) => {
    const s = get().schedules.find((x) => x.id === id)
    if (s) set({ schedules: get().schedules.map((x) => (x.id === id ? { ...x, last_fire_date: date } : x)) })
  },

  clear: () => set({ schedules: [], isLoading: false, error: null }),
}))
