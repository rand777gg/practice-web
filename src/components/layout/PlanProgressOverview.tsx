import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { Progress } from '@/components/ui/progress'
import type { PlanMilestoneProgress, PlanSubjectProgress, PlanTargetGroup } from '@/hooks/use-plan-completion'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

const DAY = 86400000

/** 'YYYY-MM-DD' -> 当天 00:00 时间戳 */
function parseDay(s: string): number {
  return new Date(`${s}T00:00:00`).getTime()
}

function todayStart(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 'YYYY-MM-DD' -> 'MM-DD' */
function shortDate(s: string): string {
  const parts = s.split('-')
  return parts.length >= 3 ? `${parts[1]}-${parts[2]}` : s
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

type FlagState = 'done' | 'current' | 'upcoming' | 'overdue'

const FLAG_TONE: Record<FlagState, string> = {
  done: 'text-emerald-500',
  current: 'text-blue-500',
  upcoming: 'text-muted-foreground/30',
  overdue: 'text-destructive',
}

const FLAG_CHIP: Record<FlagState, string> = {
  done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  current: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  upcoming: 'bg-muted text-muted-foreground',
  overdue: 'bg-destructive/10 text-destructive',
}

/** 旗杆 + 三角旗, 颜色交给 currentColor */
function MilestoneFlag({ state }: { state: FlagState }) {
  return (
    <svg viewBox="0 0 20 30" fill="none" className={cn('h-7 w-[17px] shrink-0', FLAG_TONE[state])} aria-hidden>
      <path d="M3.5 29V1.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4.6 2.6L18.4 8.1 4.6 13.6Z" fill="currentColor" />
    </svg>
  )
}

/** 一格: 迷你进度条 + 数字, 用于学科 × 计划/里程碑 矩阵 */
function MiniStat({ ratio, label, tone, muted }: { ratio: number; label: string; tone: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {!muted && <span className={cn('block h-full rounded-full', tone)} style={{ width: `${clamp(ratio * 100, 0, 100)}%` }} />}
      </span>
      <span className={cn('tabular-nums whitespace-nowrap', muted ? 'text-muted-foreground/50' : 'text-foreground/80')}>{label}</span>
    </div>
  )
}

interface Props {
  /** 已按截止日升序的里程碑进度 */
  milestones: PlanMilestoneProgress[]
  /** 长期计划总截止日 */
  planDeadline?: string | null
  /** 长期计划各学科进度 */
  longTerm?: PlanSubjectProgress[]
  /** 自定义计划(今日)进度 */
  targets?: PlanTargetGroup[]
  /** 只显示旗帜时间轴(编辑态预览用) */
  compact?: boolean
  className?: string
}

export function PlanProgressOverview({
  milestones,
  planDeadline,
  longTerm = [],
  targets = [],
  compact = false,
  className,
}: Props) {
  const { t } = useT()
  const today = todayStart()

  const days = useMemo(() => milestones.map((m) => parseDay(m.deadline)).filter((n) => Number.isFinite(n)), [milestones])

  const domain = useMemo(() => {
    const end = Math.max(planDeadline ? parseDay(planDeadline) : 0, today + 7 * DAY, ...days)
    const start = Math.min(today, end - 7 * DAY, ...days)
    return { start, end: end > start ? end : start + DAY }
  }, [days, planDeadline, today])

  const ordered = useMemo(
    () => [...milestones].sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [milestones],
  )

  const current = ordered.find((m) => m.progress < 1 && !m.passed)
  const achieved = ordered.filter((m) => m.progress >= 1).length

  const stateOf = (m: PlanMilestoneProgress): FlagState => {
    if (m.progress >= 1) return 'done'
    if (m.passed) return 'overdue'
    return current?.id === m.id ? 'current' : 'upcoming'
  }

  const xOf = (day: number) => clamp(((day - domain.start) / (domain.end - domain.start)) * 100, 6, 94)
  const todayPct = xOf(today)

  // 学科行: 长期计划 -> 自定义计划 -> 里程碑, 取并集保序
  const subjectRows = useMemo(() => {
    const list: string[] = []
    const seen = new Set<string>()
    const push = (s: string) => {
      if (s && !seen.has(s)) { seen.add(s); list.push(s) }
    }
    longTerm.forEach((r) => push(r.subject))
    targets.forEach((g) => g.subjects.forEach((s) => push(s.subject)))
    ordered.forEach((m) => m.subjects.forEach((s) => push(s.subject)))
    return list
  }, [longTerm, targets, ordered])

  if (ordered.length === 0) return null

  return (
    <div className={cn('space-y-2.5', className)}>
      {/* 概览一行 */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {t('plan.milestones')} <b className="tabular-nums">{achieved}/{ordered.length}</b>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {current ? (
            <>
              {t('plan.nextMilestone')} <b className="font-medium text-foreground">{current.deadline}</b>
              {' · '}
              {current.passed ? t('plan.deadlinePassed') : `${t('plan.remaining')} ${current.daysLeft} ${t('plan.daysUnit')}`}
              {' · '}
              {current.doneRounds}/{current.totalRounds} {t('plan.roundsUnit')}
            </>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">{t('plan.milestonesAllDone')}</span>
          )}
          {planDeadline && <> · {t('plan.deadline')} {planDeadline}</>}
        </span>
      </div>

      {/* 旗帜时间轴 */}
      <div className={cn('relative', compact ? 'h-[80px]' : 'h-[92px]')}>
        {/* 轨道 */}
        <div className="absolute inset-x-0 bottom-[26px] h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-[width] duration-500"
            style={{ width: `${todayPct}%` }}
          />
        </div>

        {/* 今天 */}
        <div className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${todayPct}%` }}>
          <span className="h-[34px] w-px bg-foreground/25" />
          <span className="text-[9px] leading-none text-muted-foreground">{t('plan.today')}</span>
        </div>

        {/* 旗帜 */}
        {ordered.map((m, i) => {
          const state = stateOf(m)
          const prev = i > 0 ? ordered[i - 1].deadline : ''
          const x = xOf(parseDay(m.deadline))
          // 相邻旗帜太近时收紧标签, 避免文字叠在一起
          const gap = i > 0 ? x - xOf(parseDay(ordered[i - 1].deadline)) : 100
          return (
            <HoverCard key={m.id} openDelay={100} closeDelay={80}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="absolute bottom-[36px] flex -translate-x-1/2 flex-col items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  style={{ left: `${x}%` }}
                >
                  {!compact && gap >= 9 && (
                    <span className={cn('mb-0.5 whitespace-nowrap rounded px-1 text-[9px] leading-tight', FLAG_CHIP[state])}>
                      {m.doneRounds}/{m.totalRounds} {t('plan.roundsUnit')}
                    </span>
                  )}
                  {gap >= 5 && (
                    <span className="mb-0.5 whitespace-nowrap text-[9px] leading-none text-muted-foreground">{shortDate(m.deadline)}</span>
                  )}
                  <span className="relative">
                    <MilestoneFlag state={state} />
                    {state === 'done' && (
                      <Check className="absolute -right-1 -top-0.5 h-3 w-3 rounded-full bg-background p-[1px] text-emerald-500" />
                    )}
                    {state === 'current' && (
                      <span className="absolute -inset-1 -z-10 animate-pulse rounded-full bg-blue-500/15" />
                    )}
                  </span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-60 space-y-1.5 text-xs" align="center">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t('plan.milestone')} {i + 1}</span>
                  <span className="tabular-nums text-muted-foreground">{m.deadline}</span>
                </div>
                {prev && (
                  <p className="text-[10px] text-muted-foreground">{t('plan.milestoneWindow')}: {prev} → {m.deadline}</p>
                )}
                <div className="space-y-1">
                  {m.subjects.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">{t('plan.milestoneNoSubject')}</p>
                  ) : m.subjects.map((s) => {
                    const ratio = s.rounds > 0 ? s.roundsDone / s.rounds : 0
                    return (
                      <div key={s.subject} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{s.subject}</span>
                        <Progress value={clamp(ratio * 100, 0, 100)} className="h-1 w-16 shrink-0 [&>div]:bg-blue-500" />
                        <span className="shrink-0 tabular-nums">{s.roundsDone}/{s.rounds}{t('plan.roundsUnit')}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {state === 'done' ? t('plan.milestoneStateDone')
                    : state === 'overdue' ? t('plan.milestoneStateOverdue')
                    : state === 'current' ? t('plan.milestoneStateCurrent')
                    : t('plan.milestoneStateUpcoming')}
                </p>
              </HoverCardContent>
            </HoverCard>
          )
        })}
      </div>

      {/* 学科 × 长期计划/自定义计划/里程碑 */}
      {!compact && subjectRows.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[300px] border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr className="text-[10px] text-muted-foreground">
                <th className="sticky left-0 z-10 bg-background px-1.5 py-1 text-left font-normal">{t('plan.subjectCol')}</th>
                <th className="whitespace-nowrap px-1.5 py-1 text-left font-normal">{t('plan.longTerm')}</th>
                {targets.length > 0 && <th className="whitespace-nowrap px-1.5 py-1 text-left font-normal">{t('plan.customToday')}</th>}
                {ordered.map((m) => (
                  <th key={m.id} className="whitespace-nowrap px-1.5 py-1 text-left font-normal tabular-nums">{shortDate(m.deadline)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectRows.map((subject) => {
                const lt = longTerm.find((r) => r.subject === subject)
                const daily = targets.flatMap((g) => g.subjects).filter((s) => s.subject === subject)
                const dailyTotal = daily.reduce((sum, s) => sum + s.count, 0)
                const dailyDone = daily.reduce((sum, s) => sum + s.done, 0)
                return (
                  <tr key={subject} className="align-middle">
                    <td className="sticky left-0 z-10 max-w-[110px] truncate bg-background px-1.5 py-1">{subject}</td>
                    <td className="px-1.5 py-1">
                      {lt ? (
                        <MiniStat
                          ratio={lt.total > 0 ? lt.doneAll / lt.total : 0}
                          label={`${lt.doneAll}/${lt.total}`}
                          tone="bg-blue-500"
                        />
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    {targets.length > 0 && (
                      <td className="px-1.5 py-1">
                        {dailyTotal > 0 ? (
                          <MiniStat ratio={dailyDone / dailyTotal} label={`${dailyDone}/${dailyTotal}`} tone="bg-pink-500" />
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                    )}
                    {ordered.map((m) => {
                      const s = m.subjects.find((x) => x.subject === subject)
                      if (!s) return <td key={m.id} className="px-1.5 py-1"><span className="text-muted-foreground/50">—</span></td>
                      const state = stateOf(m)
                      const tone = state === 'done' ? 'bg-emerald-500' : state === 'overdue' ? 'bg-destructive' : 'bg-blue-500'
                      return (
                        <td key={m.id} className="px-1.5 py-1">
                          <MiniStat ratio={s.rounds > 0 ? s.roundsDone / s.rounds : 0} label={`${s.roundsDone}/${s.rounds}`} tone={tone} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
