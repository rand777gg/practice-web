/**
 * /create 的卡片，两段式：
 *
 *   ① spec   —— 先对齐需求：从哪篇资料出、几道、什么题型、归哪个学科分类、要不要避重……
 *   ② review —— 出完之后再看题，确认无误才入库
 *
 * 为什么不是"一句话直接出题": 出 3 道题几毛钱, 但在两千道题的题库里收拾跑偏的题花的是人的
 * 时间。所以宁可多一次确认 —— 而且确认的内容(学科/分类/资料)恰恰是模型最猜不准、只有用户
 * 知道的那部分。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Info, Library, RotateCcw, Sparkles, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useAssistantStore } from '@/stores/assistant-store'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import {
  COUNT_MAX, DIFFICULTY_LABEL, SOURCE_LABEL, SPREAD_LABEL, normalizeSpec,
  type CreateDifficulty, type CreateSource, type CreateSpec, type CreateSpread,
} from '@/lib/assistant-create'
import type { CreateDraftMeta } from '@/lib/assistant-commands'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { QuestionType } from '@/types'
import { cn } from '@/lib/utils'

interface Doc { id: string; title: string }

/** 已发布文献列表: 卡片自己拉, 免得每次开对话都为一张可能不存在的卡片多打一次库 */
let docCache: Doc[] | null = null

function usePublishedDocuments(enabled: boolean): Doc[] {
  const [docs, setDocs] = useState<Doc[]>(docCache ?? [])
  useEffect(() => {
    if (!enabled || docCache) return
    let cancelled = false
    void import('@/lib/resource-library').then(async ({ listResourceDocuments }) => {
      const all = await listResourceDocuments()
      if (cancelled) return
      docCache = all.filter((d) => d.is_published).map((d) => ({ id: d.id, title: d.title }))
      setDocs(docCache)
    }).catch(() => { /* 拉不到就只留"跨来源"这一个选项, 不挡出题 */ })
    return () => { cancelled = true }
  }, [enabled])
  return docs
}

/** 答案的落点随题型而变: 单选是序号、填空是文本、判断是布尔 */
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

function QuestionRow({ q, index }: { q: ParsedQuestion; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
      >
        <ChevronRight className={cn('mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed">
          <span className="text-muted-foreground">{index + 1}. </span>
          {q.question_text}
        </span>
        <Badge variant="secondary" className="shrink-0 border-transparent text-[9px] font-normal">
          {QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type}
        </Badge>
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {q.options.length > 0 && (
            <ul className="space-y-0.5">
              {q.options.map((option, i) => <li key={i}>{String.fromCharCode(65 + i)}. {option}</li>)}
            </ul>
          )}
          <p><span className="text-foreground">答案：</span>{answerText(q)}</p>
          {q.analysis && <p><span className="text-foreground">解析：</span>{q.analysis}</p>}
          {q.key_points && <p><span className="text-foreground">知识点：</span>{q.key_points}</p>}
          {q.source_page && <p><span className="text-foreground">出处：</span>{q.source_page}</p>}
        </div>
      )}
    </div>
  )
}

/** 小控件: 一行标签 + 控件, 面板里是单列, 宽屏两列 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}{hint && <span className="ml-1 opacity-70">{hint}</span>}</p>
      {children}
    </div>
  )
}

function Choice<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
            value === o.value
              ? 'border-primary bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function CreateCard({ messageId, meta }: { messageId: number; meta: CreateDraftMeta }) {
  const startGeneration = useAssistantStore((s) => s.startCreateGeneration)
  const reopenSpec = useAssistantStore((s) => s.reopenCreateSpec)
  const confirmDraft = useAssistantStore((s) => s.confirmCreateDraft)
  const discardDraft = useAssistantStore((s) => s.discardCreateDraft)
  const sending = useAssistantStore((s) => s.sending)
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  // 只要卡片停在参数这一步就先拉好文献列表。等用户切到"指定某一篇"再去拉,
  // 那个下拉会在切换后的头几百毫秒里是灰的 —— 看起来就像"选不了文献"。
  const documents = usePublishedDocuments(meta.status === 'spec')

  const [spec, setSpec] = useState<CreateSpec>(meta.spec)
  const [busy, setBusy] = useState(false)
  const [showAllQuestions, setShowAllQuestions] = useState(false)

  useEffect(() => {
    if (spec.subject) void updateFilteredCategories(spec.subject)
  }, [spec.subject, updateFilteredCategories])

  const patch = (next: Partial<CreateSpec>) => setSpec((prev) => normalizeSpec({ ...prev, ...next }))

  // ── 终态 ──
  if (meta.status === 'inserted' || meta.status === 'discarded') {
    const done = meta.status === 'inserted'
    return (
      <div className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]',
        done ? 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-muted/40 text-muted-foreground',
      )}>
        {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Trash2 className="h-3 w-3" />}
        <span>{done ? `已入库 ${meta.insertedCount ?? meta.questions.length} 道题` : '已丢弃，没有写进题库'}</span>
        {done && meta.spec.subject && (
          <span className="text-muted-foreground">
            · {meta.spec.subject}{meta.spec.categories[0] ? ` / ${meta.spec.categories[0]}` : ''}
            {meta.spec.markVerified ? ' · 已标为已核对' : ''}
          </span>
        )}
        {done && <Link to="/admin/questions" className="ml-auto text-primary hover:underline">去题库看看</Link>}
      </div>
    )
  }

  // ── ① 参数确认 ──
  if (meta.status === 'spec') {
    const selectedTypes = spec.questionTypes
    return (
      <div className="space-y-2.5 rounded-lg border border-primary/25 bg-background/70 p-2.5">
        <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          第 1 步 · 确认参数（还没出题）
        </p>

        {meta.understanding && (
          <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed">
            <span className="text-muted-foreground">我的理解：</span>{meta.understanding}
          </p>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="资料库" hint="材料从哪儿来">
            <Select
              value={spec.source}
              onValueChange={(v) => patch({ source: v as CreateSource, documentId: v === 'resource' ? spec.documentId : null })}
            >
              <SelectTrigger aria-label="资料库" className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as CreateSource[]).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{SOURCE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {spec.source === 'resource' && (
            <Field label="哪一篇" hint={documents.length ? undefined : '（资料库还没有已发布的文献）'}>
              <Select
                value={spec.documentId ?? undefined}
                onValueChange={(v) => patch({ documentId: v })}
                disabled={documents.length === 0}
              >
                <SelectTrigger aria-label="文献" className="h-7 text-xs"><SelectValue placeholder="选择文献" /></SelectTrigger>
                <SelectContent>
                  {documents.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="范围" hint="选填，章节或页码范围">
            <Input
              value={spec.scope}
              onChange={(e) => patch({ scope: e.target.value })}
              placeholder="如：第 3 章 / 40-60"
              aria-label="范围"
              className="h-7 text-xs"
            />
          </Field>

          <Field label="数量" hint={`1–${COUNT_MAX}`}>
            <Input
              type="number"
              min={1}
              max={COUNT_MAX}
              value={spec.count}
              onChange={(e) => patch({ count: Number(e.target.value) })}
              aria-label="数量"
              className="h-7 text-xs"
            />
          </Field>
        </div>

        <Field label="主题 / 题干要求">
          <Input
            value={spec.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="如：古罗马时期的医学流派"
            aria-label="主题"
            className="h-7 text-xs"
          />
        </Field>

        <Field label="题型" hint={`已选 ${selectedTypes.length} 种`}>
          <div className="flex flex-wrap gap-1">
            {QUESTION_TYPE_OPTIONS.map((o) => {
              const on = selectedTypes.includes(o.value as QuestionType)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => patch({
                    questionTypes: on
                      ? selectedTypes.filter((t) => t !== o.value)
                      : [...selectedTypes, o.value as QuestionType],
                  })}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                    on
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="学科" hint="必选">
            <Select value={spec.subject ?? undefined} onValueChange={(v) => patch({ subject: v, categories: [] })}>
              <SelectTrigger aria-label="学科" className="h-7 text-xs"><SelectValue placeholder="选择学科" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="分类" hint="选填">
            <Select
              value={spec.categories[0] ?? undefined}
              onValueChange={(v) => patch({ categories: [v] })}
              disabled={!spec.subject}
            >
              <SelectTrigger aria-label="分类" className="h-7 text-xs">
                <SelectValue placeholder={spec.subject ? '选择分类' : '先选学科'} />
              </SelectTrigger>
              <SelectContent>
                {(spec.subject ? filteredCategories : []).map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="考点分布">
            <Choice<CreateSpread>
              value={spec.spread}
              onChange={(v) => patch({ spread: v })}
              options={[
                { value: 'spread', label: SPREAD_LABEL.spread },
                { value: 'focus', label: SPREAD_LABEL.focus },
              ]}
            />
          </Field>
          <Field label="难度" hint="只影响出题，题库里不存这一项">
            <Choice<CreateDifficulty>
              value={spec.difficulty}
              onChange={(v) => patch({ difficulty: v })}
              options={(['easy', 'normal', 'hard'] as CreateDifficulty[]).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
            />
          </Field>
        </div>

        <div className="space-y-1.5 border-t pt-2">
          <label className="flex items-center gap-2">
            <Switch checked={spec.avoidDuplicates} onCheckedChange={(v) => patch({ avoidDuplicates: v })} />
            <span className="text-[10px] text-muted-foreground">
              避开题库里已出过的题（会把最相似的几道喂给模型当"不要再出这些"）
            </span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={spec.markVerified} onCheckedChange={(v) => patch({ markVerified: v })} />
            <span className="text-[10px] text-muted-foreground">
              入库时直接标为「已核对」（默认不标：AI 刚出的题还没人看过）
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <Button
            size="sm" className="h-7 gap-1.5 text-xs"
            disabled={busy || sending || !spec.subject || !spec.prompt.trim()}
            onClick={() => {
              setBusy(true)
              void startGeneration(messageId, spec).finally(() => setBusy(false))
            }}
          >
            {busy || sending ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            开始出题
          </Button>
          <span className={cn('text-[10px]', spec.subject ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
            {!spec.prompt.trim() ? '先写主题' : !spec.subject ? '先选学科' : `${SOURCE_LABEL[spec.source]} · ${spec.count} 道`}
          </span>
        </div>
      </div>
    )
  }

  // ── ② 出题结果确认 ──
  const shown = showAllQuestions ? meta.questions : meta.questions.slice(0, 2)
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-background/70 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Sparkles className="h-2.5 w-2.5" />
        第 2 步 · 确认题目（共 {meta.questions.length} 道，入库前还没写进题库）
      </p>

      <div className="flex flex-wrap gap-1 text-[10px]">
        <Badge variant="secondary" className="border-transparent font-normal">{SOURCE_LABEL[meta.spec.source]}</Badge>
        <Badge variant="secondary" className="border-transparent font-normal">
          {meta.spec.subject}{meta.spec.categories[0] ? ` / ${meta.spec.categories[0]}` : ''}
        </Badge>
        {meta.spec.scope && <Badge variant="secondary" className="border-transparent font-normal">范围 {meta.spec.scope}</Badge>}
        {meta.spec.avoidDuplicates && <Badge variant="secondary" className="border-transparent font-normal">已避重</Badge>}
      </div>

      {meta.grounded ? (
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed">
          <p className="flex items-center gap-1 text-muted-foreground">
            <Library className="h-2.5 w-2.5" />
            出题依据（{meta.sources.length} 处）
          </p>
          {meta.sources.map((s, i) => (
            <p key={i} className="truncate">
              · {s.label}{s.pageNo ? ` · 第 ${s.pageNo} 页` : ''}
              {s.anchor && <Link to={s.anchor} className="ml-1 text-primary hover:underline">看原文</Link>}
            </p>
          ))}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {meta.spec.source === 'model'
            ? '按你的要求没有查资料，这几道题来自模型自己的知识，学科、分类和答案请逐条核对。'
            : '平台资料里没检索到对应的内容，这几道题来自模型自己的知识，请重点核对答案。'}
        </p>
      )}

      {meta.scopeMissed && (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          范围「{meta.spec.scope}」在检索到的材料里一条都没匹配上，这次是按整个主题出的。
          想限定范围的话，把章节名写得更接近文献里的标题（比如「第 1 章 古代的医药卫生」）。
        </p>
      )}

      <div className="space-y-1">
        {shown.map((q, i) => <QuestionRow key={i} q={q} index={i} />)}
      </div>

      {meta.questions.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAllQuestions((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', showAllQuestions && 'rotate-180')} />
          {showAllQuestions ? '收起' : `展开其余 ${meta.questions.length - 2} 道`}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button
          size="sm" className="h-7 gap-1.5 text-xs"
          disabled={busy || sending}
          onClick={() => {
            setBusy(true)
            void confirmDraft(messageId).finally(() => setBusy(false))
          }}
        >
          {busy ? <Spinner className="h-3 w-3" /> : <Library className="h-3 w-3" />}
          入库 {meta.questions.length} 道
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 gap-1 text-xs"
          disabled={busy || sending}
          onClick={() => void reopenSpec(messageId)}
        >
          <RotateCcw className="h-3 w-3" />
          改参数重出
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
          disabled={busy || sending}
          onClick={() => void discardDraft(messageId)}
        >
          不要了
        </Button>
        <span className="text-[10px] text-muted-foreground">入库后会自动进检索索引</span>
      </div>
    </div>
  )
}
