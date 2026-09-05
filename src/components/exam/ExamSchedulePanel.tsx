import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useExamScheduleStore, type ExamScheduleDraft } from '@/stores/exam-schedule-store'
import { useExamTemplateStore, selectAllTemplates } from '@/stores/exam-template-store'
import {
  minutesToTime,
  timeToMinutes,
  todayKey,
  localTimezone,
  isPendingToday,
  isHandledToday,
  nextRun,
  startScheduledExam,
  describeRun,
} from '@/lib/exam-schedule'
import { ensurePushSubscription } from '@/lib/push-subscription'
import { isBuiltinTemplate, totalQuestions } from '@/lib/exam-presets'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  CalendarClock,
  ChevronDown,
  Layers,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import type { ExamSchedule, ExamTemplate } from '@/types'

const WEEKDAY_UI_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** 模板选择按钮(复用考试设置里 ExamTemplatePanel 的视觉) */
function TemplateSelect({
  userId,
  value,
  onChange,
}: {
  userId: string
  value: ExamTemplate | null
  onChange: (t: ExamTemplate | null) => void
}) {
  const { t } = useT()
  const { templates, load } = useExamTemplateStore()

  useEffect(() => {
    if (userId) load(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const all = selectAllTemplates(templates)
  const builtins = all.filter((x) => isBuiltinTemplate(x.id))
  const mine = all.filter((x) => !isBuiltinTemplate(x.id))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full justify-between gap-1 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{value ? value.name : t('examSched.pickTemplate')}</span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">{t('examTemplate.myGroup')}</DropdownMenuLabel>
        {mine.length === 0 && (
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('examTemplate.noCustom')}</div>
        )}
        {mine.map((x) => (
          <DropdownMenuItem key={x.id} onClick={() => onChange(x)}>
            {x.name}
            <span className="ml-auto text-[10px] text-muted-foreground">{totalQuestions(x.sections)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">{t('examTemplate.builtinGroup')}</DropdownMenuLabel>
        {builtins.map((x) => (
          <DropdownMenuItem key={x.id} onClick={() => onChange(x)}>
            {x.name}
            <span className="ml-auto text-[10px] text-muted-foreground">{totalQuestions(x.sections)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 新建 / 编辑预约弹窗。仅在打开时挂载(父组件条件渲染),
 * useState 初始值按 editing 走 —— 每次打开都是全新状态, 无需 effect 同步。
 */
function ScheduleFormDialog({
  editing,
  userId,
  onClose,
}: {
  editing: ExamSchedule | null
  userId: string
  onClose: () => void
}) {
  const { t } = useT()
  const store = useExamScheduleStore()
  const [name, setName] = useState(editing ? editing.name : '')
  const [template, setTemplate] = useState<ExamTemplate | null>(editing ? editing.template : null)
  const [days, setDays] = useState<number[]>(editing ? [...editing.days_of_week] : [0, 6])
  const [time, setTime] = useState(editing ? minutesToTime(editing.fire_time) : '20:00')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const denyNotice =
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied'

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const handleSave = async () => {
    if (!template) {
      setFormError(t('examSched.templateRequired'))
      return
    }
    if (days.length === 0) {
      setFormError(t('examSched.dayRequired'))
      return
    }
    const draft: ExamScheduleDraft = {
      name: name.trim() || `${template.name} · ${minutesToTime(timeToMinutes(time))}`,
      days_of_week: days,
      fire_time: timeToMinutes(time),
      template,
      enabled: editing ? editing.enabled : true,
      tz: editing ? editing.tz || localTimezone() : localTimezone(),
    }
    setSaving(true)
    try {
      if (editing) {
        await store.update(editing.id, draft)
      } else {
        await store.create(userId, draft)
      }
      if (store.error) {
        setFormError(store.error)
        return
      }
      // 到点系统通知/Web Push: 借保存按钮的用户手势申请权限并把订阅登记到服务端
      if (notify && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      void ensurePushSubscription(userId)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('examSched.editTitle') : t('examSched.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('examSched.template')}</Label>
            <TemplateSelect userId={userId} value={template} onChange={setTemplate} />
            {!template && <p className="text-[10px] text-destructive">{t('examSched.templateRequired')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('examSched.name')}</Label>
            <Input value={name} placeholder={t('examSched.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('examSched.repeat')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_UI_ORDER.map((d) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'h-7 min-w-9 rounded-md px-2 text-xs font-medium transition-colors',
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'border text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {t(`examSched.wd${d}`)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('examSched.time')}</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value || '20:00')} className="w-40" />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">{t('examSched.notify')}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t('examSched.notifyHint')}</p>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
          {denyNotice && <p className="text-[10px] text-amber-600 dark:text-amber-500">{t('examSched.notifyDenied')}</p>}
          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('examSched.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('examSched.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExamSchedulePanel({ userId }: { userId: string }) {
  const { t, lang } = useT()
  const zh = lang === 'zh'
  const navigate = useNavigate()
  const store = useExamScheduleStore()
  const schedules = store.schedules
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<ExamSchedule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<ExamSchedule | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => {
    store.load(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const rows = useMemo(() => {
    const now = new Date()
    return [...schedules].sort((a, b) => {
      const pa = isPendingToday(a, now) ? 0 : 1
      const pb = isPendingToday(b, now) ? 0 : 1
      if (pa !== pb) return pa - pb
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.fire_time - b.fire_time
    })
  }, [schedules])

  const openCreate = () => {
    setEditing(null)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  const openEdit = (s: ExamSchedule) => {
    setEditing(s)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  const handleStart = async (s: ExamSchedule) => {
    setStartingId(s.id)
    setActionMsg('')
    const result = await startScheduledExam(userId, s)
    setStartingId(null)
    if (result.ok && result.sessionId) {
      store.markFired(s.id, todayKey())
      navigate(`/exam?sessionId=${result.sessionId}`)
      return
    }
    if (result.busy) {
      setActionMsg(t('examSched.busy'))
    } else if (result.error === 'already_done') {
      store.markFired(s.id, todayKey())
      setActionMsg(t('examSched.alreadyDone'))
    } else if (result.error === 'compose_failed') {
      setActionMsg(t('examSched.composeFailed'))
    } else if (result.error) {
      setActionMsg(`${t('examSched.startFailed')}${result.error}`)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" />
            {t('examSched.title')}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('examSched.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          {t('examSched.new')}
        </Button>
      </div>

      {actionMsg && (
        <p className="border-b px-4 py-2 text-xs text-amber-600 dark:text-amber-500 sm:px-5">{actionMsg}</p>
      )}

      <div className="space-y-3 p-4 sm:p-5">
        {store.isLoading && schedules.length === 0 && <p className="py-2 text-xs text-muted-foreground">…</p>}
        {!store.isLoading && schedules.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">{t('examSched.none')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground/70">{t('examSched.noneHint')}</p>
          </div>
        )}

        {rows.map((s) => {
          const pendingNow = isPendingToday(s)
          const doneToday = !pendingNow && s.enabled && isHandledToday(s)
          const next = pendingNow || doneToday ? null : nextRun(s)
          return (
            <div
              key={s.id}
              className={cn(
                'rounded-lg border p-3',
                pendingNow && 'border-primary/40 bg-primary/[0.03]',
                !s.enabled && 'opacity-70',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    {pendingNow && (
                      <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        {t('examSched.dueTag')}
                      </span>
                    )}
                    {doneToday && (
                      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        {t('examSched.doneTag')}
                      </span>
                    )}
                    {!s.enabled && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t('examSched.offTag')}
                      </span>
                    )}
                  </div>
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
                  {pendingNow ? (
                    <p className="text-[10px] text-muted-foreground/80">
                      {zh
                        ? `${t('examSched.todayAt')} ${minutesToTime(s.fire_time)} 已到点 · 立即开始将按模板组卷并计时`
                        : `${t('examSched.todayAt')} ${minutesToTime(s.fire_time)} · starting now composes the paper and starts the timer`}
                    </p>
                  ) : next ? (
                    <p className="text-[10px] text-muted-foreground/80">
                      {t('examSched.nextTag')} {next.getMonth() + 1}/{next.getDate()} {minutesToTime(s.fire_time)}
                    </p>
                  ) : null}
                </div>

                <Switch
                  checked={s.enabled}
                  onCheckedChange={(on) => {
                    store.update(s.id, { enabled: on })
                  }}
                  className="shrink-0"
                />

                {pendingNow && (
                  <Button
                    size="sm"
                    className="gap-1 text-xs"
                    disabled={startingId === s.id}
                    onClick={() => handleStart(s)}
                  >
                    {startingId === s.id ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {startingId === s.id ? t('examSched.starting') : t('examSched.start')}
                  </Button>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('examSched.edit')}
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title={t('examSched.remove')}
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {formOpen && (
        <ScheduleFormDialog
          key={`${formKey}-${editing?.id ?? 'new'}`}
          editing={editing}
          userId={userId}
          onClose={() => setFormOpen(false)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('examSched.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleting?.name ?? ''}」{t('examSched.removeDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('examSched.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) await store.remove(deleting.id)
                setDeleting(null)
              }}
            >
              {t('examSched.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
