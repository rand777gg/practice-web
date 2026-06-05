import { create } from 'zustand'

interface RefreshState {
  version: number
  bump: () => void
}

export const useRefreshStore = create<RefreshState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}))
