import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { cn } from '@/lib/utils'
import { OPTION_LABELS, QUESTION_TYPE_LABELS, IMPORT_MODE_LABELS, TYPE_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
import { ArrowLeft, RefreshCw, GitMerge, Copy, Check, X, TriangleAlert, Search, ChevronDown, Layers } from 'lucide-react'

interface DupQuestion {
  id: string
  subject: string | null
  category: string | null
  categories: string[]
  questionType: string
  questionText: string
  options: string[] | null
  correctAnswer: unknown
  keyPoints: string | null
  verified: boolean
  importMode: string | null
  sourcePage: string | null
  seqNumber: number | null
  createdAt: string | null
  answerExplanation: string | null
}

interface DupGroup {
  key: string
  size: number
  members: DupQuestion[]
}

interface DupCandidate {
  kind: 'exact' | 'fuzzy'
  score: number
  prob: number
  level: 'high' | 'mid' | 'low'
  signals: { sText: number; oOverlap: number; aSame: number }
  group: DupGroup | null
  a: DupQuestion
  b: DupQuestion
}

interface ScanResult {
  subject: string | null
  total: number
  limit: number
  truncated: boolean
  candidates: DupCandidate[]
}

type ConfirmState =
  | { kind: 'group'; group: DupGroup; keepId: string }
  | { kind: 'pair'; candidate: DupCandidate; keep: 'a' | 'b' }
  | null

const SIM_OPTIONS = [
  { value: '0.55', label: '宽松 0.55（候选多）' },
  { value: '0.6', label: '适中 0.60' },
  { value: '0.7', label: '严格 0.70（更少噪声）' },
  { value: '0.8', label: '很严 0.80' },
]

const LEVEL_META: Record<string, { label: string; cls: string }> = {
  high: { label: '高疑似', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  mid: { label: '中疑似', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  low: { label: '低疑似', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}

const catsOf = (q: DupQuestion) => {
  if (q.categories?.length) return q.categories
  if (q.category) return [q.category]
  return []
}

function fmtAnswer(q: DupQuestion): string {
  const a = q.correctAnswer
  const opts = q.options ?? []
  const pick = (i: number) => opts[i] ?? OPTION_LABELS[i] ?? String(i)
  if (a === null || a === undefined) return ''
  if (typeof a === 'boolean') return a ? '正确' : '错误'
  if (Array.isArray(a)) {
    if (!a.length) return ''
    return a.map((x) => (typeof x === 'number' ? pick(x) : String(x))).join(' / ')
  }
  if (typeof a === 'number') return pick(a)
  if (typeof a === 'object') return JSON.stringify(a)
  return String(a)
}

function isCorrectOption(q: DupQuestion, index: number): boolean {
  const a = q.correctAnswer
  if (typeof a === 'number') return a === index
  if (Array.isArray(a) && typeof a[0] === 'number') return (a as number[]).includes(index)
  if (typeof a === 'boolean') return a ? index === 0 : index !== 0
  return false
}

function QuestionPreview({ q, side }: { q: DupQuestion; side: 'a' | 'b' }) {
  const opts = q.options ?? []
  const hasOptionRows = q.questionType === 'single_choice' || q.questionType === 'multi_select' || (q.questionType === 'true_false' && opts.length > 0)
  const answer = fmtAnswer(q)
  const cats = catsOf(q)
  return (
    <div className="rounded-lg border bg-card p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge variant={side === 'a' ? 'default' : 'outline'} className="shrink-0">
          {side === 'a' ? '候选 A' : '候选 B'}
        </Badge>
        <span className="text-[10px] font-mono text-muted-foreground truncate" title={q.id}>
          {q.id.slice(0, 8)}…
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TYPE_COLORS[q.questionType] ?? 'bg-muted text-muted-foreground')}>
          {QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType}
        </span>
        {q.verified ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[10px]">
            <Check className="h-3 w-3" />已验证
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px]">待验证</span>
        )}
        {cats.map((c) => (
          <span key={c} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{c}</span>
        ))}
        {q.keyPoints && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground max-w-[140px] truncate" title={q.keyPoints}>
            知识点: {q.keyPoints}
          </span>
        )}
      </div>
      <div className="text-[13px] leading-relaxed max-h-36 overflow-y-auto pr-1">
        <MarkdownRenderer content={q.questionText} className="text-[13px]" />
      </div>
      {hasOptionRows && opts.length > 0 && (
        <div className="mt-2 space-y-1">
          {opts.map((opt, i) => {
            const correct = isCorrectOption(q, i)
            return (
              <div key={i} className={cn('flex items-start gap-1.5 text-xs rounded px-1.5 py-0.5', correct && 'bg-green-100/70 dark:bg-green-900/25 text-green-800 dark:text-green-200')}>
                <span className="font-medium shrink-0">{OPTION_LABELS[i] ?? i}.</span>
                <span className="min-w-0">{opt || '（空）'}</span>
                {correct && <Check className="h-3 w-3 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />}
              </div>
            )
          })}
        </div>
      )}
      {!hasOptionRows && answer && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium">参考答案：</span>
          <span className="break-words">{answer}</span>
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        {q.importMode && <span>{IMPORT_MODE_LABELS[q.importMode] ?? q.importMode}{q.sourcePage ? ` · P${q.sourcePage}` : ''}</span>}
        {q.createdAt && <span>{q.createdAt.slice(0, 10)}</span>}
        {q.seqNumber != null && <span>#seq {q.seqNumber}</span>}
      </div>
    </div>
  )
}

export function Component() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { subjects } = useQuestionFilters()
  const [subject, setSubject] = useState(() => searchParams.get('subject') || '')
  const [minSim, setMinSim] = useState('0.6')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [keepChoices, setKeepChoices] = useState<Record<string, string>>({})
  const [stats, setStats] = useState({ merged: 0, kept: 0, notDup: 0 })
  const [lastAction, setLastAction] = useState('')

  const scan = useCallback(async () => {
    if (!subject) {
      setError('请先选择学科：查重按学科进行，避免全库比对耗时')
      return
    }
    setScanning(true)
    setError('')
    setResult(null)
    const { data, error: rpcError } = await supabase.rpc('scan_question_duplicates', {
      p_subject: subject,
      p_min_sim: Number(minSim),
      p_limit: 500,
    })
    setScanning(false)
    if (rpcError) {
      setError(
        rpcError.message.includes('does not exist')
          ? '数据库尚未包含查重函数（迁移未执行）。请把 supabase/migrations/001_initial_schema.sql 中从 “Section 20” 到文件末尾的 SQL，在 Supabase SQL Editor 里执行一次（或在项目目录运行 npx supabase db query --linked），之后回到本页重新扫描。'
          : rpcError.message,
      )
      return
    }
    setResult(data as ScanResult)
  }, [subject, minSim])

  // 完全一致的重复按“组”聚合(同一指纹的 N 条题), 相似重复保留两两候选
  const exactGroups = useMemo(() => {
    const map = new Map<string, DupGroup>()
    for (const c of result?.candidates ?? []) {
      if (c.kind === 'exact' && c.group?.key && !map.has(c.group.key)) {
        map.set(c.group.key, c.group)
      }
    }
    return [...map.values()].sort((x, y) => y.size - x.size || y.members.length - x.members.length)
  }, [result])

  const fuzzyPairs = useMemo(() => (result?.candidates ?? []).filter((c) => c.kind === 'fuzzy'), [result])

  const visibleGroups = exactGroups.filter(() => !levelFilter || levelFilter === 'high')
  const visiblePairs = fuzzyPairs.filter((c) => !levelFilter || c.level === levelFilter)

  const setPairAction = (fn: (prev: ScanResult) => ScanResult) => {
    setResult((prev) => (prev ? fn(prev) : prev))
  }

  const prunePair = (q1: string, q2: string) => {
    setPairAction((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((c) => !((c.a.id === q1 && c.b.id === q2) || (c.a.id === q2 && c.b.id === q1))),
    }))
  }

  const pruneByRemoved = (removedIds: string[]) => {
    setPairAction((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((c) => !removedIds.includes(c.a.id) && !removedIds.includes(c.b.id)),
    }))
  }

  const doMerge = async () => {
    if (!confirm) return
    setActing(true)
    setLastAction('')
    setError('')
    if (confirm.kind === 'group') {
      const { group, keepId } = confirm
      const removedIds = group.members.map((m) => m.id).filter((id) => id !== keepId)
      setConfirm(null)
      const { error: rpcError } = await supabase.rpc('merge_dup_group', {
        p_keep: keepId,
        p_removes: removedIds,
        p_reason: '题目查重组内合并',
      })
      setActing(false)
      if (rpcError) {
        setError(`合并失败：${rpcError.message}`)
        return
      }
      setStats((s) => ({ ...s, merged: s.merged + 1 }))
      setLastAction(`已合并重复组：保留 1 条，删除 ${removedIds.length} 条`)
      pruneByRemoved(removedIds)
      return
    }
    const { candidate, keep } = confirm
    const keepId = keep === 'a' ? candidate.a.id : candidate.b.id
    const removeId = keep === 'a' ? candidate.b.id : candidate.a.id
    setConfirm(null)
    const { error: rpcError } = await supabase.rpc('merge_dup_questions', {
      p_keep: keepId,
      p_remove: removeId,
      p_reason: '题目查重后台手动合并',
    })
    setActing(false)
    if (rpcError) {
      setError(`合并失败：${rpcError.message}`)
      return
    }
    setStats((s) => ({ ...s, merged: s.merged + 1 }))
    setLastAction(`已合并：保留 ${keepId.slice(0, 8)}…，删除 ${removeId.slice(0, 8)}…`)
    pruneByRemoved([removeId])
  }

  const keepAllInGroup = async (group: DupGroup) => {
    setActing(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('keep_dup_group', {
      p_ids: group.members.map((m) => m.id),
      p_note: null,
    })
    setActing(false)
    if (rpcError) {
      setError(`操作失败：${rpcError.message}`)
      return
    }
    setStats((s) => ({ ...s, kept: s.kept + group.members.length }))
    setLastAction(`已记录「保留全部 ${group.members.length} 条」，该组下次扫描不再提示`)
    const key = group.key
    setPairAction((prev) => ({ ...prev, candidates: prev.candidates.filter((c) => c.group?.key !== key) }))
  }

  const reviewPair = async (c: DupCandidate, status: 'keep' | 'not_dup') => {
    setActing(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('save_dup_review', {
      p_q1: c.a.id,
      p_q2: c.b.id,
      p_status: status,
    })
    setActing(false)
    if (rpcError) {
      setError(`操作失败：${rpcError.message}`)
      return
    }
    prunePair(c.a.id, c.b.id)
    if (status === 'keep') {
      setStats((s) => ({ ...s, kept: s.kept + 1 }))
      setLastAction('已记录「有意保留两题」，这对题下次扫描不再提示')
    } else {
      setStats((s) => ({ ...s, notDup: s.notDup + 1 }))
      setLastAction('已标记「非重复」')
    }
  }

  const sortedSubjects = [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const groupCovered = exactGroups.reduce((n, g) => n + g.members.length, 0)
  const shownGroups = visibleGroups.slice(0, 100)
  const shownPairs = visiblePairs.slice(0, 100)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/questions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            题目查重
          </h1>
          <p className="text-xs text-muted-foreground">
            同一题出现 2 条以上时按「重复组」整组展示，可一键保留一条合并其余，或整组保留。
          </p>
        </div>
      </div>

      {/* 控制栏(主题化下拉) */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 min-w-[130px] justify-between">
              <span className="truncate">{subject || '选择学科'}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto min-w-[180px]">
            <DropdownMenuItem onClick={() => setSubject('')}>
              <span className="text-muted-foreground">学科（必选）</span>
              {!subject && <Check className="h-3.5 w-3.5 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {sortedSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSubject(s)}>
                <span className="truncate">{s}</span>
                {subject === s && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 justify-between min-w-[150px]">
              <span className="truncate">{SIM_OPTIONS.find((o) => o.value === minSim)?.label}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {SIM_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.value} onClick={() => setMinSim(o.value)}>
                <span className="truncate">{o.label}</span>
                {minSim === o.value && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={scan} disabled={scanning || !subject}>
          {scanning ? <LoadingTips compact className="py-0" /> : <Search className="size-3.5 mr-1" />}
          {scanning ? '扫描中…' : '开始查重'}
        </Button>
        {result && (
          <Button size="sm" variant="outline" onClick={scan} disabled={scanning}>
            <RefreshCw className="size-3.5 mr-1" />
            重新扫描
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">{error}</span>
        </div>
      )}

      {lastAction && !error && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          <Check className="h-4 w-4 shrink-0" />
          {lastAction}
        </div>
      )}

      {(stats.merged > 0 || stats.kept > 0 || stats.notDup > 0) && (
        <div className="text-xs text-muted-foreground">
          本页已处理：合并 {stats.merged} 组 · 保留 {stats.kept} 条 · 非重复 {stats.notDup} 对
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            共 {result.total} 对候选：完全一致组 {exactGroups.length} 个（覆盖 {groupCovered} 条题）· 相似对 {fuzzyPairs.length}
          </span>
          {result.truncated && <span className="text-xs text-amber-600 dark:text-amber-400">（超出单次上限，仅展示前 {result.limit} 条，可调严阈值）</span>}
          <div className="flex gap-1 ml-auto">
            {[
              { v: '', label: '全部' },
              { v: 'high', label: '高疑似' },
              { v: 'mid', label: '中疑似' },
              { v: 'low', label: '低疑似' },
            ].map((f) => (
              <Button key={f.v} size="sm" variant={levelFilter === f.v ? 'default' : 'outline'} onClick={() => setLevelFilter(f.v)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {result && visibleGroups.length === 0 && visiblePairs.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <GitMerge className="size-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">该学科暂时没有发现重复候选 🎉</p>
        </div>
      )}

      {/* 完全一致重复组(N≥2) */}
      {shownGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Layers className="h-4 w-4" />
            完全一致重复组（{shownGroups.length}）
          </h2>
          {shownGroups.map((g) => {
            const keepId = keepChoices[g.key] ?? g.members[0]?.id
            return (
              <div key={g.key} className="rounded-xl border border-red-200 dark:border-red-900/70 bg-card p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    高疑似
                  </span>
                  <Badge variant="outline" className="text-[11px]">完全一致</Badge>
                  <span className="text-xs text-muted-foreground">
                    同一题干共 {g.members.length} 条，点击卡片任一条将其设为「保留」
                  </span>
                </div>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {g.members.map((m) => {
                    const chosen = keepId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setKeepChoices((prev) => ({ ...prev, [g.key]: m.id }))}
                        className={cn('relative rounded-xl text-left transition-shadow cursor-pointer', chosen ? 'ring-2 ring-primary ring-offset-2' : 'hover:ring-1 hover:ring-muted')}
                      >
                        {chosen && (
                          <span className="absolute -top-2 -left-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium shadow">
                            <Check className="h-3 w-3" />保留这条
                          </span>
                        )}
                        <QuestionPreview q={m} side={chosen ? 'a' : 'b'} />
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-2 justify-end border-t pt-2">
                  <Button size="sm" variant="outline" disabled={acting} onClick={() => keepAllInGroup(g)} title="整组都保留，下次不再提示">
                    <Copy className="size-3.5 mr-1" />保留全部 {g.members.length} 条
                  </Button>
                  <Button size="sm" variant="destructive" disabled={acting || g.members.length < 2} onClick={() => setConfirm({ kind: 'group', group: g, keepId })}>
                    保留所选 1 条，合并删除其余 {g.members.length - 1} 条
                  </Button>
                </div>
              </div>
            )
          })}
          {visibleGroups.length > 100 && (
            <p className="text-xs text-muted-foreground text-center">组较多，仅展示前 100 个，建议先处理部分后再重扫</p>
          )}
        </div>
      )}

      {/* 相似重复对 */}
      {shownPairs.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <GitMerge className="h-4 w-4" />
            相似重复对（{shownPairs.length}）
          </h2>
          {shownPairs.map((c) => {
            const lm = LEVEL_META[c.level]
            return (
              <div key={`${c.a.id}-${c.b.id}`} className={cn(
                'rounded-xl border bg-card p-3 space-y-3',
                c.level === 'high' ? 'border-red-200 dark:border-red-900/70' : c.level === 'mid' ? 'border-amber-200 dark:border-amber-900/70' : 'border-slate-200 dark:border-slate-800',
              )}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', lm.cls)}>{lm.label}</span>
                  <Badge variant="outline" className="text-[11px]">文本相似</Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">重复概率约 {Math.round(c.prob * 100)}%</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    题干相似 {Math.round(c.signals.sText * 100)}% · 选项重叠 {Math.round(c.signals.oOverlap * 100)}% · 答案{c.signals.aSame ? '一致' : '不同'}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" disabled={acting} onClick={() => reviewPair(c, 'keep')} title="这两题确实都需要，保留两条且不再提示">
                      <Copy className="size-3.5 mr-1" />保留两题
                    </Button>
                    <Button size="sm" variant="ghost" disabled={acting} onClick={() => reviewPair(c, 'not_dup')} title="判定不是重复">
                      <X className="size-3.5 mr-1" />非重复
                    </Button>
                  </div>
                </div>
                <div className="grid lg:grid-cols-2 gap-3">
                  <QuestionPreview q={c.a} side="a" />
                  <QuestionPreview q={c.b} side="b" />
                </div>
                <div className="flex flex-wrap gap-2 justify-end border-t pt-2">
                  <Button size="sm" variant="destructive" disabled={acting} onClick={() => setConfirm({ kind: 'pair', candidate: c, keep: 'a' })}>
                    保留 A、删除 B
                  </Button>
                  <Button size="sm" variant="destructive" disabled={acting} onClick={() => setConfirm({ kind: 'pair', candidate: c, keep: 'b' })}>
                    保留 B、删除 A
                  </Button>
                </div>
              </div>
            )
          })}
          {visiblePairs.length > 100 && (
            <p className="text-xs text-muted-foreground text-center">候选较多，仅展示前 100 条，建议调严阈值后重扫</p>
          )}
        </div>
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          {confirm?.kind === 'group' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>确认合并整个重复组？</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-1">
                    <p>
                      将保留所选 1 条，删除本组其余 {confirm.group.members.length - 1} 条，并把它们的答题记录、收藏、排除记录、试题库收录、提交记录和历史会话引用全部迁移到保留题，分类也会合并。
                    </p>
                    <p className="text-xs text-muted-foreground">若这些其实是不同变体、需要同时存在，请点「保留全部 N 条」。</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={acting}>取消</AlertDialogCancel>
                <AlertDialogAction disabled={acting} onClick={doMerge}>
                  {acting ? '合并中…' : '确认合并'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : confirm?.kind === 'pair' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>确认合并删除？</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-1">
                    <p>
                      将保留「{confirm.keep === 'a' ? '候选 A' : '候选 B'}」，删除另一条，并把它的答题记录、收藏、排除记录、试题库收录、提交记录和历史会话里的引用全部迁移到保留题，分类也会合并。
                    </p>
                    <p className="text-xs text-muted-foreground">若这两条其实是不同变体、需要同时存在，请点「保留两题」。</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={acting}>取消</AlertDialogCancel>
                <AlertDialogAction disabled={acting} onClick={doMerge}>
                  {acting ? '合并中…' : '确认合并'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
