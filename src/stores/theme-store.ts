import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type ThemeMode = 'light' | 'dark' | 'system'

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch { /* noop */ }
  return 'system'
}

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

const media = window.matchMedia('(prefers-color-scheme: dark)')

interface ThemeState {
  theme: Theme
  mode: ThemeMode
  setTheme: (theme: Theme) => void
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialMode = getStoredMode()
  const persist = (mode: ThemeMode) => {
    try { localStorage.setItem('theme', mode) } catch { /* noop */ }
  }
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', () => {
      if (get().mode === 'system') set({ theme: resolveTheme('system') })
    })
  }
  return {
    theme: resolveTheme(initialMode),
    mode: initialMode,
    setTheme: (theme) => {
      persist(theme)
      set({ theme, mode: theme })
    },
    setMode: (mode) => {
      persist(mode)
      set({ theme: resolveTheme(mode), mode })
    },
    toggle: () => {
      const next: Theme = get().theme === 'light' ? 'dark' : 'light'
      persist(next)
      set({ theme: next, mode: next })
    },
  }
})
