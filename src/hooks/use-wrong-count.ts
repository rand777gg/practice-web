import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'

export function useWrongCount() {
  const user = useAuthStore((s) => s.user)
  const version = useRefreshStore((s) => s.version)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) {
      setCount(0)
      return
    }
    supabase
      .from('user_answers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .then(({ count: c }) => setCount(c ?? 0))
  }, [user, version])

  return count
}
