import { create } from 'zustand'

interface QuickSearchState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useQuickSearchStore = create<QuickSearchState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
