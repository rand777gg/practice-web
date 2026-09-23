/**
 * 「链接真题」—— 从题库里把历年真题勾到某条知识点解读上。
 *
 * 「真题」是题库的分类约定(`2024年真题` 这类), 所以这个选择器默认就落在**最新一年的真题**上:
 * 管理员的动作通常是"这个知识点去年考了什么", 而不是从 1281 道题里翻。想找别的就换年份、换学科,
 * 或者清掉年份去搜全部题目(有些知识点确实只有练习题没有真题)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { searchQuestions } from '@/lib/kp-question-refs-store'
import {
  questionStem, questionTypeLabel, realYearOf, realYearsFrom, yearBadge, type KpQuestionDraft, type LinkedQuestion,
} from '@/lib/kp-question-refs'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 知识点所属学科: 用来预选题目学科(对不上就退回不限) */
  subject: string
  /** 已经挂过的题: 列表里置灰, 不会重复加入 */
  existingIds: Set<string>
  onAdd: (drafts: KpQuestionDraft[]) => void
}

const ALL_YEARS = '__all__'

function toDraft(q: LinkedQuestion): KpQuestionDraft {
  return {
    questionId: q.id,
    note: '',
    year: realYearOf(q),
    type: q.questionType,
    stem: questionStem(q.questionText, 120),
  }
}

function PickerBody({ subject, existingIds, onAdd, onClose }: {
  subject: string
  existingIds: Set<string>
  onAdd: (drafts: KpQuestionDraft[]) => void
  onClose: () => void
}) {
  const { subjects, categories } = useQuestionFilters()
  const years = useMemo(() => realYearsFrom(categories), [categories])

  /**
   * 年份存 null = "还没挑过", 实际用的是**派生出来**的最新一年。
   *
   * 年份列表本身是异步来的(question_meta_cache), 用 effect 去把它 setState 进去的话要多渲一轮;
   * 派生出来则是列表一到就自动落到最新一年。在它到之前先不搜, 免得先按"全部题目"搜一轮再跳回来。
   */
  const [year, setYear] = useState<string | null>(null)
  const activeYear = year ?? years[0] ?? ALL_YEARS
  const ready = year !== null || years.length > 0

  const [pickedSubject, setPickedSubject] = useState(() => (subjects.includes(subject) ? subject : ''))
  const [keyword, setKeyword] = useState('')
  /** 结果连"它属于哪组筛选条件"一起存: 条件一变旧结果自动失效, 不用在 effect 里清空 */
  const [result, setResult] = useState<{ key: string; items: LinkedQuestion[]; error: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Map<string, LinkedQuestion>>(new Map())
  const seq = useRef(0)

  const queryKey = `${activeYear}|${pickedSubject}|${keyword.trim()}`
  const current = result && result.key === queryKey ? result : null
  const items = current?.items ?? []
  const error = current?.error ?? null
  const searched = current !== null

  useEffect(() => {
    if (!ready) return
    const key = queryKey
    const mine = ++seq.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchQuestions({
        keyword,
        subject: pickedSubject || null,
        year: activeYear === ALL_YEARS ? null : activeYear,
      })
        .then((list) => {
          if (mine !== seq.current) return
          setResult({ key, items: list, error: null })
        })
        .catch((err: unknown) => {
          if (mine !== seq.current) return
          setResult({ key, items: [], error: err instanceof Error ? err.message : String(err) })
        })
        .finally(() => { if (mine === seq.current) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer) }
  }, [ready, queryKey, keyword, pickedSubject, activeYear])

  const toggle = (q: LinkedQuestion) => {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.set(q.id, q)
      return next
    })
  }

  const confirm = () => {
    onAdd([...picked.values()].map(toDraft))
    onClose()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              {activeYear === ALL_YEARS ? '全部年份' : activeYear}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setYear(ALL_YEARS)}>
              <span className="text-muted-foreground">不限年份（全部题目）</span>
              {activeYear === ALL_YEARS && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {years.map((y) => (
              <DropdownMenuItem key={y} onClick={() => setYear(y)}>
                {y}
                {activeYear === y && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {subjects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                {pickedSubject || '不限学科'}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem onClick={() => setPickedSubject('')}>
                <span className="text-muted-foreground">不限学科</span>
                {!pickedSubject && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              {subjects.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setPickedSubject(s)}>
                  {s}
                  {pickedSubject === s && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜题干关键词，如「死锁」"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {error ? (
          <p className="px-3 py-4 text-[11px] text-destructive">{error}</p>
        ) : !searched ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">正在检索…</p>
        ) : items.length === 0 ? (
          <div className="space-y-2 px-3 py-6 text-center">
            <p className="text-[11px] text-muted-foreground">
              {activeYear === ALL_YEARS ? '没有命中题目' : `${activeYear} 里没有命中题目`}
            </p>
            <p className="text-[10px] text-muted-foreground">
              可以换个年份、改学科，或者把年份切到「不限年份」搜全部题目。
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 p-1.5">
            {items.map((q) => {
              const already = existingIds.has(q.id)
              const on = picked.has(q.id)
              const badge = yearBadge(q)
              return (
                <label
                  key={q.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 transition-colors',
                    already ? 'cursor-not-allowed opacity-40' : on ? 'bg-primary/10' : 'hover:bg-accent/60',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                    checked={already || on}
                    disabled={already}
                    onChange={() => toggle(q)}
                    aria-label={questionStem(q.questionText, 30)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {badge && (
                        <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {badge}
                        </span>
                      )}
                      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                        {questionTypeLabel(q.questionType)}
                      </span>
                      {q.subject && <span className="text-[9px] text-muted-foreground">{q.subject}</span>}
                      {already && <span className="text-[9px] text-muted-foreground">已挂</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug">{q.questionText}</span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {picked.size > 0
            ? `已选 ${picked.size} 道`
            : searched && items.length > 0 ? `命中 ${items.length} 道，勾选后点「加入真题」` : '勾选要挂到这条解读上的真题'}
        </span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>取消</Button>
          <Button size="sm" disabled={picked.size === 0} onClick={confirm}>加入真题 ({picked.size})</Button>
        </span>
      </DialogFooter>
    </>
  )
}

export function KpQuestionPickerDialog({ open, onOpenChange, subject, existingIds, onAdd }: Props) {
  // 每次打开换 key 重挂载: 筛选条件与勾选状态就都是普通的 useState 初值, 不必写"打开时重置"
  const [generation, setGeneration] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setGeneration((g) => g + 1)
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            链接真题
          </DialogTitle>
          <DialogDescription className="text-xs">
            默认是最新一年的真题，可以直接换年份或学科。挂上之后读者在解读里展开就能看到题干、选项、答案与解析。
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PickerBody
            key={generation}
            subject={subject}
            existingIds={existingIds}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
