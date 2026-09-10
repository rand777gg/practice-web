import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FocusMode = 'stopwatch' | 'pomodoro'

/** 番茄钟一轮时长 */
export const POMODORO_SEC = 25 * 60

export interface FinishedSession {
  mode: FocusMode
  startedAt: string
  durationSec: number
}

interface FocusState {
  mode: FocusMode
  running: boolean
  /** 已累计秒数(不含正在进行的这一段) */
  accumulatedSec: number
  /** 当前这一段开始的时间戳(ms), 暂停时为 null */
  segmentStartedAt: number | null
  /** 本轮会话开始时间(ISO), 用于写库 */
  sessionStartedAt: string | null
  /** 结束一次会话后自增, 统计 hook 靠它重新拉取 */
  statsVersion: number
  setMode: (mode: FocusMode) => void
  start: () => void
  pause: () => void
  /** 结束本轮并清空, 返回可写库的数据(不足 1 秒返回 null) */
  finish: () => FinishedSession | null
  bumpStats: () => void
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      mode: 'stopwatch',
      running: false,
      accumulatedSec: 0,
      segmentStartedAt: null,
      sessionStartedAt: null,
      statsVersion: 0,

      setMode: (mode) => {
        const s = get()
        // 计时中或已有累计时间时不允许切换, 避免一次会话跨两种语义
        if (s.running || s.accumulatedSec > 0 || s.sessionStartedAt) return
        set({ mode })
      },

      start: () => {
        const s = get()
        if (s.running) return
        set({
          running: true,
          segmentStartedAt: Date.now(),
          sessionStartedAt: s.sessionStartedAt ?? new Date().toISOString(),
        })
      },

      pause: () => {
        const s = get()
        if (!s.running || s.segmentStartedAt === null) return
        const add = Math.floor((Date.now() - s.segmentStartedAt) / 1000)
        set({ running: false, segmentStartedAt: null, accumulatedSec: s.accumulatedSec + add })
      },

      finish: () => {
        const s = get()
        const add = s.running && s.segmentStartedAt !== null
          ? Math.floor((Date.now() - s.segmentStartedAt) / 1000)
          : 0
        const durationSec = s.accumulatedSec + add
        const session = durationSec >= 1 && s.sessionStartedAt
          ? { mode: s.mode, startedAt: s.sessionStartedAt, durationSec }
          : null
        set({
          running: false,
          segmentStartedAt: null,
          accumulatedSec: 0,
          sessionStartedAt: null,
          statsVersion: s.statsVersion + 1,
        })
        return session
      },

      bumpStats: () => set((s) => ({ statsVersion: s.statsVersion + 1 })),
    }),
    { name: 'focus_timer' },
  ),
)

/** 当前秒表读数(含进行中的一段); 调用方需每秒重渲染一次才能刷新 */
export function focusElapsedSec(s: {
  running: boolean
  accumulatedSec: number
  segmentStartedAt: number | null
}): number {
  return s.accumulatedSec + (s.running && s.segmentStartedAt !== null
    ? Math.floor((Date.now() - s.segmentStartedAt) / 1000)
    : 0)
}

/** 25:00 / 1:02:03 */
export function formatClock(sec: number): string {
  const s = Math.max(Math.floor(sec), 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 2h15m / 45m / 30s */
export function formatDuration(sec: number): string {
  const s = Math.max(Math.floor(sec), 0)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h${m}m`
}
