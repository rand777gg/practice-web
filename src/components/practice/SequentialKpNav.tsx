import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cn, naturalSort } from '@/lib/utils'
import { ExcludedQuestionsDialog } from '@/components/practice/ExcludedQuestionsDialog'
import { SubjectExplanationDialog } from '@/components/practice/SubjectExplanationDialog'
import { useSubjectExplanations } from '@/hooks/use-subject-explanations'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

interface KpGroup {
  kp: string
  subject: string
  start: number
  end: number
  total: number
  done: number
}

export type SessionDistStatus = 'correct' | 'wrong' | 'tooEasy'
export interface SessionDistEntry {
  status: SessionDistStatus
  kp?: string
}

export type DistStatus = SessionDistStatus | 'unanswered'

export interface GroupDist {
  statuses: DistStatus[]
  correct: number
  wrong: number
  tooEasy: number
  unanswered: number
  total: number
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
  sessionDist?: Map<string, SessionDistEntry>
  showDist: boolean
  onShowDistChange: (v: boolean) => void
  onCurrentKpDist?: (d: GroupDist | null) => void
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

function computeGroupDist(g: KpGroup, questionIds: string[], answeredMap: Map<string, string>, latestCorrectMap: Map<string, boolean>, sessionDist: Map<string, SessionDistEntry> | undefined, subjectResets?: Record<string, string> | null, planResetAt?: string | null): GroupDist {
  const statuses: DistStatus[] = []
  const seen = new Set<string>()
  for (let j = g.start; j <= g.end; j++) {
    const id = questionIds[j]
    seen.add(id)
    const entry = sessionDist?.get(id)
    if (entry) { statuses.push(entry.status); continue }
    const at = answeredMap.get(id)
    if (at != null && isAnsweredAfterReset(at, g.subject, subjectResets, planResetAt)) {
      const ok = latestCorrectMap.get(id)
      statuses.push(ok === undefined ? 'unanswered' : ok ? 'correct' : 'wrong')
    } else {
      statuses.push('unanswered')
    }
  }
  if (sessionDist) {
    for (const [id, entry] of sessionDist) {
      if (entry.status === 'tooEasy' && entry.kp === g.kp && !seen.has(id)) {
        statuses.push('tooEasy')
        seen.add(id)
      }
    }
  }
  const counts = { correct: 0, wrong: 0, tooEasy: 0, unanswered: 0 }
  for (const st of statuses) counts[st]++
  return { statuses, ...counts, total: statuses.length }
}

export function SequentialKpNav({ userId, questionIds, questionKps, questionSubjects, currentIndex, onJump, subjectResets, planResetAt, subject, selectedKps, onExcludedRestored, answeredThisSession, sessionDist, showDist, onShowDistChange, onCurrentKpDist }: Props) {
  const [answeredMap, setAnsweredMap] = useState<Map<string, string>>(new Map())
  const [latestCorrectMap, setLatestCorrectMap] = useState<Map<string, boolean>>(new Map())
  const [excludedKp, setExcludedKp] = useState<string | null>(null)
  const [exclStats, setExclStats] = useState<Map<string, ExclStat>>(new Map())
  const [showTooEasy, setShowTooEasy] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const { explanations } = useSubjectExplanations()
  const [viewSubject, setViewSubject] = useState<string | null>(null)

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
        .select('question_id, answered_at, is_correct')
        .eq('user_id', userId)
        .in('question_id', chunk)
    )).then(results => {
      if (cancelled) return
      const map = new Map<string, string>()
      const correctMap = new Map<string, boolean>()
      for (const r of results) {
        for (const row of (r.data ?? []) as { question_id: string; answered_at: string; is_correct: boolean }[]) {
          const prev = map.get(row.question_id)
          if (!prev || row.answered_at > prev) {
            map.set(row.question_id, row.answered_at)
            correctMap.set(row.question_id, row.is_correct)
          }
        }
      }
      setAnsweredMap(map)
      setLatestCorrectMap(correctMap)
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

  const currentGroup = useMemo(() => {
    return filteredGroups.find((g) => currentIndex >= g.start && currentIndex <= g.end) ?? null
  }, [filteredGroups, currentIndex])

  // 自动滚动目录，让当前知识点（上次刷到/正在刷的知识点）置顶，方便查看进度
  useEffect(() => {
    const el = listRef.current
    if (!el || !currentGroup) return
    const row = el.querySelector<HTMLElement>(`[data-kp="${CSS.escape(currentGroup.kp)}"]`)
    if (!row) return
    const containerRect = el.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    el.scrollTo({ top: el.scrollTop + (rowRect.top - containerRect.top), behavior: 'smooth' })
  }, [currentGroup])

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

  const groupDists = useMemo(() => {
    const m = new Map<KpGroup, GroupDist>()
    for (const g of filteredGroups) {
      m.set(g, computeGroupDist(g, questionIds, answeredMap, latestCorrectMap, sessionDist, subjectResets, planResetAt))
    }
    return m
  }, [filteredGroups, questionIds, answeredMap, latestCorrectMap, sessionDist, subjectResets, planResetAt])

  const distTotals = useMemo(() => {
    const t = { correct: 0, wrong: 0, tooEasy: 0, unanswered: 0 }
    for (const d of groupDists.values()) {
      t.correct += d.correct
      t.wrong += d.wrong
      t.tooEasy += d.tooEasy
      t.unanswered += d.unanswered
    }
    return t
  }, [groupDists])

  useEffect(() => {
    const g = currentGroup
    const d = g ? groupDists.get(g) : null
    if (!d) { onCurrentKpDist?.(null); return }
    const effective = showTooEasy ? d : {
      ...d,
      statuses: d.statuses.filter((st) => st !== 'tooEasy'),
      tooEasy: 0,
      total: d.total - d.tooEasy,
    }
    onCurrentKpDist?.(effective)
  }, [currentGroup, groupDists, showTooEasy, onCurrentKpDist])

  const totalDone = filteredGroups.reduce((s, g) => s + g.done, 0)
  const totalCount = filteredGroups.reduce((s, g) => s + g.total, 0)

  const controlsSubject = subject ?? filteredGroups[0]?.subject ?? null

  if (questionIds.length === 0) return null

  return (
    <>
      <div className="rounded-xl border bg-card p-3 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center text-sm font-medium truncate min-w-0">
            {subject ? (
              <>
                <span className="truncate">{subject}</span>
                <Separator orientation="vertical" className="mx-1.5 h-3.5 shrink-0" />
                <span className="shrink-0">知识点</span>
              </>
            ) : (
              <span>知识点目录</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{totalDone}/{totalCount}</span>
        </div>
        <div className="mb-2 flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onShowDistChange(!showDist)}
            title={showDist ? '返回知识点进度' : '查看全部知识点作答分布'}
          >
            {showDist ? '返回' : '作答情况'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={!controlsSubject || !explanations.has(controlsSubject)}
            onClick={() => { if (controlsSubject) setViewSubject(controlsSubject) }}
            title={!controlsSubject || !explanations.has(controlsSubject) ? '该学科未设置编排说明' : `查看${controlsSubject}编排说明`}
          >
            查看编排说明
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
            显示太简单
            <Switch checked={showTooEasy} onCheckedChange={setShowTooEasy} />
          </label>
        </div>
        {showDist && (
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground mb-2 shrink-0 animate-[page-enter_0.3s_ease-out_both]">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />正确 {distTotals.correct}</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />错误 {distTotals.wrong}</span>
            {showTooEasy && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />太简单 {distTotals.tooEasy}</span>}
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-border" />未答 {distTotals.unanswered}</span>
          </div>
        )}
      <div ref={listRef} key={subject ?? 'all'} className="space-y-3 pr-1 flex-1 min-h-0 overflow-y-auto">
        {renderItems.map(([subj, items]) => (
          <div key={subj}>
            <div className="mb-1 animate-[page-enter_0.4s_ease-out_both]">
              <span className="text-[11px] font-medium text-muted-foreground">{subj}</span>
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
                      data-kp={g.kp}
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
                      {showDist ? (
                        <div className="relative mt-1 h-1 rounded-full bg-muted overflow-hidden animate-dist-bar" style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}>
                          {(() => {
                            const d = groupDists.get(g)
                            if (!d) return null
                            const statuses = showTooEasy ? d.statuses : d.statuses.filter((st) => st !== 'tooEasy')
                            const n = statuses.length
                            return statuses.map((st, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  'absolute transition-colors duration-300',
                                  st === 'correct' && 'bg-green-500',
                                  st === 'wrong' && 'bg-red-500',
                                  st === 'tooEasy' && 'bg-muted-foreground/40',
                                  idx === 0 && 'rounded-l-full',
                                  idx === n - 1 && 'rounded-r-full',
                                )}
                                style={{ top: st === 'wrong' ? 0.5 : 0, bottom: 0, left: `${(idx * 100) / n}%`, width: `${100 / n}%` }}
                                title={st === 'correct' ? '正确' : st === 'wrong' ? '错误' : st === 'tooEasy' ? '太简单' : '未答'}
                              />
                            ))
                          })()}
                        </div>
                      ) : (
                        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden animate-in fade-in-0 duration-200">
                          <div
                            className={cn('h-full transition-all duration-300', status === 'done' ? 'bg-green-500' : status === 'partial' ? 'bg-blue-500' : 'bg-transparent')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
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
