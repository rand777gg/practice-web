import { create } from 'zustand'

export type Lang = 'zh' | 'en'

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem('lang')
    if (stored === 'zh' || stored === 'en') return stored
  } catch { /* noop */ }
  return 'zh'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: getInitialLang(),
  setLang: (lang) => {
    try { localStorage.setItem('lang', lang) } catch { /* noop */ }
    set({ lang })
  },
  toggle: () => {
    const next = get().lang === 'zh' ? 'en' : 'zh'
    get().setLang(next)
  },
}))
