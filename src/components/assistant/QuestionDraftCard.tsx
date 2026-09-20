/**
 * /create 出的题在看板里先冻着, 等用户确认学科和分类才写进题库。
 *
 * 为什么一定要这一步: 题目一旦进 questions 表, 就会进题库、进组卷、进 RAG 索引,
 * 而"归到哪个学科哪个分类"模型根本猜不准 —— 它不知道你平台里叫「计算机组成原理」
 * 还是「计算机组成」。入库之后再改, 影响面比在这里点两下大得多。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Library, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useAssistantStore } from '@/stores/assistant-store'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { QuestionDraftMeta } from '@/lib/assistant-commands'
import type { ParsedQuestion } from '@/lib/ai/types'
import { cn } from '@/lib/utils'

/** 答案在题干里的落点随题型而变: 单选是序号、填空是文本、判断是布尔 */
function answerText(q: ParsedQuestion): string {
  const a = q.correct_answer
  if (a === null || a === undefined || a === '') return '（无）'
  if (typeof a === 'boolean') return a ? '正确' : '错误'
  if (typeof a === 'number') return q.options[a] ? `${String.fromCharCode(65 + a)}. ${q.options[a]}` : String(a)
  if (Array.isArray(a)) {
    return a.map((item) => (typeof item === 'number' && q.options[item]
      ? `${String.fromCharCode(65 + item)}. ${q.options[item]}`
      : String(item))).join('；')
  }
  return String(a)
}

function QuestionRow({ q }: { q: ParsedQuestion }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
      >
        <ChevronRight className={cn('mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed">{q.question_text}</span>
        <Badge variant="secondary" className="shrink-0 border-transparent text-[9px] font-normal">
          {QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type}
        </Badge>
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {q.options.length > 0 && (
            <ul className="space-y-0.5">
              {q.options.map((option, i) => (
                <li key={i}>{String.fromCharCode(65 + i)}. {option}</li>
              ))}
            </ul>
          )}
          <p><span className="text-foreground">答案：</span>{answerText(q)}</p>
          {q.analysis && <p><span className="text-foreground">解析：</span>{q.analysis}</p>}
          {q.answer_explanation && <p><span className="text-foreground">讲解：</span>{q.answer_explanation}</p>}
          {q.key_points && <p><span className="text-foreground">知识点：</span>{q.key_points}</p>}
          {q.source_page && <p>来源页码：{q.source_page}</p>}
        </div>
      )}
    </div>
  )
}

export function QuestionDraftCard({ messageId, meta }: { messageId: number; meta: QuestionDraftMeta }) {
  const confirmDraft = useAssistantStore((s) => s.confirmQuestionDraft)
  const discardDraft = useAssistantStore((s) => s.discardQuestionDraft)
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [subject, setSubject] = useState(meta.subject ?? '')
  const [category, setCategory] = useState(meta.categories[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(meta.questions.length <= 2)

  useEffect(() => {
    if (subject) void updateFilteredCategories(subject)
  }, [subject, updateFilteredCategories])

  const pending = meta.status === 'pending'
  const shown = showAll ? meta.questions : meta.questions.slice(0, 2)

  async function handleInsert() {
    setBusy(true)
    await confirmDraft(messageId, { subject: subject || null, categories: category ? [category] : [] })
    setBusy(false)
  }

  if (!pending) {
    const done = meta.status === 'inserted'
    return (
      <div className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]',
        done ? 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-muted/40 text-muted-foreground',
      )}>
        {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Trash2 className="h-3 w-3" />}
        <span>{done ? `已入库 ${meta.insertedCount ?? meta.questions.length} 道题` : '已丢弃，没有写进题库'}</span>
        {done && meta.subject && <span className="text-muted-foreground">· {meta.subject}{meta.categories[0] ? ` / ${meta.categories[0]}` : ''}</span>}
        {done && (
          <Link to="/admin/questions" className="ml-auto text-primary hover:underline">去题库看看</Link>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-background/70 p-2">
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Sparkles className="h-2.5 w-2.5" />
        待确认 · 共 {meta.questions.length} 道
      </p>

      {!meta.grounded && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          平台资料里没检索到「{meta.prompt}」的对应内容，这几道题是模型凭自身知识出的，
          学科、分类和答案都请逐条核对后再入库。
        </p>
      )}

      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground">学科</span>
          <Select value={subject || undefined} onValueChange={setSubject}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="选择学科" /></SelectTrigger>
            <SelectContent>
              {subjects.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground">分类</span>
          <Select value={category || undefined} onValueChange={setCategory}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={subject ? '选择分类' : '先选学科'} /></SelectTrigger>
            <SelectContent>
              {(subject ? filteredCategories : []).map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="space-y-1">
        {shown.map((q, i) => <QuestionRow key={i} q={q} />)}
      </div>

      {meta.questions.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', showAll && 'rotate-180')} />
          {showAll ? '收起' : `展开其余 ${meta.questions.length - 2} 道`}
        </button>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm" className="h-7 gap-1.5 text-xs"
          disabled={busy || !subject}
          onClick={() => void handleInsert()}
        >
          {busy ? <Spinner className="h-3 w-3" /> : <Library className="h-3 w-3" />}
          入库 {meta.questions.length} 道
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
          disabled={busy} onClick={() => void discardDraft(messageId)}
        >
          不要了
        </Button>
        <span className={cn('ml-auto text-[10px]', subject ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
          {subject ? '入库后会自动进检索索引' : '先选学科 —— 入库之后再改影响面更大'}
        </span>
      </div>
    </div>
  )
}
