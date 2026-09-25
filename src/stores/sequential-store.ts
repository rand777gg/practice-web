import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  deleteSequentialState, fetchExcludedQuestionIds, fetchSequentialShortId, fetchSequentialStates, upsertSequentialState,
  type SequentialState,
} from '@/services/practice'
import { fetchQuestionKeyPoints, fetchQuestionsByKeyPoints, type QuestionKpLookupSource } from '@/services/questions'
import { logError } from '@/services/errors'
import { registerUserScopedStore } from '@/stores/user-scope'
import { rpcJson } from '@/services/db'

export interface SessionInfo {
  sessionKey: string
  selectedKps: string[]
  planSubjects: string[]
  questionIds: string[]
  currentIndex: number
  subjectPositions: Record<string, number>
  updatedAt: string
  createdAt: string
}

/*
 * PostgREST 把 RPC 的返回一律当成 Json, 服务端函数真正的返回形状只能在前端声明一份 ——
 * 改 SQL 时要同步改这里(见 supabase/migrations/001_initial_schema.sql 的 start_sequential_session)。
 */
interface StartSequentialResult {
  sessionKey: string | null
  questionIds: string[]
  questionKps: string[]
  questionSubjects: string[]
  currentIndex: number
}

/** 形状照 001_initial_schema.sql 的 load_practice_session: 只在没找到会话时只回 found */
interface LoadPracticeSessionResult {
  found: boolean
  shortId?: string | null
  savedKps?: string[]
  subjectPositions?: Record<string, number>
  questionIds?: string[]
  questionKps?: (string | null)[]
  questionSubjects?: string[]
  currentIndex?: number
  firstQuestion?: Record<string, unknown> | null
  firstStats?: { total: number; wrong: number; note: string | null; isPublic: boolean } | null
}

interface SequentialStore {
  isActive: boolean
  sessionKey: string
  shortId: string
  selectedKps: string[]
  planSubjects: string[]
  questionIds: string[]
  questionKps: (string | null)[]
  questionSubjects: (string | null)[]
  currentIndex: number
  subjectPositions: Record<string, number>
  isLoading: boolean
  sessions: SessionInfo[]
  preloadedQuestion: Record<string, unknown> | null
  preloadedStats: { total: number; wrong: number; note: string | null; isPublic: boolean } | null
  preloadedIndex: number
  syncStatus: 'idle' | 'syncing' | 'synced'
  lastSyncAt: string | null
  startSequential: (userId: string, kps: string[], subjects: string[], type: string, ignoreAnswered?: boolean) => Promise<void>
  nextQuestion: () => void
  reset: () => void
  saveToDb: (userId: string) => Promise<void>
  loadFromDb: (userId: string, sessionKey: string) => Promise<boolean>
  loadSessions: (userId: string) => Promise<void>
  switchSession: (userId: string, sessionKey: string) => Promise<void>
  mergeKps: (userId: string, newKps: string[], subjects: string[], type: string) => Promise<void>
  syncKpsFromPlanSubjects: (userId: string, planSubjects: string[]) => Promise<void>
  getCurrentKpInfo: () => { kpName: string | null; kpCurrent: number; kpTotal: number }
  consumePreloaded: () => { question: Record<string, unknown> | null; stats: { total: number; wrong: number; note: string | null; isPublic: boolean } | null } | null
  startSync: (userId: string) => void
  stopSync: () => void
  markLocalSave: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let syncChannel: RealtimeChannel | null = null
let syncTimeout: ReturnType<typeof setTimeout> | null = null
let gLastLocalSave = 0

/** 学科范围是否一致(顺序无关): 会话是按"计划学科范围"认领的, 范围内涵变了就得换会话 */
export function sameSubjects(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((subject) => rightSet.has(subject))
}

function makeSessionKey(kps: string[], subjects: string[], type: string): string {
  return JSON.stringify({
    planSubjects: [...new Set(subjects)].sort(),
    keyPoints: [...new Set(kps)].sort(),
    questionType: type || null,
  })
}

export function markPracticeSync() { gLastLocalSave = Date.now() }

export const useSequentialStore = create<SequentialStore>((set, get) => ({
  isActive: false, sessionKey: '', shortId: '', selectedKps: [], planSubjects: [], questionIds: [], questionKps: [], questionSubjects: [], currentIndex: 0, isLoading: false, sessions: [], subjectPositions: {}, preloadedQuestion: null, preloadedStats: null, preloadedIndex: -1, syncStatus: 'idle', lastSyncAt: null,

  startSequential: async (userId, kps, subjects, type, ignoreAnswered = false) => {
    set({ isLoading: true, selectedKps: kps })
    try {
      const sessionKey = makeSessionKey(kps, subjects, type)
      const { data, error } = await supabase.rpc('start_sequential_session', {
        p_user_id: userId, p_kps: kps,
        p_subjects: subjects.length > 0 ? subjects : undefined,
        p_question_type: type || undefined,
        p_session_key: sessionKey,
        p_ignore_answered: ignoreAnswered,
      })
      if (error || !data) { set({ isLoading: false }); return }
      // start_sequential_session RETURNS JSONB，生成类型只有 Json；形状见 001_initial_schema.sql
      const session = rpcJson<StartSequentialResult>(data)
      if (!session) { set({ isLoading: false }); return }

      set({
        sessionKey: session.sessionKey || sessionKey,
        planSubjects: subjects,
        questionIds: session.questionIds ?? [],
        questionKps: session.questionKps ?? [],
        questionSubjects: session.questionSubjects ?? [],
        currentIndex: session.currentIndex ?? 0,
        isActive: true, isLoading: false,
      })
      const { selectedKps: sKps, questionIds: qids, currentIndex: idx, subjectPositions: sps } = get()
      gLastLocalSave = Date.now()
      try {
        await upsertSequentialState({
          user_id: userId, session_key: sessionKey, selected_kps: sKps, question_ids: qids,
          plan_subjects: subjects, current_index: idx, subject_positions: sps,
        })
      } catch (e) {
        logError('sequential.startSequential', e)
      }
      try {
        const shortId = await fetchSequentialShortId(userId, sessionKey)
        if (shortId) set({ shortId })
      } catch (e) {
        logError('sequential.startSequential.shortId', e)
      }
    } catch { set({ isLoading: false }) }
  },

  nextQuestion: () => {
    const { currentIndex, questionIds } = get()
    if (currentIndex < questionIds.length) set({ currentIndex: currentIndex + 1 })
  },

  reset: () => set({ isActive: false, sessionKey: '', shortId: '', selectedKps: [], planSubjects: [], questionIds: [], questionKps: [], currentIndex: 0, isLoading: false, subjectPositions: {}, preloadedQuestion: null, preloadedStats: null, preloadedIndex: -1 }),

  saveToDb: async (userId) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const { selectedKps, planSubjects, questionIds, currentIndex, sessionKey, subjectPositions } = get()
      if (!sessionKey) return
      gLastLocalSave = Date.now()
      try {
        await upsertSequentialState({
          user_id: userId, session_key: sessionKey, selected_kps: selectedKps, question_ids: questionIds,
          plan_subjects: planSubjects, current_index: currentIndex, subject_positions: subjectPositions,
        })
      } catch (e) {
        logError('sequential.saveToDb', e)
      }
    }, 300)
  },

  loadFromDb: async (userId, sessionKey) => {
    const { data, error } = await supabase.rpc('load_practice_session', { p_user_id: userId, p_session_key: sessionKey })
    if (error || !data) return false
    // load_practice_session RETURNS JSONB，生成类型只有 Json；形状见 001_initial_schema.sql
    const session = rpcJson<LoadPracticeSessionResult>(data)
    if (!session?.found) return false

    const ids: string[] = session.questionIds ?? []
    const idx = session.currentIndex ?? 0
    set({
      isActive: ids.length > 0,
      sessionKey,
      shortId: session.shortId ?? '',
      selectedKps: session.savedKps ?? [],
      // 服务端这个函数不回 planSubjects, 只能从会话列表里认
      planSubjects: get().sessions.find((s) => s.sessionKey === sessionKey)?.planSubjects ?? [],
      questionIds: ids,
      questionKps: session.questionKps ?? [],
      questionSubjects: session.questionSubjects ?? [],
      currentIndex: idx,
      subjectPositions: session.subjectPositions ?? {},
      preloadedQuestion: (session.firstQuestion ?? null) as Record<string, unknown> | null,
      preloadedStats: session.firstStats ?? null,
      preloadedIndex: ids.length > 0 ? idx : -1,
    })
    return ids.length > 0
  },

  consumePreloaded: () => {
    const { preloadedQuestion, preloadedStats, preloadedIndex } = get()
    if (!preloadedQuestion || preloadedIndex < 0) return null
    set({ preloadedQuestion: null, preloadedStats: null, preloadedIndex: -1 })
    return { question: preloadedQuestion, stats: preloadedStats }
  },

  loadSessions: async (userId) => {
    let states: SequentialState[] = []
    try {
      states = await fetchSequentialStates(userId)
    } catch (e) {
      logError('sequential.loadSessions', e)
    }
    const sessions: SessionInfo[] = states.map((state) => ({
      sessionKey: state.session_key,
      selectedKps: state.selected_kps,
      planSubjects: state.plan_subjects,
      questionIds: state.question_ids,
      currentIndex: state.current_index,
      subjectPositions: state.subject_positions,
      updatedAt: state.updated_at,
      createdAt: state.created_at,
    }))
    set({ sessions })
  },

  switchSession: async (userId, sessionKey) => {
    const { sessionKey: currentKey } = get()
    if (currentKey) {
      // Save current session before switching
      const { selectedKps, planSubjects, questionIds, currentIndex } = get()
      const { subjectPositions } = get()
      gLastLocalSave = Date.now()
      try {
        await upsertSequentialState({
          user_id: userId, session_key: currentKey, selected_kps: selectedKps, question_ids: questionIds,
          plan_subjects: planSubjects, current_index: currentIndex, subject_positions: subjectPositions,
        })
      } catch (e) {
        logError('sequential.switchSession', e)
      }
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
    const { selectedKps: oldKps, planSubjects: oldPlanSubjects, questionIds: oldIds, currentIndex, sessionKey: oldKey, questionKps: oldKpsArr, subjectPositions } = get()
    const oldKpSet = new Set(oldKps)
    const addedKps = newKps.filter(k => !oldKpSet.has(k))
    const removedKps = new Set(oldKps.filter(k => !newKps.includes(k)))

    if (addedKps.length === 0 && removedKps.size === 0) return

    // 1. Fetch new questions for added KPs
    let newQuestions: QuestionKpLookupSource[] = []
    if (addedKps.length > 0) {
      let rows: QuestionKpLookupSource[] = []
      let excludedIds: string[] = []
      try {
        ;[rows, excludedIds] = await Promise.all([
          fetchQuestionsByKeyPoints({
            keyPoints: addedKps,
            subjects: subjects.length > 0 ? subjects : undefined,
            questionType: type || undefined,
          }),
          fetchExcludedQuestionIds(userId),
        ])
      } catch (e) {
        logError('sequential.mergeKps', e)
      }
      const excluded = new Set(excludedIds)

      const existingIds = new Set(oldIds)
      newQuestions = rows.filter(r => {
        if (!r.key_points) return false
        if (excluded.has(r.id)) return false
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
      const subjCmp = (a.subj ?? '').localeCompare(b.subj ?? '', 'zh-CN', { numeric: true })
      if (subjCmp !== 0) return subjCmp
      const kpCmp = (a.kp ?? '').localeCompare(b.kp ?? '', 'zh-CN', { numeric: true })
      if (kpCmp !== 0) return kpCmp
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

    const newKey = makeSessionKey(newKps, subjects.length > 0 ? subjects : oldPlanSubjects, type)
    set({
      selectedKps: newKps, planSubjects: subjects.length > 0 ? subjects : oldPlanSubjects, sessionKey: newKey,
      questionIds: newIds, questionKps: newKpsArr, questionSubjects: newSubjArr,
      currentIndex: finalIndex,
    })

    if (oldKey) {
      deleteSequentialState(userId, oldKey).catch((e) => { logError('sequential.mergeKps.deleteOld', e) })
    }
    const { selectedKps: sKps, questionIds: qids, currentIndex: idx } = get()
    gLastLocalSave = Date.now()
    upsertSequentialState({
      user_id: userId, session_key: newKey, selected_kps: sKps, question_ids: qids,
      plan_subjects: subjects.length > 0 ? subjects : oldPlanSubjects, current_index: idx, subject_positions: subjectPositions,
    }).catch((e) => { logError('sequential.mergeKps.save', e) })
  },

  syncKpsFromPlanSubjects: async (userId, planSubjects) => {
    if (planSubjects.length === 0) return

    // Query all KPs for these subjects
    const kps = new Set<string>()
    try {
      for (const keyPoints of await fetchQuestionKeyPoints(planSubjects)) {
        for (const k of keyPoints.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)) kps.add(k)
      }
    } catch (e) {
      logError('sequential.syncKpsFromPlanSubjects', e)
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

  markLocalSave: () => { gLastLocalSave = Date.now() },

  startSync: (userId) => {
    if (syncChannel) return
    const channel = supabase
      .channel(`practice-sync-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'practice_sequential_state', filter: `user_id=eq.${userId}` },
        async (payload) => {
          // Ignore own changes (within 2s of local save)
          if (Date.now() - gLastLocalSave < 2000) return

          const remoteUpdated = payload.new.updated_at as string
          const newIndex = payload.new.current_index as number
          const newIds = payload.new.question_ids as string[]
          const sessionKey = payload.new.session_key as string

          set({ syncStatus: 'syncing' })

          // Reload sessions list
          await get().loadSessions(userId)

          // If the changed session is our current one, check if we need to reload
          const current = get()
          if (sessionKey === current.sessionKey && current.isActive) {
            // Only reload if remote has different progress (more questions answered)
            if (newIndex !== current.currentIndex || newIds.length !== current.questionIds.length) {
              await get().loadFromDb(userId, sessionKey)
            }
          }

          set({ syncStatus: 'synced', lastSyncAt: remoteUpdated })
          if (syncTimeout) clearTimeout(syncTimeout)
          syncTimeout = setTimeout(() => {
            if (get().syncStatus === 'synced') set({ syncStatus: 'idle' })
          }, 3000)
        }
      )
      .subscribe()

    syncChannel = channel
  },

  stopSync: () => {
    if (syncChannel) {
      syncChannel.unsubscribe()
      supabase.removeChannel(syncChannel)
      syncChannel = null
    }
    if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null }
  },
}))

// 顺序刷题进度是按用户存的（practice_sequential_state），换号时必须断开实时通道并清空
registerUserScopedStore(() => {
  useSequentialStore.getState().stopSync()
  useSequentialStore.getState().reset()
})
