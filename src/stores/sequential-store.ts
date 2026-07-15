import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface SequentialStore {
  isActive: boolean
  selectedKps: string[]
  questionIds: string[]
  questionKps: (string | null)[]
  currentIndex: number
  isLoading: boolean
  startSequential: (userId: string, kps: string[], subjects: string[], type: string) => Promise<void>
  nextQuestion: () => void
  reset: () => void
  saveToDb: (userId: string) => Promise<void>
  loadFromDb: (userId: string) => Promise<boolean>
  getCurrentKpInfo: () => { kpName: string | null; kpCurrent: number; kpTotal: number }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useSequentialStore = create<SequentialStore>((set, get) => ({
  isActive: false, selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false,

  startSequential: async (userId, kps, subjects, type) => {
    set({ isLoading: true, selectedKps: kps })
    try {
      const kpFilters = kps.map(k => `key_points.ilike.%${k}%`).join(',')
      let query = supabase.from('questions').select('id, key_points, seq_number').or(kpFilters)
      if (subjects.length > 0) query = query.in('subject', subjects)
      if (type) query = query.eq('question_type', type)
      const { data } = await query
      const rows = (data ?? []) as { id: string; key_points: string | null; seq_number: number | null }[]
      const exactMatch = rows.filter(r => {
        if (!r.key_points) return false
        const kpList = r.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
        return kps.some(k => kpList.includes(k))
      })
      const sorted = exactMatch.sort((a, b) => {
        const cmp = (a.key_points ?? '').localeCompare(b.key_points ?? '', 'zh-CN', { numeric: true })
        if (cmp !== 0) return cmp
        return (a.seq_number ?? 999999) - (b.seq_number ?? 999999)
      })
      set({
        questionIds: sorted.map(q => q.id),
        questionKps: sorted.map(q => {
          if (!q.key_points) return null
          return q.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)[0] ?? null
        }),
        currentIndex: 0, isActive: true, isLoading: false,
      })
      get().saveToDb(userId)
    } catch { set({ isLoading: false }) }
  },

  nextQuestion: () => {
    const { currentIndex, questionIds } = get()
    if (currentIndex < questionIds.length) set({ currentIndex: currentIndex + 1 })
  },

  reset: () => set({ isActive: false, selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false }),

  saveToDb: async (userId) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const { selectedKps, questionIds, currentIndex } = get()
      await supabase.from('practice_sequential_state').upsert({
        user_id: userId, selected_kps: selectedKps, question_ids: questionIds,
        current_index: currentIndex, updated_at: new Date().toISOString(),
      })
    }, 300)
  },

  loadFromDb: async (userId) => {
    const { data } = await supabase.from('practice_sequential_state').select('*').eq('user_id', userId).single()
    if (data) {
      const storedIds: string[] = data.question_ids ?? []
      let validIds = storedIds
      let kpsArr: (string | null)[] = []
      let restoredIndex = data.current_index ?? 0
      if (storedIds.length > 0) {
        // Validate stored IDs against current questions table (handle deletions)
        const kpMap = new Map<string, string | null>()
        const BATCH = 100
        const batches = []
        for (let i = 0; i < storedIds.length; i += BATCH) {
          batches.push(supabase.from('questions').select('id, key_points').in('id', storedIds.slice(i, i + BATCH)))
        }
        const results = await Promise.all(batches)
        for (const { data: qData } of results) {
          for (const q of (qData ?? []) as { id: string; key_points: string | null }[]) {
            const pk = q.key_points?.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)[0] ?? null
            kpMap.set(q.id, pk)
          }
        }
        // Filter to only existing questions; rebuild KP array
        validIds = storedIds.filter(id => kpMap.has(id))
        kpsArr = validIds.map(id => kpMap.get(id) ?? null)
        // Clamp index if deleted questions pushed it out of bounds
        if (restoredIndex >= validIds.length) restoredIndex = Math.max(0, validIds.length - 1)
      }
      set({ isActive: validIds.length > 0, selectedKps: data.selected_kps ?? [], questionIds: validIds, questionKps: kpsArr, currentIndex: restoredIndex })
      return data.question_ids ? data.question_ids.length > 0 : false
    }
    return false
  },

  getCurrentKpInfo: () => {
    const { currentIndex, questionKps, questionIds } = get()
    if (questionIds.length === 0) return { kpName: null, kpCurrent: 0, kpTotal: 0 }
    const currentKp = questionKps[currentIndex] ?? null
    if (!currentKp) return { kpName: null, kpCurrent: 0, kpTotal: 0 }
    let s = currentIndex, e = currentIndex
    while (s > 0 && questionKps[s - 1] === currentKp) s--
    while (e < questionKps.length - 1 && questionKps[e + 1] === currentKp) e++
    return { kpName: currentKp, kpCurrent: currentIndex - s + 1, kpTotal: e - s + 1 }
  },
}))
