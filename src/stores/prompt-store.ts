import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { PROMPT_DEFS, extractVariables, getPromptDefault } from '@/lib/ai/prompt-catalog'

export interface UserPrompt {
  prompt_key: string
  title: string | null
  body: string
  variables: string[]
  enabled: boolean
}

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
}

function toRow(raw: {
  prompt_key: string
  title: string | null
  body: string
  variables: string[] | null
  enabled: boolean
}): UserPrompt {
  return {
    prompt_key: raw.prompt_key,
    title: raw.title,
    body: raw.body,
    variables: raw.variables ?? [],
    enabled: raw.enabled,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const usePromptStore = create<PromptState>((set) => ({
  rows: {},
  loaded: false,

  async load() {
    const userId = await currentUserId()
    if (!userId) {
      set({ rows: {}, loaded: true })
      return
    }
    const { data, error } = await supabase
      .from('user_prompts')
      .select('prompt_key, title, body, variables, enabled')
      .eq('user_id', userId)
    if (error) {
      // 读不到就退回内置默认,页面自己会提示;不抛错以免连带打断 AI 调用
      set({ loaded: true })
      return
    }
    const rows: Record<string, UserPrompt> = {}
    for (const raw of data ?? []) rows[raw.prompt_key] = toRow(raw)

    // 把收敛前存在 localStorage 的自定义搬进库里,只搬一次
    for (const [key, storageKey] of Object.entries(LEGACY_KEYS)) {
      let legacy: string | null = null
      try {
        legacy = localStorage.getItem(storageKey)
      } catch { /* 隐私模式下 localStorage 可能不可用 */ }
      if (!legacy || rows[key] || legacy === getPromptDefault(key)) continue
      const variables = extractVariables(legacy)
      const { error: upsertError } = await supabase
        .from('user_prompts')
        .upsert({ user_id: userId, prompt_key: key, body: legacy, variables }, { onConflict: 'user_id,prompt_key' })
      if (!upsertError) {
        rows[key] = { prompt_key: key, title: null, body: legacy, variables, enabled: true }
        try {
          localStorage.removeItem(storageKey)
        } catch { /* ignore */ }
      }
    }

    set({ rows, loaded: true })
  },

  async seedBuiltins() {
    const userId = await currentUserId()
    if (!userId) return
    const missing = PROMPT_DEFS.filter((def) => !usePromptStore.getState().rows[def.key])
    if (!missing.length) return
    const { error } = await supabase
      .from('user_prompts')
      .upsert(
        missing.map((def) => ({
          user_id: userId,
          prompt_key: def.key,
          body: def.default,
          variables: extractVariables(def.default),
        })),
        { onConflict: 'user_id,prompt_key', ignoreDuplicates: true },
      )
    if (error) return
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

  async save(key, body, title, enabled = true) {    const userId = await currentUserId()
    if (!userId) throw new Error('未登录')
    const variables = extractVariables(body)
    const { error } = await supabase
      .from('user_prompts')
      .upsert(
        { user_id: userId, prompt_key: key, body, title: title ?? null, variables, enabled },
        { onConflict: 'user_id,prompt_key' },
      )
    if (error) throw new Error(error.message)
    set((state) => ({
      rows: { ...state.rows, [key]: { prompt_key: key, title: title ?? null, body, variables, enabled } },
    }))
  },

  async remove(key) {
    const userId = await currentUserId()
    if (!userId) throw new Error('未登录')
    const { error } = await supabase.from('user_prompts').delete().eq('user_id', userId).eq('prompt_key', key)
    if (error) throw new Error(error.message)
    set((state) => {
      const rows = { ...state.rows }
      delete rows[key]
      return { rows }
    })
  },
}))

/**
 * 同步取用:调用点都在 generateText / generateObject 的参数里直接拼,
 * 不能为了读提示词变成异步,所以这里只读内存里的 zustand 状态。
 */
export function getPrompt(key: string): string {
  const row = usePromptStore.getState().rows[key]
  if (row && row.enabled && row.body.trim()) return row.body
  return getPromptDefault(key)
}
