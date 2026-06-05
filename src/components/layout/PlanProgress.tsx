import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { Progress } from '@/components/ui/progress'
import { PlanDialog } from './PlanDialog'
import { useT } from '@/i18n/use-t'

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.ceil(ms / 86400000)
}

export function PlanProgress() {
  const { t } = useT()
  const { user, profile } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const deadline = profile?.deadline ?? null
  const [dialogOpen, setDialogOpen] = useState(false)
  const [stats, setStats] = useState({ dailyGoal: 0, todayCount: 0 })

  useEffect(() => {
    if (!user || !deadline) return
    async function load() {
      const deadlineDate = new Date(deadline + 'T23:59:59')
      const now = new Date()
      const daysLeft = Math.max(daysBetween(now, deadlineDate), 1)

      const { count: total } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })

      const { data: done } = await supabase
        .from('user_answers')
        .select('question_id')
        .eq('user_id', user!.id)

      const distinctDone = new Set((done ?? []).map((a) => a.question_id))
      const remaining = Math.max((total ?? 0) - distinctDone.size, 0)
      const dailyGoal = Math.ceil(remaining / daysLeft)

      const { data: today } = await supabase
        .from('user_answers')
        .select('question_id')
        .eq('user_id', user!.id)
        .gte('answered_at', todayStart())

      const todayDistinct = new Set((today ?? []).map((a) => a.question_id))
      setStats({ dailyGoal, todayCount: todayDistinct.size })
    }
    load()
  }, [user, deadline, version])

  if (!user) return null

  if (!deadline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="text-xs border border-dashed border-border rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {t('plan.setDeadline')}
        </button>
        <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    )
  }

  const { dailyGoal, todayCount } = stats
  const progress = dailyGoal > 0 ? Math.min(Math.round((todayCount / dailyGoal) * 100), 100) : 100
  const done = todayCount >= dailyGoal && dailyGoal > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <span className="truncate hidden sm:inline">
          {done ? t('plan.allDone') : `${t('plan.dailyGoal')} ${todayCount}/${dailyGoal}`}
        </span>
        <Progress value={progress} className="w-16 sm:w-20 shrink-0" />
      </button>
      <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
