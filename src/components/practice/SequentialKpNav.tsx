import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cn, naturalSort } from '@/lib/utils'
import { useSubjectExplanations } from '@/hooks/use-subject-explanations'
import { SubjectExplanationDialog } from '@/components/practice/SubjectExplanationDialog'
import { ExcludedQuestionsDialog } from '@/components/practice/ExcludedQuestionsDialog'

interface KpGroup {
  kp: string
  subject: string
  start: number
  end: number
  total: number
  done: number
}

interface Props {
  userId: string
  questionIds: string[]
  questionKps: (string | null)[]
  questionSubjects: (string | null)[]
  currentIndex: number
  onJump: (index: number) => void
  subjectResets?: Record<string, string> | null
  planResetAt?: string | null
  subject?: string | null
  selectedKps?: string[]
  onExcludedRestored?: () => void
  answeredThisSession?: Set<string>
}

function isAnsweredAfterReset(answeredAt: string, subject: string, subjectResets?: Record<string, string> | null, planResetAt?: string | null) {
  const threshold = (subjectResets && subjectResets[subject]) || planResetAt
  if (!threshold) return true
  return new Date(answeredAt).getTime() >= new Date(threshold).getTime()
}

interface ExclStat {
  subject: string
  total: number
  excluded: number
}

interface ExclStatRow extends ExclStat {
  kp: string
}

export function SequentialKpNav({ userId, questionIds, questionKps, questionSubjects, currentIndex, onJump, subjectResets, planResetAt, subject, selectedKps, onExcludedRestored, answeredThisSession }: Props) {
  const [answeredMap, setAnsweredMap] = useState<Map<string, string>>(new Map())
  const [viewSubject, setViewSubject] = useState<string | null>(null)
  const [excludedKp, setExcludedKp] = useState<string | null>(null)
  const [exclStats, setExclStats] = useState<Map<string, ExclStat>>(new Map())
  const { explanations } = useSubjectExplanations()

  const isDone = useCallback((index: number, subject: string): boolean => {
    const id = questionIds[index]
    if (answeredThisSession?.has(id)) return true
    const at = answeredMap.get(id)
    return at != null && isAnsweredAfterReset(at, subject, subjectResets, planResetAt)
  }, [questionIds, answeredThisSession, answeredMap, subjectResets, planResetAt])

  const jumpIndexForGroup = useCallback((g: KpGroup): number => {
    for (let j = g.start; j <= g.end; j++) {
      if (!isDone(j, g.subject)) return j
    }
    return g.start
  }, [isDone])

  const loadExclStats = useCallback(async () => {
    if (!userId || !selectedKps || selectedKps.length === 0) { setExclStats(new Map()); return }
    const { data } = await supabase.rpc('get_kp_exclusion_stats', { p_user_id: userId, p_kps: selectedKps })
    const map = new Map<string, ExclStat>()
    for (const r of (data ?? []) as ExclStatRow[]) map.set(r.kp, r)
    setExclStats(map)
  }, [userId, selectedKps])

  useEffect(() => { loadExclStats() }, [loadExclStats])

  useEffect(() => {
    let cancelled = false
    if (!userId || questionIds.length === 0) return
    const CHUNK = 200
    const chunks: string[][] = []
    for (let i = 0; i < questionIds.length; i += CHUNK) chunks.push(questionIds.slice(i, i + CHUNK))
    Promise.all(chunks.map(chunk =>
      supabase.from('user_answers')
        .select('question_id, answered_at')
        .eq('user_id', userId)
        .in('question_id', chunk)
    )).then(results => {
      if (cancelled) return
      const map = new Map<string, string>()
      for (const r of results) {
        for (const row of (r.data ?? []) as { question_id: string; answered_at: string }[]) {
          const prev = map.get(row.question_id)
          if (!prev || row.answered_at > prev) map.set(row.question_id, row.answered_at)
        }
      }
      setAnsweredMap(map)
    })
    return () => { cancelled = true }
  }, [userId, questionIds])

  const groups = useMemo<KpGroup[]>(() => {
    const out: KpGroup[] = []
    let curKp: string | null = null
    let start = 0
    let subject = ''
    for (let i = 0; i <= questionKps.length; i++) {
      const kp = i < questionKps.length ? questionKps[i] : null
      if (kp !== curKp) {
        if (curKp && start < i) out.push({ kp: curKp, subject, start, end: i - 1, total: i - start, done: 0 })
        curKp = kp
        start = i
        subject = questionSubjects[i] ?? ''
      }
    }
    for (const g of out) {
      let done = 0
      for (let j = g.start; j <= g.end; j++) {
        if (isDone(j, g.subject)) done++
      }
      g.done = done
    }
    return out
  }, [questionKps, questionSubjects, isDone])

  const filteredGroups = useMemo(() => {
    if (!subject) return groups
    return groups.filter((g) => (g.subject || '其他') === subject)
  }, [groups, subject])

  const subjectGroups = useMemo(() => {
    const m = new Map<string, KpGroup[]>()
    for (const g of filteredGroups) {
      const key = g.subject || '其他'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(g)
    }
    return [...m.entries()]
  }, [filteredGroups])

  const excludedBySubject = useMemo(() => {
    const m = new Map<string, { kp: string; excluded: number }[]>()
    const sessionKpSet = new Set(filteredGroups.map(g => g.kp))
    for (const [kp, s] of exclStats) {
      if (sessionKpSet.has(kp)) continue
      if (s.total === 0 || s.excluded !== s.total) continue
      if (subject && s.subject !== subject) continue
      const key = s.subject || '其他'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push({ kp, excluded: s.excluded })
    }
    return m
  }, [exclStats, filteredGroups, subject])

  const renderItems = useMemo(() => {
    const m = new Map<string, { kp: string; group?: KpGroup; excluded?: number }[]>()
    for (const [subj, list] of subjectGroups) for (const g of list) {
      const arr = m.get(subj) ?? []; arr.push({ kp: g.kp, group: g }); m.set(subj, arr)
    }
    for (const [subj, list] of excludedBySubject) for (const e of list) {
      const arr = m.get(subj) ?? []; arr.push({ kp: e.kp, excluded: e.excluded }); m.set(subj, arr)
    }
    return [...m.entries()].map(([subj, arr]) => [subj, arr.sort((a, b) => naturalSort(a.kp, b.kp))] as [string, { kp: string; group?: KpGroup; excluded?: number }[]])
  }, [subjectGroups, excludedBySubject])

  const totalDone = filteredGroups.reduce((s, g) => s + g.done, 0)
  const totalCount = filteredGroups.reduce((s, g) => s + g.total, 0)

  if (questionIds.length === 0) return null

  return (
    <>
      <div className="rounded-xl border bg-card p-3 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-sm font-medium">{subject ? `${subject} · 知识点` : '知识点目录'}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{totalDone}/{totalCount}</span>
        </div>
      <div key={subject ?? 'all'} className="space-y-3 pr-1 flex-1 min-h-0 overflow-y-auto">
        {renderItems.map(([subj, items]) => (
          <div key={subj}>
            <div className="mb-1 animate-[page-enter_0.4s_ease-out_both]">
              {explanations.has(subj) ? (
                <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setViewSubject(subj)}>
                  查看{subj}编排说明
                </button>
              ) : (
                <span className="text-[11px] font-medium text-muted-foreground">{subj}</span>
              )}
            </div>
            <div className="space-y-1">
              {items.map((item, i) => {
                if (item.group) {
                  const g = item.group
                  const isActive = currentIndex >= g.start && currentIndex <= g.end
                  const pct = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0
                  const status = g.done >= g.total && g.total > 0 ? 'done' : g.done > 0 ? 'partial' : 'none'
                  const exclCount = exclStats.get(g.kp)?.excluded ?? 0
                  return (
                    <button
                      key={`${g.kp}-${g.start}`}
                      type="button"
                      onClick={() => onJump(jumpIndexForGroup(g))}
                      style={{ animationDelay: `${i * 0.05}s` }}
                      className={cn(
                        'w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-accent animate-[page-enter_0.4s_ease-out_both]',
                        isActive ? 'border-primary/50 bg-primary/5' : 'border-border/60 bg-background',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status === 'done' ? 'bg-green-500' : status === 'partial' ? 'bg-blue-500' : 'bg-muted-foreground/40')} />
                        <span className={cn('text-xs truncate flex-1', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>{g.kp}</span>
                        {exclCount > 0 && (
                          <span
                            title="该知识点有被标记太简单的题目，点击查看并恢复"
                            className="shrink-0 cursor-pointer rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExcludedKp(g.kp) }}
                          >
                            已排除 {exclCount}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{g.done}/{g.total}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full transition-all duration-300', status === 'done' ? 'bg-green-500' : status === 'partial' ? 'bg-blue-500' : 'bg-transparent')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  )
                }
                return (
                  <button
                    key={`ex-${item.kp}`}
                    type="button"
                    onClick={() => setExcludedKp(item.kp)}
                    title="该知识点的题目均被标记为太简单，点击查看并恢复"
                    className="w-full rounded-lg border border-dashed border-border/60 bg-muted/30 px-2.5 py-1.5 text-left hover:bg-muted/60 transition-colors animate-[page-enter_0.4s_ease-out_both]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground truncate flex-1">{item.kp}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">已排除 {item.excluded} 题</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
      <SubjectExplanationDialog
        subject={viewSubject ?? ''}
        content={viewSubject ? explanations.get(viewSubject)?.content ?? '' : ''}
        open={viewSubject !== null}
        onOpenChange={(o) => { if (!o) setViewSubject(null) }}
      />
      <ExcludedQuestionsDialog
        userId={userId}
        kp={excludedKp ?? ''}
        open={excludedKp !== null}
        onOpenChange={(o) => { if (!o) setExcludedKp(null) }}
        onRestored={() => { loadExclStats(); onExcludedRestored?.() }}
      />
    </>
  )
}
