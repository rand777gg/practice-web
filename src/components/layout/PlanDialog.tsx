import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Calendar, Check, ChevronDown, HelpCircle, Plus, Play, Sparkles, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { DailyTarget } from '@/types'
import { normalizeDailyTargets } from '@/types'
import { computeEbbinghaus, type EbbinghausData } from '@/lib/ai/ebbinghaus'
import { suggestPlan, hasAiConfig } from '@/lib/ai'
import { useT } from '@/i18n/use-t'

const EbbinghausCurve = lazy(() => import('@/components/charts/EbbinghausCurve').then(m => ({ default: m.EbbinghausCurve })))
const UrgencyChart = lazy(() => import('@/components/charts/UrgencyChart').then(m => ({ default: m.UrgencyChart })))

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

export function PlanDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)

  const savedSubjects = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
  const savedTargets = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(savedSubjects)
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>(savedTargets)
  const [saving, setSaving] = useState(false)

  // Ebbinghaus
  const [showEbbinghaus, setShowEbbinghaus] = useState(false)
  const [ebbinghaus, setEbbinghaus] = useState<EbbinghausData | null>(null)
  const [ebbinghausLoading, setEbbinghausLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false)
  const [aiGlow, setAiGlow] = useState(false)
  const [aiFade, setAiFade] = useState(false)
  const ebbinghausLoaded = useRef(false)

  const [allSubjects, setAllSubjects] = useState<string[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Map<string, number>>(new Map())
  const [subjectProgress, setSubjectProgress] = useState<Map<string, { total: number; done: number }>>(new Map())

  useEffect(() => {
    if (!open) return
    async function load() {
      // Load ebbinghaus once, cache result
      if (user && !ebbinghausLoaded.current) {
        ebbinghausLoaded.current = true
        setEbbinghausLoading(true)
        setAiGlow(true)
        computeEbbinghaus(user.id).then(async (data) => {
          setEbbinghaus(data)
          if (hasAiConfig() && data.urgency.length > 0) {
            setAiSuggestionLoading(true)
            try {
              const text = await suggestPlan({
                totalReviewQueue: data.totalReviewQueue,
                topUrgent: data.urgency.map(u => ({
                  subject: u.subject,
                  urgency: u.urgency,
                  reviewQueue: u.reviewQueue,
                  errorRate: u.errorRate,
                })),
                atRiskCurve: data.curve,
                totalSubjects: data.urgency.length,
              })
              setAiSuggestion(text)
            } catch { /* ignore */ }
            setAiSuggestionLoading(false)
          }
        }).finally(() => {
          setEbbinghausLoading(false)
          setTimeout(() => {
            setAiFade(true)
            requestAnimationFrame(() => {
              setAiGlow(false)
              setTimeout(() => setAiFade(false), 1500)
            })
          }, 300)
        })
      }
      const { data: qs } = await supabase.from('questions').select('subject')
      const counts = new Map<string, number>()
      for (const q of (qs ?? [])) {
        const s = q.subject || 'Other'
        counts.set(s, (counts.get(s) ?? 0) + 1)
      }
      setAllSubjects([...counts.keys()].sort())
      setSubjectCounts(counts)

      if (user) {
        const [{ data: done }, { data: allQs }] = await Promise.all([
          supabase.from('user_answers').select('question_id').eq('user_id', user.id),
          supabase.from('questions').select('id, subject'),
        ])
        const doneIds = new Set((done ?? []).map((a) => a.question_id))
        const progress = new Map<string, { total: number; done: number }>()
        for (const q of (allQs ?? [])) {
          const s = q.subject || 'Other'
          const entry = progress.get(s) || { total: 0, done: 0 }
          entry.total++
          if (doneIds.has(q.id)) entry.done++
          progress.set(s, entry)
        }
        setSubjectProgress(progress)
      }
    }
    load()
  }, [open, user, selectedSubjects])

  useEffect(() => {
    const s = profile?.plan_subjects ? JSON.parse(profile.plan_subjects) as string[] : []
    const t = normalizeDailyTargets(profile?.daily_targets ? JSON.parse(profile.daily_targets) : null)
    setSelectedSubjects(s)
    setDailyTargets(t)
    setDeadline(profile?.deadline ?? '')
  }, [profile])

  const totalSelected = selectedSubjects.reduce((sum, s) => sum + (subjectCounts.get(s) ?? 0), 0)
  const totalDone = selectedSubjects.reduce((sum, s) => sum + (subjectProgress.get(s)?.done ?? 0), 0)
  const remaining = Math.max(totalSelected - totalDone, 0)

  let dailyGoal = 0
  if (deadline) {
    const deadlineDate = new Date(deadline + 'T23:59:59')
    const daysLeft = Math.max(Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000), 1)
    dailyGoal = Math.ceil(remaining / daysLeft)
  }

  const toggleSubject = (s: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  const addDailyTarget = () => {
    if (allSubjects.length === 0) return
    const used = new Set(dailyTargets.flatMap((t) => t.subjects.map(s => s.subject)))
    const next = allSubjects.find((s) => !used.has(s))
    if (!next) return
    setDailyTargets((prev) => [...prev, { subjects: [{ subject: next, count: 5 }], deadline: null }])
  }

  const updateDailyDeadline = (i: number, deadline: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => idx === i ? { ...t, deadline } : t))
  }

  const updateSubjectCount = (i: number, si: number, count: number) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      return { ...t, subjects: t.subjects.map((s, sIdx) => sIdx === si ? { ...s, count } : s) }
    }))
  }

  const toggleTargetSubject = (i: number, subj: string) => {
    setDailyTargets((prev) => prev.map((t, idx) => {
      if (idx !== i) return t
      const exists = t.subjects.some(s => s.subject === subj)
      if (exists) {
        return { ...t, subjects: t.subjects.filter(s => s.subject !== subj) }
      }
      return { ...t, subjects: [...t.subjects, { subject: subj, count: 5 }] }
    }))
  }

  const removeDailyTarget = (i: number) => {
    setDailyTargets((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        deadline: deadline || null,
        plan_subjects: selectedSubjects.length > 0 ? JSON.stringify(selectedSubjects) : null,
        daily_targets: dailyTargets.length > 0 ? JSON.stringify(dailyTargets) : null,
      })
      .eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="sm:text-center">
          <DialogTitle>{t('plan.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 左侧：Long-term plan */}
          <div className="border rounded-lg p-3">
            <div className="text-sm font-semibold mb-2 text-blue-600 dark:text-blue-400">
              {t('plan.longTerm')}
              <HoverCard openDelay={500}>
                <HoverCardTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="text-xs w-56">
                  {t('plan.desc')}
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="space-y-2">
              {/* Subject selection */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
                    <span className={selectedSubjects.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                      {selectedSubjects.length === 0
                        ? t('plan.selectHint')
                        : selectedSubjects.map((s) => `${s} (${subjectCounts.get(s) ?? 0})`).join(', ')}
                    </span>
                    <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setSelectedSubjects([]) }}
                    className="text-muted-foreground text-xs"
                  >
                    {t('plan.selectHint')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {allSubjects.map((s) => {
                    const checked = selectedSubjects.includes(s)
                    return (
                      <DropdownMenuItem
                        key={s}
                        onSelect={(e) => { e.preventDefault(); toggleSubject(s) }}
                        className="text-xs"
                      >
                        <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                        <span>{s}</span>
                        <span className="ml-auto text-muted-foreground">{subjectCounts.get(s) ?? 0}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Deadline */}
              <button
                type="button"
                onClick={() => {
                  const btn = document.querySelector('.plan-date-input') as HTMLInputElement
                  btn?.showPicker()
                }}
                className="relative flex items-center justify-between w-full h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer dark:text-foreground"
              >
                <span className={deadline ? '' : 'text-muted-foreground'}>
                  {deadline ? formatDate(deadline) : t('plan.pickDate')}
                </span>
                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="plan-date-input absolute inset-0 opacity-0 cursor-pointer"
                  style={{ colorScheme: theme }}
                />
              </button>

              {selectedSubjects.length > 0 && (
                <div className="space-y-1.5">
                  {selectedSubjects.map((s) => {
                    const p = subjectProgress.get(s)
                    const total = p?.total ?? 0
                    const done = p?.done ?? 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                      <div key={s} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground truncate max-w-[60%]">{s}</span>
                          <span className="tabular-nums">{done}/{total}</span>
                        </div>
                        <Progress value={pct} className="h-1.5 [&>div]:bg-blue-500" />
                      </div>
                    )
                  })}
                  {deadline && (
                    <p className="text-[11px] pt-1">
                      <span className="text-muted-foreground">{t('plan.dailyGoal')}: </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{dailyGoal} {t('plan.perDay')}</span>
                      <span className="text-muted-foreground ml-2">{t('plan.remaining')}: {remaining}/{totalSelected}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：Daily targets */}
          <div className="border rounded-lg p-3">
            <div className="text-sm font-semibold mb-2 text-pink-600 dark:text-pink-400">
              {t('plan.dailyTarget')}
              <HoverCard openDelay={500}>
                <HoverCardTrigger asChild>
                  <span className="inline-flex items-center ml-1 cursor-help">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent className="text-xs w-56">
                  {t('plan.dailyTargetDesc')}
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="space-y-3">
            {dailyTargets.map((target, i) => {
              const usedByOthers = new Set(
                dailyTargets.flatMap((t, idx) => idx !== i ? t.subjects.map(s => s.subject) : [])
              )
              const targetSubjectNames = target.subjects.map(s => s.subject)
              const availableSubjects = allSubjects.filter(s => !usedByOthers.has(s) || targetSubjectNames.includes(s))
              return (
                <div key={i} className="space-y-2">
                  {/* Subject multi-select */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-8">
                        <span className={target.subjects.length === 0 ? 'text-muted-foreground' : 'truncate'}>
                          {target.subjects.length === 0
                            ? t('plan.selectHint')
                            : target.subjects.map(s => `${s.subject} (${subjectCounts.get(s.subject) ?? 0})`).join(', ')}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto w-[var(--radix-dropdown-menu-trigger-width)]">
                      {availableSubjects.map((s) => {
                        const checked = targetSubjectNames.includes(s)
                        return (
                          <DropdownMenuItem
                            key={s}
                            onSelect={(e) => { e.preventDefault(); toggleTargetSubject(i, s) }}
                            className="text-xs"
                          >
                            <Check className={cn('h-3 w-3', !checked && 'opacity-0')} />
                            <span>{s}</span>
                            <span className="ml-auto text-muted-foreground">{subjectCounts.get(s) ?? 0}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Deadline */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const btn = document.querySelector(`.target-date-input-${i}`) as HTMLInputElement
                        btn?.showPicker()
                      }}
                      className="relative flex items-center justify-between flex-1 h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer dark:text-foreground"
                    >
                      <span className={target.deadline ? '' : 'text-muted-foreground'}>
                        {target.deadline
                          ? new Date(target.deadline).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : t('plan.deadline')}
                      </span>
                      <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                      <input
                        type="datetime-local"
                        value={target.deadline ?? ''}
                        onChange={(e) => updateDailyDeadline(i, e.target.value)}
                        className={`target-date-input-${i} absolute inset-0 opacity-0 cursor-pointer`}
                        style={{ colorScheme: theme }}
                      />
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeDailyTarget(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Per-subject count inputs with progress */}
                  {target.subjects.map((subj, si) => {
                    const p = subjectProgress.get(subj.subject)
                    const total = p?.total ?? 0
                    const done = p?.done ?? 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                    <div key={subj.subject} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{subj.subject}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            value={subj.count}
                            onChange={(e) => updateSubjectCount(i, si, Math.max(1, Number(e.target.value)))}
                            className="h-7 w-14 text-xs text-center shrink-0"
                          />
                          <span className="text-xs text-muted-foreground">{t('plan.questions')}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5 [&>div]:bg-pink-500" />
                    </div>
                  )})}
                </div>
              )
            })}
            </div>

            {(() => {
              const usedAll = new Set(dailyTargets.flatMap((t) => t.subjects.map(s => s.subject)))
              if (usedAll.size >= allSubjects.length) return null
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addDailyTarget}
                  className="text-xs h-7 mt-2"
                >
                  <Plus className="h-3 w-3" />
                  {t('plan.addSubject')}
                </Button>
              )
            })()}
          </div>
        </div>

        {/* Ebbinghaus toggle button */}
        {ebbinghaus && (ebbinghaus.curve.length > 0 || ebbinghaus.urgency.length > 0) && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEbbinghaus((v) => !v)}
              className="text-xs text-muted-foreground gap-1"
            >
              <Sparkles className="h-3 w-3 text-blue-500" />
              {showEbbinghaus ? '隐藏学习建议' : '查看基于艾宾浩斯遗忘曲线的学习建议'}
              {ebbinghaus.totalReviewQueue > 0 && (
                <span className="text-amber-500 font-medium ml-1">({ebbinghaus.totalReviewQueue}题待复习)</span>
              )}
            </Button>
          </div>
        )}

        {/* Ebbinghaus recommendation section */}
        {ebbinghausLoading && showEbbinghaus && (
          <div className="flex items-center justify-center py-8">
            <Spinner />
            <span className="text-xs text-muted-foreground ml-2">正在分析遗忘曲线...</span>
          </div>
        )}
        {showEbbinghaus && ebbinghaus && (ebbinghaus.curve.length > 0 || ebbinghaus.urgency.length > 0) && (
          <div className={`border rounded-lg p-3 space-y-3 transition-[border-color,box-shadow] duration-1500 ease-out ${
            aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''
          }`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-blue-500" />
              <span>基于艾宾浩斯遗忘曲线的学习建议</span>
              {ebbinghaus.totalReviewQueue > 0 && (
                <span className="text-amber-500 font-medium ml-auto">待复习 {ebbinghaus.totalReviewQueue} 题</span>
              )}
            </div>

            {aiSuggestionLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 animate-pulse" />
                AI 正在生成学习建议...
              </p>
            )}
            {aiSuggestion && (
              <p className="text-xs text-muted-foreground leading-relaxed bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-2.5">
                {[...aiSuggestion].map((ch, i) => (
                  <span key={i} className="animate-[charReveal_0.25s_ease-out_both]" style={{ animationDelay: `${i * 0.02}s` }}>{ch}</span>
                ))}
              </p>
            )}

            {ebbinghaus.curve.length > 0 && (
              <Suspense fallback={<div className="h-[220px]" />}>
                <EbbinghausCurve curve={ebbinghaus.curve} />
              </Suspense>
            )}
            {ebbinghaus.urgency.length > 0 && (
              <Suspense fallback={<div className="h-[120px]" />}>
                <UrgencyChart urgency={ebbinghaus.urgency} />
              </Suspense>
            )}
          </div>
        )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm">{t('plan.cancel')}</Button>
          </DialogClose>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? t('questions.saving') : t('plan.save')}
            </Button>
            <Button size="sm" asChild>
              <Link to="/practice">
                <Play className="h-3.5 w-3.5" />
                开始学习
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}