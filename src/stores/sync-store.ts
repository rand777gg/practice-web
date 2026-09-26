import { create } from 'zustand'
import {
  drainOutbox,
  getOutboxStats,
  installOutboxTriggers,
  type OutboxOperation,
} from '@/lib/offline-db'
import { insertAnswers } from '@/services/practice'
import { useAuthStore } from '@/stores/auth-store'
import { registerUserScopedStore } from '@/stores/user-scope'

interface SyncState {
  /** 待重试的条数 */
  pendingCount: number
  /** 已放弃自动重试的条数（校验/权限/冲突），需要人看一眼 */
  failedCount: number
  syncing: boolean
  refresh: () => Promise<void>
  sync: () => Promise<void>
  /** 进应用后调一次：挂上"网络恢复 / 回到前台 / 定时"三个触发点 */
  start: () => void
  reset: () => void
}

let stopTriggers: (() => void) | null = null

export const useSyncStore = create<SyncState>((set, get) => ({
  pendingCount: 0,
  failedCount: 0,
  syncing: false,

  refresh: async () => {
    // 只统计当前用户的：队列是设备级的，上一个人的待办不该显示在新用户头上
    const stats = await getOutboxStats(useAuthStore.getState().user?.id ?? null)
    set({ pendingCount: stats.pending, failedCount: stats.failed })
  },

  sync: async () => {
    if (get().syncing) return
    // 离网时直接跳过：省掉一次必然失败的事务读
    if (!navigator.onLine) return
    // 没登录就别发：队列里的操作都带着各自的 user_id，没有会话时发出去只会被 RLS 拒
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    set({ syncing: true })
    try {
      // 一次发一条，失败按类型分流（见 drainOutbox）。同一次作答重试多少次都用同一个
      // client_operation_id —— 服务端幂等键那一列（migration Section 100）已上线，
      // 所以"响应丢了、重试又插一次"现在会撞唯一索引得到 23505，
      // drainOutbox 把那种情况当成功出队（见 isIdempotencyConflict）。
      await drainOutbox(async (op: OutboxOperation) => {
        await insertAnswers([{
          user_id: op.payload.user_id,
          question_id: op.payload.question_id,
          selected_answer: op.payload.selected_answer,
          is_correct: op.payload.is_correct,
          mode: op.payload.mode,
          exam_session_id: op.payload.exam_session_id,
          source: op.payload.source,
          answered_at: op.payload.answered_at,
          client_operation_id: op.clientOperationId,
        }])
      }, { userId })
    } finally {
      set({ syncing: false })
      await get().refresh()
    }
  },

  start: () => {
    if (stopTriggers) return
    stopTriggers = installOutboxTriggers(() => { void get().sync() })
  },

  // 待同步条数是设备级的本地待办；换号后不能把它显示成新用户的，更不能顺手替他上传。
  // 靠"按 user_id 过滤"（见 offline-db 的 takeDueOperations / getOutboxStats）而不是清空队列 ——
  // 旧用户下次登回来，他自己那些还没发出去的作答还在。
  reset: () => {
    stopTriggers?.()
    stopTriggers = null
    set({ pendingCount: 0, failedCount: 0, syncing: false })
  },
}))

registerUserScopedStore(() => useSyncStore.getState().reset())
