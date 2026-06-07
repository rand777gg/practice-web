import { useOnlineStore } from '@/stores/online-store'

export function useOnlineUsers() {
  return useOnlineStore((s) => s.onlineIds)
}
