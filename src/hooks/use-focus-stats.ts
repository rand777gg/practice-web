import { useEffect, useState } from 'react'
import { fetchFocusSessionStatsSince, type FocusSessionStat } from '@/services/account'
import { logError } from '@/services/errors'
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

      let rows: FocusSessionStat[]
      try {
        rows = await fetchFocusSessionStatsSince(uid, weekStart.toISOString())
      } catch (e) {
        if (cancelled) return
        logError('useFocusStats', e)
        setLoading(false)
        return
      }

      if (cancelled) return

      let week = 0
      let today = 0
      for (const row of rows) {
        week += row.duration_sec
        if (new Date(row.started_at) >= todayStart) today += row.duration_sec
      }
      setTodaySec(today)
      setWeekSec(week)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [user, statsVersion])

  return { todaySec, weekSec, loading }
}
