import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const ALL_SYNCED_KEYS = [
  'lang',
  'ai_feature_flags',
  'eye_care',
  'dark_code_theme',
  'light_code_theme',
  'font_family',
  'font_size',
  'font_weight',
  'offline_mode',
  'note_recognition_mode',
  'bottom_nav_tabs',
  'sidebar_collapsed',
  'practice_shortcuts',
  'default_page',
] as const

export type SyncedKey = (typeof ALL_SYNCED_KEYS)[number]

const SYNC_DIRECTION_KEY = 'sync_direction'
const SYNC_AUTO_KEY = 'sync_auto'
const SYNC_LAST_AT_KEY = 'sync_last_at'
const SYNC_SELECTED_KEYS_KEY = 'sync_selected_keys'

interface SettingsSnapshot {
  [key: string]: unknown
}

export type SyncDirection = 'none' | 'upload_only' | 'download_only' | 'bidirectional'

interface SyncSettingsState {
  syncDirection: SyncDirection
  autoSync: boolean
  lastSyncAt: string | null
  syncing: boolean
  syncedKeys: SyncedKey[]

  setSyncDirection: (dir: SyncDirection) => void
  setAutoSync: (v: boolean) => void
  toggleSyncedKey: (key: SyncedKey) => void
  selectAllKeys: () => void
  deselectAllKeys: () => void

  uploadSettings: () => Promise<void>
  downloadSettings: () => Promise<void>
  syncNow: () => Promise<void>

  exportToFile: () => void
  importFromFile: (file: File) => Promise<boolean>
}

function loadSyncDirection(): SyncDirection {
  const v = localStorage.getItem(SYNC_DIRECTION_KEY)
  if (v === 'upload_only' || v === 'download_only' || v === 'bidirectional') return v
  return 'bidirectional'
}

function loadAutoSync(): boolean {
  return localStorage.getItem(SYNC_AUTO_KEY) === 'true'
}

function loadLastSyncAt(): string | null {
  return localStorage.getItem(SYNC_LAST_AT_KEY) || null
}

function loadSyncedKeys(): SyncedKey[] {
  try {
    const raw = localStorage.getItem(SYNC_SELECTED_KEYS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.filter((k): k is SyncedKey => (ALL_SYNCED_KEYS as readonly string[]).includes(k))
    }
  } catch { /* ignore */ }
  return [...ALL_SYNCED_KEYS]
}

function collectSettings(keys: SyncedKey[]): SettingsSnapshot {
  const snapshot: SettingsSnapshot = {}
  for (const key of keys) {
    const val = localStorage.getItem(key)
    if (val !== null) {
      try {
        snapshot[key] = JSON.parse(val)
      } catch {
        snapshot[key] = val
      }
    }
  }
  return snapshot
}

function applySettings(snapshot: SettingsSnapshot) {
  const event = new Event('settings-sync-apply')
  for (const key of ALL_SYNCED_KEYS) {
    if (key in snapshot) {
      const val = snapshot[key]
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val))
    }
  }
  window.dispatchEvent(event)
}

export const useSyncSettingsStore = create<SyncSettingsState>((set, get) => ({
  syncDirection: loadSyncDirection(),
  autoSync: loadAutoSync(),
  lastSyncAt: loadLastSyncAt(),
  syncing: false,
  syncedKeys: loadSyncedKeys(),

  setSyncDirection: (dir) => {
    localStorage.setItem(SYNC_DIRECTION_KEY, dir)
    set({ syncDirection: dir })
  },

  setAutoSync: (v) => {
    localStorage.setItem(SYNC_AUTO_KEY, String(v))
    set({ autoSync: v })
  },

  toggleSyncedKey: (key) => {
    const next = get().syncedKeys.includes(key)
      ? get().syncedKeys.filter((k) => k !== key)
      : [...get().syncedKeys, key]
    localStorage.setItem(SYNC_SELECTED_KEYS_KEY, JSON.stringify(next))
    set({ syncedKeys: next })
  },

  selectAllKeys: () => {
    const all = [...ALL_SYNCED_KEYS]
    localStorage.setItem(SYNC_SELECTED_KEYS_KEY, JSON.stringify(all))
    set({ syncedKeys: all })
  },

  deselectAllKeys: () => {
    localStorage.setItem(SYNC_SELECTED_KEYS_KEY, '[]')
    set({ syncedKeys: [] })
  },

  uploadSettings: async () => {
    const { syncing, syncedKeys } = get()
    if (syncing) return
    set({ syncing: true })
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const settings = collectSettings(syncedKeys)
      const now = new Date().toISOString()
      const { error } = await supabase.from('user_settings').upsert(
        { user_id: user.id, settings, updated_at: now },
        { onConflict: 'user_id' },
      )
      if (error) throw error

      localStorage.setItem(SYNC_LAST_AT_KEY, now)
      set({ lastSyncAt: now })
    } finally {
      set({ syncing: false })
    }
  },

  downloadSettings: async () => {
    const { syncing } = get()
    if (syncing) return
    set({ syncing: true })
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('user_settings')
        .select('settings, updated_at')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error
      if (!data?.settings) {
        set({ syncing: false })
        return
      }

      applySettings(data.settings as SettingsSnapshot)

      const serverTime = data.updated_at as string
      localStorage.setItem(SYNC_LAST_AT_KEY, serverTime)
      set({ lastSyncAt: serverTime })
      window.location.reload()
    } catch {
      // ignore
    } finally {
      set({ syncing: false })
    }
  },

  syncNow: async () => {
    const { syncDirection, uploadSettings, downloadSettings } = get()
    if (syncDirection === 'none') return

    if (syncDirection === 'upload_only') {
      await uploadSettings()
    } else if (syncDirection === 'download_only') {
      await downloadSettings()
    } else if (syncDirection === 'bidirectional') {
      await uploadSettings()
      await downloadSettings()
    }
  },

  exportToFile: () => {
    const { syncedKeys } = get()
    const settings = collectSettings(syncedKeys)
    settings['exported_at'] = new Date().toISOString()
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `practice-web-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importFromFile: async (file) => {
    try {
      const text = await file.text()
      const snapshot = JSON.parse(text)
      if (typeof snapshot !== 'object' || snapshot === null) return false
      applySettings(snapshot)
      window.location.reload()
      return true
    } catch {
      return false
    }
  },
}))
