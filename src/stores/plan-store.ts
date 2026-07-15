import { create } from 'zustand'

interface PlanStore {
  todaySubjectDone: Record<string, number>
  addDone: (subject: string) => void
  reset: () => void
}

export const usePlanStore = create<PlanStore>((set) => ({
  todaySubjectDone: {},
  addDone: (subject) => set((s) => {
    const key = subject || 'Other'
    return { todaySubjectDone: { ...s.todaySubjectDone, [key]: (s.todaySubjectDone[key] ?? 0) + 1 } }
  }),
  reset: () => set({ todaySubjectDone: {} }),
}))
