import { supabase } from '@/lib/supabase'
import { useExamStore } from '@/stores/exam-store'
import type { ExamSchedule, ExamTemplate } from '@/types'

/** 0=周日 .. 6=周六 */
export const SCHEDULE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** 当日分钟 → "HH:mm" */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:mm" → 当日分钟 */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((x) => Number(x) || 0)
  return h * 60 + m
}

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey(): string {
  return dateKey(new Date())
}

/** 当前设备 IANA 时区, 供建约时写入 tz 列 */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export type TFunc = (key: string) => string

/** 周期文字: zh "每周六、周日 20:00"; en "Sat, Sun · 20:00"(显示按周一~周日排) */
export function describeRun(s: ExamSchedule, t: TFunc, zh: boolean): string {
  const order = (d: number) => (d === 0 ? 7 : d)
  const days = [...s.days_of_week].sort((a, b) => order(a) - order(b))
  const labels = days.map((d) => t(`examSched.wd${d}`))
  const when = minutesToTime(s.fire_time)
  return zh ? `每周${labels.join('、')} ${when}` : `${labels.join(', ')} · ${when}`
}

/** 该预约今天是否已到开考时间(整点含此刻) */
export function isDueToday(s: ExamSchedule, now: Date = new Date()): boolean {
  if (!s.enabled) return false
  if (!s.days_of_week.includes(now.getDay())) return false
  return now.getHours() * 60 + now.getMinutes() >= s.fire_time
}

/** 今天是否已开考过 */
export function isHandledToday(s: ExamSchedule, today: string = todayKey()): boolean {
  return s.last_fire_date === today
}

/** 今天到点但还没开考(错过到点后当天内仍可补开) */
export function isPendingToday(s: ExamSchedule, now: Date = new Date()): boolean {
  return isDueToday(s, now) && !isHandledToday(s, dateKey(now))
}

/**
 * 下一次(严格晚于 now)开考时刻; 用于列表展示「下次」。
 * disabled 的预约也算, 以便用户看到停用后的排期。
 */
export function nextRun(s: ExamSchedule, now: Date = new Date()): Date | null {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let off = 0; off <= 7; off++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off)
    if (!s.days_of_week.includes(d.getDay())) continue
    if (off === 0 && s.fire_time <= nowMin) continue
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(s.fire_time / 60), s.fire_time % 60)
  }
  return null
}

/** DB 行 → ExamSchedule(兼容缺列/类型漂移) */
export function rowToSchedule(row: Record<string, unknown>): ExamSchedule {
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    name: String(row.name ?? ''),
    days_of_week: Array.isArray(row.days_of_week)
      ? row.days_of_week.map((x) => Number(x)).filter((x) => Number.isInteger(x))
      : [],
    fire_time: Number(row.fire_time) || 0,
    template: (row.template ?? {}) as ExamTemplate,
    enabled: row.enabled !== false,
    tz: typeof row.tz === 'string' && row.tz ? row.tz : 'Asia/Shanghai',
    last_fire_date: row.last_fire_date == null ? null : String(row.last_fire_date),
    last_notify_date: row.last_notify_date == null ? null : String(row.last_notify_date),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export interface StartScheduleResult {
  ok: boolean
  sessionId?: string
  /** 已有进行中的考试(先完成它) */
  busy?: boolean
  error?: string
}

/**
 * 立即按预约的模板快照组卷开考。
 * 成功后把 last_fire_date 置为今天 —— 同一天不会重复开考, 也隐藏「今日待考」。
 */
export async function startScheduledExam(userId: string, schedule: ExamSchedule): Promise<StartScheduleResult> {
  const { data: running } = await supabase
    .from('exam_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
  if (running && running.length > 0) return { ok: false, busy: true }

  const today = todayKey()
  // 其它标签页/设备可能已处理过今天这一场
  const { data: cur } = await supabase
    .from('exam_schedules')
    .select('last_fire_date')
    .eq('id', schedule.id)
    .single()
  if (cur && String(cur.last_fire_date ?? '') === today) {
    return { ok: false, error: 'already_done' }
  }

  const store = useExamStore.getState()
  const durationMs = Math.max(1, Math.min(600, schedule.template.duration_min || 1)) * 60 * 1000
  const result = await store.startExam({
    userId,
    questionCount: 0,
    durationMs,
    template: schedule.template,
  })
  if (!result.ok) {
    return { ok: false, error: store.error || 'compose_failed' }
  }

  const session = useExamStore.getState().session
  if (!session) return { ok: false, error: 'compose_failed' }

  await supabase
    .from('exam_schedules')
    .update({ last_fire_date: today })
    .eq('id', schedule.id)
    .eq('user_id', userId)

  return { ok: true, sessionId: session.id }
}

/** 发送浏览器系统通知(应用打开期间, 含后台标签页); 返回是否真的发出 */
export function notifyExamDue(schedule: ExamSchedule): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  const title = schedule.name || '预约考试'
  const body = `${schedule.template.name || '考试'} · ${minutesToTime(schedule.fire_time)}`
  try {
    const n = new Notification(title, { body, tag: `exam-schedule-${schedule.id}-${todayKey()}`, icon: '/logo-192.png' })
    n.onclick = () => {
      window.focus()
      window.location.assign('/exam')
    }
    return true
  } catch {
    return false
  }
}
