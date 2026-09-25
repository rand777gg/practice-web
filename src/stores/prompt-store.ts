import { create } from 'zustand'
import { PROMPT_DEFS, extractVariables, getPromptDefault } from '@/lib/ai/prompt-catalog'
import { deleteUserPrompt, fetchUserPrompts, saveUserPrompt, seedUserPrompts, type UserPrompt } from '@/services/account'
import { logError, userMessage } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { registerUserScopedStore } from '@/stores/user-scope'

/** 收敛前的老 key(localStorage),首次加载时搬进库里 */
const LEGACY_KEYS: Record<string, string> = {
  extract: 'ai_prompt_extract',
  generate_doc: 'ai_prompt_generate_doc',
}

interface PromptState {
  rows: Record<string, UserPrompt>
  loaded: boolean
  load: () => Promise<void>
  /** 把用户还没碰过的内置提示词按其默认值落进他的账号,这样 MCP 端点才取得到内容 */
  seedBuiltins: () => Promise<void>
  save: (key: string, body: string, title?: string | null, enabled?: boolean) => Promise<void>
  remove: (key: string) => Promise<void>
  reset: () => void
}

export const usePromptStore = create<PromptState>((set) => ({
  rows: {},
  loaded: false,

  async load() {
    const userId = useAuthStore.getState().user?.id
    if (!userId) {
      set({ rows: {}, loaded: true })
      return
    }
    let prompts: UserPrompt[]
    try {
      prompts = await fetchUserPrompts(userId)
    } catch (e) {
      // 读不到就退回内置默认,页面自己会提示;不抛错以免连带打断 AI 调用
      logError('prompt.load', e)
      set({ loaded: true })
      return
    }
    const rows: Record<string, UserPrompt> = {}
    for (const prompt of prompts) rows[prompt.prompt_key] = prompt

    // 把收敛前存在 localStorage 的自定义搬进库里,只搬一次
    for (const [key, storageKey] of Object.entries(LEGACY_KEYS)) {
      let legacy: string | null = null
      try {
        legacy = localStorage.getItem(storageKey)
      } catch { /* 隐私模式下 localStorage 可能不可用 */ }
      if (!legacy || rows[key] || legacy === getPromptDefault(key)) continue
      const variables = extractVariables(legacy)
      try {
        await saveUserPrompt(userId, { prompt_key: key, body: legacy, variables })
      } catch (e) {
        logError('prompt.migrateLegacy', e)
        continue
      }
      rows[key] = { prompt_key: key, title: null, body: legacy, variables, enabled: true }
      try {
        localStorage.removeItem(storageKey)
      } catch { /* ignore */ }
    }

    set({ rows, loaded: true })
  },

  async seedBuiltins() {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const missing = PROMPT_DEFS.filter((def) => !usePromptStore.getState().rows[def.key])
    if (!missing.length) return
    try {
      await seedUserPrompts(
        userId,
        missing.map((def) => ({
          prompt_key: def.key,
          body: def.default,
          variables: extractVariables(def.default),
        })),
      )
    } catch (e) {
      logError('prompt.seedBuiltins', e)
      return
    }
    set((state) => {
      const rows = { ...state.rows }
      for (const def of missing) {
        if (rows[def.key]) continue
        rows[def.key] = {
          prompt_key: def.key,
          title: null,
          body: def.default,
          variables: extractVariables(def.default),
          enabled: true,
        }
      }
      return { rows }
    })
  },

  async save(key, body, title, enabled = true) {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('未登录')
    const variables = extractVariables(body)
    try {
      await saveUserPrompt(userId, { prompt_key: key, body, title: title ?? null, variables, enabled })
    } catch (e) {
      logError('prompt.save', e)
      throw new Error(`保存提示词失败: ${userMessage(e)}`, { cause: e })
    }
    set((state) => ({
      rows: { ...state.rows, [key]: { prompt_key: key, title: title ?? null, body, variables, enabled } },
    }))
  },

  async remove(key) {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('未登录')
    try {
      await deleteUserPrompt(userId, key)
    } catch (e) {
      logError('prompt.remove', e)
      throw new Error(`删除提示词失败: ${userMessage(e)}`, { cause: e })
    }
    set((state) => {
      const rows = { ...state.rows }
      delete rows[key]
      return { rows }
    })
  },

  /** loaded 也一并清掉：这样下一个用户进来会重新 load，而不是直接吃到上一个人的提示词 */
  reset: () => set({ rows: {}, loaded: false }),
}))

registerUserScopedStore(() => usePromptStore.getState().reset())

/**
 * 同步取用:调用点都在 generateText / generateObject 的参数里直接拼,
 * 不能为了读提示词变成异步,所以这里只读内存里的 zustand 状态。
 */
export function getPrompt(key: string): string {
  const row = usePromptStore.getState().rows[key]
  if (row && row.enabled && row.body.trim()) return row.body
  return getPromptDefault(key)
}
