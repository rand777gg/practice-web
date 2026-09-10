import { useMemo, useState } from 'react'
import { CalendarClock, GraduationCap, LayoutGrid, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExamSeatMap } from '@/components/exam/ExamSeatMap'
import { MOCK_EXAMS, SEAT_STATUS_META, type CandidateSeat, type ExamVenue } from '@/lib/exam-seat-map'
import { useT } from '@/i18n/use-t'
import { useLangStore } from '@/stores/lang-store'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

function StatusBadge({ status }: { status: CandidateSeat['status'] }) {
  const { t } = useT()
  const cls =
    status === 'present'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : status === 'late'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  const label =
    status === 'present' ? t('organizeExam.present') : status === 'late' ? t('organizeExam.late') : t('organizeExam.absent')
  return <Badge variant="secondary" className={cn('border-transparent text-[10px] font-normal', cls)}>{label}</Badge>
}

function CandidatePanel({ seat }: { seat: CandidateSeat | null }) {
  const { t } = useT()
  if (!seat) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
        <User className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t('organizeExam.noCandidate')}</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {seat.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold">{seat.name}</p>
          <p className="text-xs text-muted-foreground">{seat.seatNo}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={seat.status} />
        </div>
      </div>
      <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('organizeExam.studentId')}</span>
          <span className="font-mono text-xs">{seat.studentId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('organizeExam.submitted')}</span>
          <span className={cn('text-xs font-medium', seat.submitted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            {seat.submitted ? t('organizeExam.submittedYes') : t('organizeExam.submittedNo')}
          </span>
        </div>
        {seat.time && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{seat.submitted ? t('organizeExam.submittedYes') : t('organizeExam.status')}</span>
            <span className="text-xs tabular-nums">{seat.time}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function Component() {
  const { t } = useT()
  const { lang } = useLangStore()
  const zh = lang === 'zh'
  const [venue, setVenue] = useState<ExamVenue>(MOCK_EXAMS[0])
  const [selected, setSelected] = useState<CandidateSeat | null>(null)

  const stats = useMemo(() => {
    const total = venue.seats.length
    const present = venue.seats.filter((s) => s.status === 'present').length
    const late = venue.seats.filter((s) => s.status === 'late').length
    const absent = venue.seats.filter((s) => s.status === 'absent').length
    const submitted = venue.seats.filter((s) => s.submitted).length
    return { total, present, late, absent, submitted }
  }, [venue])

  const pickVenue = (v: ExamVenue) => {
    setVenue(v)
    setSelected(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <GraduationCap className="h-5 w-5 text-primary" />
            {t('organizeExam.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('organizeExam.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1 text-xs" variant="outline">
            <CalendarClock className="h-3.5 w-3.5" />
            {t('organizeExam.newExam')}
          </Button>
        </div>
      </div>

      {/* 场次选择 + 概览统计 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">{t('organizeExam.pickVenue')}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="max-w-[260px] truncate">{venue.name}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-sm">
                  {MOCK_EXAMS.map((v) => (
                    <DropdownMenuItem key={v.id} onClick={() => pickVenue(v)}>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{v.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{v.subject} · {v.startTime}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground">
              {venue.subject} · {venue.startTime} · {venue.durationMin} {t('exam.minutes')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 统计概览 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: t('organizeExam.statsTotal'), value: stats.total, accent: '' },
                { label: t('organizeExam.statsPresent'), value: stats.present, accent: 'text-emerald-600 dark:text-emerald-400' },
                { label: t('organizeExam.statsLate'), value: stats.late, accent: 'text-amber-600 dark:text-amber-400' },
                { label: t('organizeExam.statsAbsent'), value: stats.absent, accent: 'text-slate-500' },
                { label: t('organizeExam.statsSubmitted'), value: stats.submitted, accent: 'text-blue-600 dark:text-blue-400' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-2.5 text-center">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', s.accent)}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* 座位图 */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t('organizeExam.seatMapTitle')}</h2>
                <span className="text-[10px] text-muted-foreground">{t('organizeExam.seatMapHint')}</span>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card">
                <ExamSeatMap venue={venue} selectedSeatNo={selected?.seatNo ?? null} onSelect={setSelected} />
              </div>
            </div>

            {/* 图例 */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-blue-500" /> {SEAT_STATUS_META.present[zh ? 'labelZh' : 'labelEn']}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-amber-500" /> {SEAT_STATUS_META.late[zh ? 'labelZh' : 'labelEn']}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-slate-400" /> {SEAT_STATUS_META.absent[zh ? 'labelZh' : 'labelEn']}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 考生详情 */}
        <Card className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              {t('organizeExam.candidateDetail')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CandidatePanel seat={selected} />
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-violet-600 dark:text-violet-400">
        <CalendarClock className="h-3 w-3" />
        {t('organizeExam.demoHint')}
      </p>
    </div>
  )
}
