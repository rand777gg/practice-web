import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ensurePushSubscription } from '@/lib/push-subscription'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { CalendarClock, Play } from 'lucide-react'
import {
  rowToSchedule,
  isPendingToday,
  todayKey,
  describeRun,
  notifyExamDue,
  startScheduledExam,
} from '@/lib/exam-schedule'
import type { ExamSchedule } from '@/types'

/**
 * 每天"已提醒/已忽略"的预约集合, 持久化在 localStorage。
 * 关键语义: 提醒一旦弹出就立刻落盘 —— 同一天内刷新/重新进入应用都不再重复弹
 * (修复"每点进去一次就弹一次")。键按 `${scheduleId}:${当地日期}` 隔离, 跨天自动失效。
 * 键名沿用旧版 exam-schedule-dismissed, 兼容此前手动"稍后再说"已存的数据。
 */
const REMIND_KEY = 'exam-schedule-dismissed'

function loadReminded(): Set<string> {
  try {
    const raw = localStorage.getItem(REMIND_KEY)
    if (!raw) return new Set()
    const arr: unknown = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberReminded(key: string) {
  try {
    const set = loadReminded()
    set.add(key)
    const arr = [...set].slice(-300)
    localStorage.setItem(REMIND_KEY, JSON.stringify(arr))
  } catch {
    /* ignore */
  }
}

/**
 * 全局预约到点监视器(AppLayout 挂载一次, 仅登录态有效)。
 * 应用打开期间每 30s + 切回前台时检查: 到点的预约 → 应用内弹窗 + 浏览器系统通知;
 * 错过到点后当天内第一次进入也会补提醒。同一场同一天最多自动弹一次:
 * 弹出即把 `${id}:${当天}` 记入 localStorage, 之后刷新/重进不再重复打扰。
 * 想随时开考的入口仍在预约列表的「今日待考 · 现在开始」。有进行中的考试时先不打扰。
 */
export function ExamScheduleWatcher() {
  const { user } = useAuthStore()
  const { t, lang } = useT()
  const zh = lang === 'zh'
  const navigate = useNavigate()
  const [pending, setPending] = useState<ExamSchedule | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const remindedRef = useRef<Set<string>>(new Set())
  const uidRef = useRef<string | null>(null)

  useEffect(() => {
    const uid = user?.id ?? null
    uidRef.current = uid
    remindedRef.current = loadReminded()
    if (!uid) return

    // 每次进入应用自愈一次推送订阅(含 VAPID 轮换后自动重订; 未授权时静默跳过)
    void ensurePushSubscription(uid)

    const check = async () => {
      if (uidRef.current !== uid) return
      // 已有进行中的考试: 先不打扰, 完成后由下一次 tick 补提醒
      if (useExamStore.getState().session?.status === 'in_progress') return
      const { data: running } = await supabase
        .from('exam_sessions')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'in_progress')
        .limit(1)
      if (running && running.length > 0) return

      const { data } = await supabase
        .from('exam_schedules')
        .select('*')
        .eq('user_id', uid)
        .eq('enabled', true)
        .limit(50)
      const now = new Date()
      for (const row of data ?? []) {
        const s = rowToSchedule(row as Record<string, unknown>)
        if (!isPendingToday(s, now)) continue
        const key = `${s.id}:${todayKey()}`
        if (remindedRef.current.has(key)) continue
        remindedRef.current.add(key)
        rememberReminded(key) // 落盘: 今天这一场已提醒, 刷新/重进不再重复弹
        notifyExamDue(s)
        setError('')
        setPending(s)
        return // 一次只弹一场
      }
    }

    check()
    const iv = setInterval(check, 30_000)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [user?.id])

  const dismiss = () => {
    if (pending) rememberReminded(`${pending.id}:${todayKey()}`)
    setPending(null)
    setStarting(false)
    setError('')
  }

  const handleStart = async () => {
    if (!pending || !user || starting) return
    setStarting(true)
    setError('')
    const res = await startScheduledExam(user.id, pending)
    if (res.ok && res.sessionId) {
      setPending(null)
      setStarting(false)
      navigate(`/exam?sessionId=${res.sessionId}`)
      return
    }
    setStarting(false)
    if (res.error === 'already_done') {
      dismiss()
      return
    }
    if (res.busy) {
      setError(t('examSched.busy'))
      return
    }
    if (res.error === 'compose_failed') {
      setError(t('examSched.composeFailed'))
      return
    }
    setError(res.error ? `${t('examSched.startFailed')}${res.error}` : t('examSched.composeFailed'))
  }

  const s = pending

  return (
    <Dialog open={!!s} onOpenChange={(v) => !v && dismiss()}>
      {s && (
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              {t('examSched.overlayTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-base font-semibold">{s.name}</p>
            <p className="text-xs text-muted-foreground">
              {describeRun(s, t, zh)}
              <span className="mx-1 text-border">·</span>
              {s.template.name ?? ''}
              {s.template.duration_min ? (
                <>
                  <span className="mx-1 text-border">·</span>
                  {s.template.duration_min} {t('exam.minutes')}
                </>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {zh
                ? '已到开考时间，点击「现在开始」立即按模板组卷并计时。'
                : "It's time — click Start now and the paper is composed immediately."}
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismiss} disabled={starting}>
              {t('examSched.overlayLater')}
            </Button>
            <Button onClick={handleStart} disabled={starting} className="gap-1">
              {starting ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {starting ? t('examSched.starting') : t('examSched.overlayNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
