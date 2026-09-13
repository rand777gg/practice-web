import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { pluginDefaults } from '@/lib/plugin-catalog'

export interface UserPlugin {
  plugin_id: string
  enabled: boolean
  config: Record<string, number | boolean>
}

interface PluginState {
  rows: Record<string, UserPlugin>
  loaded: boolean
  load: () => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  setConfig: (id: string, config: Record<string, number | boolean>) => Promise<void>
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function toRow(raw: { plugin_id: string; enabled: boolean; config: unknown }): UserPlugin {
  const config = raw.config && typeof raw.config === 'object' ? (raw.config as Record<string, number | boolean>) : {}
  return { plugin_id: raw.plugin_id, enabled: raw.enabled, config }
}

export const usePluginStore = create<PluginState>((set) => ({
  rows: {},
  loaded: false,

  async load() {
    const userId = await currentUserId()
    if (!userId) {
      set({ rows: {}, loaded: true })
      return
    }
    const { data, error } = await supabase
      .from('user_plugins')
      .select('plugin_id, enabled, config')
      .eq('user_id', userId)
    if (error) {
      set({ loaded: true })
      return
    }
    const rows: Record<string, UserPlugin> = {}
    for (const raw of data ?? []) rows[raw.plugin_id] = toRow(raw)
    set({ rows, loaded: true })
  },

  async setEnabled(id, enabled) {
    const userId = await currentUserId()
    if (!userId) throw new Error('未登录')
    const existing = usePluginStore.getState().rows[id]
    const config = existing?.config ?? {}
    const { error } = await supabase
      .from('user_plugins')
      .upsert({ user_id: userId, plugin_id: id, enabled, config }, { onConflict: 'user_id,plugin_id' })
    if (error) throw new Error(error.message)
    set((state) => ({ rows: { ...state.rows, [id]: { plugin_id: id, enabled, config } } }))
  },

  async setConfig(id, config) {
    const userId = await currentUserId()
    if (!userId) throw new Error('未登录')
    const enabled = usePluginStore.getState().rows[id]?.enabled ?? false
    const { error } = await supabase
      .from('user_plugins')
      .upsert({ user_id: userId, plugin_id: id, enabled, config }, { onConflict: 'user_id,plugin_id' })
    if (error) throw new Error(error.message)
    set((state) => ({ rows: { ...state.rows, [id]: { plugin_id: id, enabled, config } } }))
  },
}))

/** 同步取用:插件都挂在渲染路径上,不能为了读开关变成异步 */
export function getPlugin(id: string): UserPlugin {
  const row = usePluginStore.getState().rows[id]
  return {
    plugin_id: id,
    enabled: row?.enabled ?? false,
    config: { ...pluginDefaults(id), ...(row?.config ?? {}) },
  }
}

export function isPluginEnabled(id: string): boolean {
  return getPlugin(id).enabled
}
