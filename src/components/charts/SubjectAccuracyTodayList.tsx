import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { useChartPalette } from '@/lib/chart-theme'

interface RpcRow {
  subject: string
  today_correct: number
  today_total: number
  yesterday_correct: number
  yesterday_total: number
}

interface Item {
  subject: string
  pct: number
  delta: number | null
}

/** 首页"科目正确率(今日)"横向列表卡 —— 对照驾驶舱样稿的科目正确率区 */
export function SubjectAccuracyTodayList() {
  const user = useAuthStore((s) => s.user)
  const pal = useChartPalette()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let live = true
    supabase.rpc('get_accuracy_change', { p_user_id: user.id }).then(({ data: rows }) => {
      if (!live) return
      const list = ((rows ?? []) as RpcRow[])
        .filter((r) => Number(r.today_total) + Number(r.yesterday_total) >= 1)
        .map((r) => {
          const pct = Number(r.today_total) > 0 ? Math.round((Number(r.today_correct) / Number(r.today_total)) * 100) : 0
          const yPct = Number(r.yesterday_total) > 0 ? Math.round((Number(r.yesterday_correct) / Number(r.yesterday_total)) * 100) : null
          return {
            subject: r.subject,
            pct,
            delta: pct > 0 && yPct != null ? pct - yPct : null,
          }
        })
        .sort((a, b) => b.pct - a.pct)
      setItems(list)
      setLoading(false)
    }, () => setLoading(false))
    return () => { live = false }
  }, [user])

  if (loading) return <div className="h-[300px] rounded-lg bg-muted/30 animate-pulse" />
  if (!items.length) return <div className="h-[300px] rounded-lg bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>

  return (
    <div className="flex h-[300px] flex-col justify-center gap-1">
      {items.slice(0, 8).map((s) => {
        const up = s.delta != null && s.delta >= 0
        return (
          <div key={s.subject} className="flex items-center gap-3 py-1">
            <span className="w-24 flex-none truncate text-[13px] text-muted-foreground" title={s.subject}>{s.subject}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: pal.brand }} />
            </div>
            <span className="w-10 flex-none text-right text-[13px] font-semibold tabular-nums">{s.pct}%</span>
            <span className={cn('w-12 flex-none text-right text-[11px] tabular-nums', s.delta == null ? 'text-muted-foreground' : up ? 'text-green-500' : 'text-red-500')}>
              {s.delta == null ? '—' : `${up ? '↑' : '↓'} ${Math.abs(s.delta)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
