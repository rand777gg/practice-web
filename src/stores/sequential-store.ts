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
  subjectPositions: Record<string, number>
  isLoading: boolean
  sessions: SessionInfo[]
  startSequential: (userId: string, kps: string[], subjects: string[], type: string) => Promise<void>
  nextQuestion: () => void
  reset: () => void
  saveToDb: (userId: string) => Promise<void>
  loadFromDb: (userId: string, sessionKey: string) => Promise<boolean>
  loadSessions: (userId: string) => Promise<void>
  switchSession: (userId: string, sessionKey: string) => Promise<void>
  mergeKps: (userId: string, newKps: string[], subjects: string[], type: string) => Promise<void>
  syncKpsFromPlanSubjects: (userId: string, planSubjects: string[]) => Promise<void>
  getCurrentKpInfo: () => { kpName: string | null; kpCurrent: number; kpTotal: number }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function makeSessionKey(kps: string[]): string {
  return [...kps].sort().join('|')
}

export const useSequentialStore = create<SequentialStore>((set, get) => ({
  isActive: false, sessionKey: '', selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false, sessions: [], subjectPositions: {},

  startSequential: async (userId, kps, subjects, type) => {
    const sessionKey = makeSessionKey(kps)
    set({ isLoading: true, selectedKps: kps, sessionKey })
    try {
      const kpFilters = kps.map(k => `key_points.ilike.%${k}%`).join(',')
      let query = supabase.from('questions').select('id, key_points, seq_number').or(kpFilters)
      if (subjects.length > 0) query = query.in('subject', subjects)
      if (type) query = query.eq('question_type', type)
      const { data } = await query
      let rows = (data ?? []) as { id: string; key_points: string | null; seq_number: number | null }[]

      // Filter out excluded questions
      const { data: excluded } = await supabase.from('user_excluded_questions').select('question_id').eq('user_id', userId)
      const excludedIds = new Set((excluded ?? []).map((e: any) => e.question_id))
      rows = rows.filter(r => !excludedIds.has(r.id))

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
        current_index: idx, subject_positions: {}, updated_at: new Date().toISOString(),
      }).then(() => {})
    } catch { set({ isLoading: false }) }
  },

  nextQuestion: () => {
    const { currentIndex, questionIds } = get()
    if (currentIndex < questionIds.length) set({ currentIndex: currentIndex + 1 })
  },

  reset: () => set({ isActive: false, sessionKey: '', selectedKps: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false, subjectPositions: {} }),

  saveToDb: async (userId) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const { selectedKps, questionIds, currentIndex, sessionKey, subjectPositions } = get()
      if (!sessionKey) return
      await supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: sessionKey, selected_kps: selectedKps, question_ids: questionIds,
        current_index: currentIndex, subject_positions: subjectPositions, updated_at: new Date().toISOString(),
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
      set({ isActive: validIds.length > 0, sessionKey, selectedKps: data.selected_kps ?? [], questionIds: validIds, questionKps: kpsArr, currentIndex: restoredIndex, subjectPositions: data.subject_positions ?? {} })
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
      const { subjectPositions } = get()
      await supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: currentKey, selected_kps: selectedKps, question_ids: questionIds,
        current_index: currentIndex, subject_positions: subjectPositions, updated_at: new Date().toISOString(),
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

  mergeKps: async (userId, newKps, subjects, type) => {
    const { selectedKps: oldKps, questionIds: oldIds, currentIndex, sessionKey: oldKey } = get()
    const oldKpSet = new Set(oldKps)
    const addedKps = newKps.filter(k => !oldKpSet.has(k))
    const removedKps = oldKps.filter(k => !newKps.includes(k))

    if (addedKps.length === 0 && removedKps.length === 0) return

    if (removedKps.length > 0) {
      const newKey = makeSessionKey(newKps)
      if (oldKey) supabase.from('practice_sequential_state').delete().eq('user_id', userId).eq('session_key', oldKey).then(() => {})
      set({ selectedKps: newKps, sessionKey: newKey })
      await get().startSequential(userId, newKps, subjects, type)
      return
    }

    const kpFilters = addedKps.map(k => `key_points.ilike.%${k}%`).join(',')
    let query = supabase.from('questions').select('id, key_points, seq_number').or(kpFilters)
    if (subjects.length > 0) query = query.in('subject', subjects)
    if (type) query = query.eq('question_type', type)
    const { data } = await query
    let rows = (data ?? []) as { id: string; key_points: string | null; seq_number: number | null }[]

    // Filter out excluded questions
    const { data: excluded } = await supabase.from('user_excluded_questions').select('question_id').eq('user_id', userId)
    const excludedIds = new Set((excluded ?? []).map((e: any) => e.question_id))
    rows = rows.filter(r => !excludedIds.has(r.id))

    const existingIds = new Set(oldIds)
    const newQuestions = rows.filter(r => {
      if (!r.key_points) return false
      if (existingIds.has(r.id)) return false
      const kpList = r.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
      return addedKps.some(k => kpList.includes(k))
    })

    if (newQuestions.length === 0) {
      const newKey = makeSessionKey(newKps)
      set({ selectedKps: newKps, sessionKey: newKey })
      return
    }

    const allQuestions = [
      ...oldIds.map((id, i) => ({ id, kp: get().questionKps[i], seq: null as number | null })),
      ...newQuestions.map(q => ({
        id: q.id,
        kp: q.key_points?.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)[0] ?? null,
        seq: q.seq_number ?? 999999,
      })),
    ].sort((a, b) => {
      const cmp = (a.kp ?? '').localeCompare(b.kp ?? '', 'zh-CN', { numeric: true })
      if (cmp !== 0) return cmp
      return (a.seq ?? 999999) - (b.seq ?? 999999)
    })

    const newIds = allQuestions.map(q => q.id)
    const newKpsArr = allQuestions.map(q => q.kp)
    const currentId = oldIds[currentIndex]
    const newIndex = newIds.indexOf(currentId)

    const newKey = makeSessionKey(newKps)
    set({
      selectedKps: newKps, sessionKey: newKey,
      questionIds: newIds, questionKps: newKpsArr,
      currentIndex: newIndex >= 0 ? newIndex : currentIndex,
    })

    if (oldKey) supabase.from('practice_sequential_state').delete().eq('user_id', userId).eq('session_key', oldKey).then(() => {})
    const { selectedKps: sKps, questionIds: qids, currentIndex: idx } = get()
    supabase.from('practice_sequential_state').upsert({
      user_id: userId, session_key: newKey, selected_kps: sKps, question_ids: qids,
      current_index: idx, subject_positions: {}, updated_at: new Date().toISOString(),
    }).then(() => {})
  },

  syncKpsFromPlanSubjects: async (userId, planSubjects) => {
    if (planSubjects.length === 0) return

    // Query all KPs for these subjects
    const PAGE = 500; let from = 0; const kps = new Set<string>()
    while (true) {
      const { data } = await supabase.from('questions').select('key_points').in('subject', planSubjects).not('key_points', 'is', null).range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      for (const r of (data as { key_points: string }[])) {
        for (const k of r.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)) kps.add(k)
      }
      if (data.length < PAGE) break
      from += PAGE
    }

    const newKps = [...kps].sort()
    if (newKps.length === 0) return

    const { isActive, selectedKps } = get()
    // Check if KPs actually changed
    const oldSet = new Set(selectedKps)
    if (newKps.length === oldSet.size && newKps.every(k => oldSet.has(k))) return

    if (isActive) {
      // Active session — merge
      await get().mergeKps(userId, newKps, planSubjects, '')
    } else {
      // No active session — start new one
      await get().startSequential(userId, newKps, planSubjects, '')
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
