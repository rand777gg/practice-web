import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useFocusStore } from '@/stores/focus-store'

/** 北京时间当日零点(UTC 16:00), 与项目其它计划统计口径一致 */
function beijingMidnight(base: Date, daysBack = 0): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 16, 0, 0, 0))
  if (base < d) d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d
}

/** 北京时间下本周一距今天数(周一为一周起点) */
function daysSinceMonday(base: Date): number {
  const shifted = new Date(base.getTime() + 8 * 3600 * 1000)
  const dow = shifted.getUTCDay()
  return (dow + 6) % 7
}

export function useFocusStats() {
  const user = useAuthStore((s) => s.user)
  const statsVersion = useFocusStore((s) => s.statsVersion)
  const [todaySec, setTodaySec] = useState(0)
  const [weekSec, setWeekSec] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const uid = user.id
    let cancelled = false

    void (async () => {
      const now = new Date()
      const todayStart = beijingMidnight(now, 0)
      const weekStart = beijingMidnight(now, daysSinceMonday(now))

      const { data, error } = await supabase
        .from('focus_sessions')
        .select('started_at, duration_sec')
        .eq('user_id', uid)
        .gte('started_at', weekStart.toISOString())

      if (cancelled) return

      if (error) {
        console.error('useFocusStats:', error)
        setLoading(false)
        return
      }

      let week = 0
      let today = 0
      for (const row of (data ?? []) as { started_at: string; duration_sec: number }[]) {
        const sec = Number(row.duration_sec) || 0
        week += sec
        if (new Date(row.started_at) >= todayStart) today += sec
      }
      setTodaySec(today)
      setWeekSec(week)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [user, statsVersion])

  return { todaySec, weekSec, loading }
}
