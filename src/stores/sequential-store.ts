import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface SessionInfo {
  sessionKey: string
  selectedKps: string[]
  questionIds: string[]
  currentIndex: number
  updatedAt: string
}

interface SequentialStore {
  isActive: boolean
  sessionKey: string
  selectedKps: string[]
  questionIds: string[]
  questionKps: (string | null)[]
  currentIndex: number
  isLoading: boolean
  sessions: SessionInfo[]
  startSequential: (userId: string, kps: string[], subjects: string[], type: string) => Promise<void>
  nextQuestion: () => void
  reset: () => void
  saveToDb: (userId: string) => Promise<void>
  loadFromDb: (userId: string, sessionKey: string) => Promise<boolean>
  loadSessions: (userId: string) => Promise<void>
  switchSession: (userId: string, sessionKey: string) => Promise<void>
  getCurrentKpInfo: () => { kpName: string | null; kpCurrent: number; kpTotal: number }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function makeSessionKey(kps: string[]): string {
  return [...kps].sort().join('|')
}

export const useSequentialStore = create<SequentialStore>((set, get) => ({
  isActive: false, sessionKey: '', selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false, sessions: [],

  startSequential: async (userId, kps, subjects, type) => {
    const sessionKey = makeSessionKey(kps)
    set({ isLoading: true, selectedKps: kps, sessionKey })
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
      const { selectedKps: sKps, questionIds: qids, currentIndex: idx } = get()
      supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: sessionKey, selected_kps: sKps, question_ids: qids,
        current_index: idx, updated_at: new Date().toISOString(),
      }).then(() => {})
    } catch { set({ isLoading: false }) }
  },

  nextQuestion: () => {
    const { currentIndex, questionIds } = get()
    if (currentIndex < questionIds.length) set({ currentIndex: currentIndex + 1 })
  },

  reset: () => set({ isActive: false, sessionKey: '', selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false }),

  saveToDb: async (userId) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const { selectedKps, questionIds, currentIndex, sessionKey } = get()
      if (!sessionKey) return
      await supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: sessionKey, selected_kps: selectedKps, question_ids: questionIds,
        current_index: currentIndex, updated_at: new Date().toISOString(),
      })
    }, 300)
  },

  loadFromDb: async (userId, sessionKey) => {
    const { data } = await supabase.from('practice_sequential_state').select('*').eq('user_id', userId).eq('session_key', sessionKey).single()
    if (data) {
      const storedIds: string[] = data.question_ids ?? []
      let validIds = storedIds
      let kpsArr: (string | null)[] = []
      let restoredIndex = data.current_index ?? 0
      if (storedIds.length > 0) {
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
        validIds = storedIds.filter(id => kpMap.has(id))
        kpsArr = validIds.map(id => kpMap.get(id) ?? null)
        if (restoredIndex >= validIds.length) restoredIndex = Math.max(0, validIds.length - 1)
      }
      set({ isActive: validIds.length > 0, sessionKey, selectedKps: data.selected_kps ?? [], questionIds: validIds, questionKps: kpsArr, currentIndex: restoredIndex })
      return validIds.length > 0
    }
    return false
  },

  loadSessions: async (userId) => {
    const { data } = await supabase.from('practice_sequential_state').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
    const sessions: SessionInfo[] = (data ?? []).map((r: any) => ({
      sessionKey: r.session_key,
      selectedKps: r.selected_kps ?? [],
      questionIds: r.question_ids ?? [],
      currentIndex: r.current_index ?? 0,
      updatedAt: r.updated_at,
    }))
    set({ sessions })
  },

  switchSession: async (userId, sessionKey) => {
    const { sessionKey: currentKey } = get()
    if (currentKey) {
      // Save current session before switching
      const { selectedKps, questionIds, currentIndex } = get()
      await supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: currentKey, selected_kps: selectedKps, question_ids: questionIds,
        current_index: currentIndex, updated_at: new Date().toISOString(),
      })
    }
    // Load target session
    const found = await get().loadFromDb(userId, sessionKey)
    if (!found) {
      // Session not found — start fresh with these KPs
      const session = get().sessions.find(s => s.sessionKey === sessionKey)
      if (session && session.selectedKps.length > 0) {
        await get().startSequential(userId, session.selectedKps, [], '')
      }
    }
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
