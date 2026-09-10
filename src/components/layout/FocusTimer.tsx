import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  POMODORO_SEC,
  focusElapsedSec,
  formatClock,
  formatDuration,
  useFocusStore,
  type FinishedSession,
  type FocusMode,
} from '@/stores/focus-store'
import { useFocusStats } from '@/hooks/use-focus-stats'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

export function FocusTimer() {
  const { t } = useT()
  const user = useAuthStore((s) => s.user)
  const mode = useFocusStore((s) => s.mode)
  const running = useFocusStore((s) => s.running)
  const accumulatedSec = useFocusStore((s) => s.accumulatedSec)
  const segmentStartedAt = useFocusStore((s) => s.segmentStartedAt)
  const setMode = useFocusStore((s) => s.setMode)
  const start = useFocusStore((s) => s.start)
  const pause = useFocusStore((s) => s.pause)
  const finish = useFocusStore((s) => s.finish)
  const { todaySec, weekSec } = useFocusStats()

  const [, forceTick] = useState(0)
  const [error, setError] = useState(false)
  const [roundDone, setRoundDone] = useState(false)

  const save = useCallback(async (session: FinishedSession | null) => {
    if (!session || !user) return
    const { error: insertError } = await supabase.from('focus_sessions').insert({
      user_id: user.id,
      mode: session.mode,
      started_at: session.startedAt,
      ended_at: new Date().toISOString(),
      duration_sec: session.durationSec,
    })
    if (insertError) {
      console.error('focus_sessions insert:', insertError)
      setError(true)
    }
  }, [user])

  // 每秒重渲染 + 番茄钟到点自动记一轮
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      forceTick((n) => n + 1)
      const s = useFocusStore.getState()
      if (s.mode === 'pomodoro' && focusElapsedSec(s) >= POMODORO_SEC) {
        setRoundDone(true)
        void save(finish())
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, finish, save])

  const elapsed = focusElapsedSec({ running, accumulatedSec, segmentStartedAt })
  const isPomodoro = mode === 'pomodoro'
  const display = isPomodoro ? Math.max(POMODORO_SEC - elapsed, 0) : elapsed
  const started = running || elapsed > 0

  function handleStart() {
    setError(false)
    setRoundDone(false)
    start()
  }

  async function handleFinish() {
    await save(finish())
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{t('focus.title')}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {t('plan.today')} {formatDuration(todaySec + elapsed)} · {t('focus.week')} {formatDuration(weekSec)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-md border p-0.5">
          {(['stopwatch', 'pomodoro'] as FocusMode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={started}
              onClick={() => setMode(m)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40',
                mode === m ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'stopwatch' ? t('focus.stopwatch') : t('focus.pomodoro')}
            </button>
          ))}
        </div>

        <span className={cn('ml-auto text-lg font-semibold tabular-nums', isPomodoro && running && 'text-rose-500')}>
          {formatClock(display)}
        </span>

        <Button
          size="sm"
          variant={running ? 'outline' : 'default'}
          className="h-7 px-2"
          onClick={running ? pause : handleStart}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {running ? t('focus.pause') : elapsed > 0 ? t('focus.resume') : t('focus.start')}
        </Button>
        {started && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void handleFinish()}>
            <Square className="h-3.5 w-3.5" />
            {t('focus.finish')}
          </Button>
        )}
      </div>

      {roundDone && !running && (
        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {t('focus.roundDone')} · {formatDuration(POMODORO_SEC)}
        </p>
      )}
      {error && <p className="text-[11px] text-destructive">{t('focus.saveFailed')}</p>}
    </div>
  )
}
