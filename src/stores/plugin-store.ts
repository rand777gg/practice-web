import { create } from 'zustand'
import { pluginDefaults } from '@/lib/plugin-catalog'
import { fetchUserPlugins, upsertUserPlugin, type UserPlugin } from '@/services/account'
import { logError, userMessage } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { registerUserScopedStore } from '@/stores/user-scope'

interface PluginState {
  rows: Record<string, UserPlugin>
  loaded: boolean
  load: () => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  setConfig: (id: string, config: Record<string, number | boolean>) => Promise<void>
  reset: () => void
}

export const usePluginStore = create<PluginState>((set) => ({
  rows: {},
  loaded: false,

  async load() {
    const userId = useAuthStore.getState().user?.id
    if (!userId) {
      set({ rows: {}, loaded: true })
      return
    }
    let plugins: UserPlugin[]
    try {
      plugins = await fetchUserPlugins(userId)
    } catch (e) {
      logError('plugin.load', e)
      set({ loaded: true })
      return
    }
    const rows: Record<string, UserPlugin> = {}
    for (const plugin of plugins) rows[plugin.plugin_id] = plugin
    set({ rows, loaded: true })
  },

  async setEnabled(id, enabled) {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('未登录')
    const config = usePluginStore.getState().rows[id]?.config ?? {}
    const plugin: UserPlugin = { plugin_id: id, enabled, config }
    try {
      await upsertUserPlugin(userId, plugin)
    } catch (e) {
      logError('plugin.setEnabled', e)
      throw new Error(`保存插件失败: ${userMessage(e)}`, { cause: e })
    }
    set((state) => ({ rows: { ...state.rows, [id]: plugin } }))
  },

  async setConfig(id, config) {
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('未登录')
    const enabled = usePluginStore.getState().rows[id]?.enabled ?? false
    const plugin: UserPlugin = { plugin_id: id, enabled, config }
    try {
      await upsertUserPlugin(userId, plugin)
    } catch (e) {
      logError('plugin.setConfig', e)
      throw new Error(`保存插件失败: ${userMessage(e)}`, { cause: e })
    }
    set((state) => ({ rows: { ...state.rows, [id]: plugin } }))
  },

  /** loaded 一并清掉：插件开关决定挂哪些全局副作用，绝不能沿用上一个用户的状态 */
  reset: () => set({ rows: {}, loaded: false }),
}))

registerUserScopedStore(() => usePluginStore.getState().reset())

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
