import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface SessionInfo {
  sessionKey: string
  selectedKps: string[]
  questionIds: string[]
  currentIndex: number
  subjectPositions: Record<string, number>
  updatedAt: string
  createdAt: string
}

interface SequentialStore {
  isActive: boolean
  sessionKey: string
  selectedKps: string[]
  questionIds: string[]
  questionKps: (string | null)[]
  questionSubjects: (string | null)[]
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
  isActive: false, sessionKey: '', selectedKps: [], questionIds: [], questionKps: [], questionSubjects: [], currentIndex: 0, isLoading: false, sessions: [], subjectPositions: {},

  startSequential: async (userId, kps, subjects, type) => {
    set({ isLoading: true, selectedKps: kps })
    try {
      const { data, error } = await supabase.rpc('start_sequential_session', {
        p_user_id: userId, p_kps: kps,
        p_subjects: subjects.length > 0 ? subjects : null,
        p_question_type: type || null,
      })
      if (error || !data) { set({ isLoading: false }); return }

      const sessionKey = data.sessionKey || makeSessionKey(kps)
      set({
        sessionKey,
        questionIds: data.questionIds ?? [],
        questionKps: data.questionKps ?? [],
        questionSubjects: data.questionSubjects ?? [],
        currentIndex: data.currentIndex ?? 0,
        isActive: true, isLoading: false,
      })
      const { selectedKps: sKps, questionIds: qids, currentIndex: idx, subjectPositions: sps } = get()
      supabase.from('practice_sequential_state').upsert({
        user_id: userId, session_key: sessionKey, selected_kps: sKps, question_ids: qids,
        current_index: idx, subject_positions: sps, updated_at: new Date().toISOString(),
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
    const { data, error } = await supabase.rpc('load_practice_session', { p_user_id: userId, p_session_key: sessionKey })
    if (error || !data || !data.found) return false

    const ids: string[] = data.questionIds ?? []
    set({
      isActive: ids.length > 0,
      sessionKey,
      selectedKps: data.savedKps ?? [],
      questionIds: ids,
      questionKps: data.questionKps ?? [],
      questionSubjects: data.questionSubjects ?? [],
      currentIndex: data.currentIndex ?? 0,
      subjectPositions: data.subjectPositions ?? {},
    })
    return ids.length > 0
  },

  loadSessions: async (userId) => {
    const { data } = await supabase.from('practice_sequential_state').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
    const sessions: SessionInfo[] = (data ?? []).map((r: any) => ({
      sessionKey: r.session_key,
      selectedKps: r.selected_kps ?? [],
      questionIds: r.question_ids ?? [],
      currentIndex: r.current_index ?? 0,
      subjectPositions: r.subject_positions ?? {},
      updatedAt: r.updated_at,
      createdAt: r.created_at,
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
    const { selectedKps: oldKps, questionIds: oldIds, currentIndex, sessionKey: oldKey, questionKps: oldKpsArr, subjectPositions } = get()
    const oldKpSet = new Set(oldKps)
    const addedKps = newKps.filter(k => !oldKpSet.has(k))
    const removedKps = new Set(oldKps.filter(k => !newKps.includes(k)))

    if (addedKps.length === 0 && removedKps.size === 0) return

    // 1. Fetch new questions for added KPs
    let newQuestions: { id: string; subject: string | null; key_points: string | null; seq_number: number | null }[] = []
    if (addedKps.length > 0) {
      const kpFilters = addedKps.map(k => `key_points.ilike.%${k}%`).join(',')
      let query = supabase.from('questions').select('id, subject, key_points, seq_number').or(kpFilters)
      if (subjects.length > 0) query = query.in('subject', subjects)
      if (type) query = query.eq('question_type', type)
      const [{ data }, { data: excluded }] = await Promise.all([
        query,
        supabase.from('user_excluded_questions').select('question_id').eq('user_id', userId),
      ])
      let rows = (data ?? []) as { id: string; subject: string | null; key_points: string | null; seq_number: number | null }[]
      const excludedIds = new Set((excluded ?? []).map((e: any) => e.question_id))
      rows = rows.filter(r => !excludedIds.has(r.id))

      const existingIds = new Set(oldIds)
      newQuestions = rows.filter(r => {
        if (!r.key_points) return false
        if (existingIds.has(r.id)) return false
        const kpList = r.key_points.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
        return addedKps.some(k => kpList.includes(k))
      })
    }

    // 2. Keep old questions not belonging to removed KPs
    const currentId = oldIds[currentIndex]
    const keptQuestions: { id: string; kp: string | null; seq: number | null; subj: string | null }[] = []
    const oldSubjs = get().questionSubjects
    for (let i = 0; i < oldIds.length; i++) {
      const kp = oldKpsArr[i]
      if (!kp || !removedKps.has(kp)) {
        keptQuestions.push({ id: oldIds[i], kp, seq: null, subj: oldSubjs[i] ?? null })
      }
    }

    // 3. Merge and re-sort
    const allQuestions = [
      ...keptQuestions,
      ...newQuestions.map(q => ({
        id: q.id,
        kp: q.key_points?.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)[0] ?? null,
        seq: q.seq_number ?? 999999,
        subj: q.subject || null,
      })),
    ].sort((a, b) => {
      const cmp = (a.kp ?? '').localeCompare(b.kp ?? '', 'zh-CN', { numeric: true })
      if (cmp !== 0) return cmp
      return (a.seq ?? 999999) - (b.seq ?? 999999)
    })

    const newIds = allQuestions.map(q => q.id)
    const newKpsArr = allQuestions.map(q => q.kp)
    const newSubjArr = allQuestions.map(q => q.subj)
    const newIndex = newIds.indexOf(currentId)

    // If current question was removed, stay at the same sorted position
    let finalIndex: number
    if (newIndex >= 0) {
      finalIndex = newIndex
    } else if (newIds.length === 0) {
      finalIndex = 0
    } else {
      finalIndex = Math.min(currentIndex, newIds.length - 1)
    }

    const newKey = makeSessionKey(newKps)
    set({
      selectedKps: newKps, sessionKey: newKey,
      questionIds: newIds, questionKps: newKpsArr, questionSubjects: newSubjArr,
      currentIndex: finalIndex,
    })

    if (oldKey) supabase.from('practice_sequential_state').delete().eq('user_id', userId).eq('session_key', oldKey).then(() => {})
    const { selectedKps: sKps, questionIds: qids, currentIndex: idx } = get()
    supabase.from('practice_sequential_state').upsert({
      user_id: userId, session_key: newKey, selected_kps: sKps, question_ids: qids,
      current_index: idx, subject_positions: subjectPositions, updated_at: new Date().toISOString(),
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
