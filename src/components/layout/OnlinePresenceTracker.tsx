import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStore } from '@/stores/online-store'

export function OnlinePresenceTracker() {
  const user = useAuthStore((s) => s.user)
  const setOnlineIds = useOnlineStore((s) => s.setOnlineIds)
  const tracked = useRef(false)

  useEffect(() => {
    if (!user) return

    const channel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>
        setOnlineIds(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !tracked.current) {
          tracked.current = true
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      tracked.current = false
      setOnlineIds(new Set())
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  return null
}
