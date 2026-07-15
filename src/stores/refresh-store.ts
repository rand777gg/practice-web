import { create } from 'zustand'

interface RefreshState {
  version: number
  planVersion: number
  bump: () => void
  bumpPlan: () => void
}

export const useRefreshStore = create<RefreshState>((set) => ({
  version: 0,
  planVersion: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
  bumpPlan: () => set((s) => ({ planVersion: s.planVersion + 1 })),
}))
