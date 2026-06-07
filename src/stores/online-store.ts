import { create } from 'zustand'

interface OnlineState {
  onlineIds: Set<string>
  setOnlineIds: (ids: Set<string>) => void
}

export const useOnlineStore = create<OnlineState>((set) => ({
  onlineIds: new Set(),
  setOnlineIds: (ids) => set({ onlineIds: ids }),
}))
