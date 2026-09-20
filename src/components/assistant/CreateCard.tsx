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
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
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
  COUNT_MAX, PLATFORM_SOURCES, PLATFORM_SOURCE_LABEL, SOURCE_LABEL, SPREAD_LABEL, describeSpec,
  normalizeSpec, type CreateScope, type CreateSource, type CreateSpec, type CreateSpread,
} from '@/lib/assistant-create'
import type { CreateDraftMeta } from '@/lib/assistant-commands'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { TocSection } from '@/lib/resource-blocks'
import type { QuestionType } from '@/types'
import { cn } from '@/lib/utils'

interface Doc { id: string; title: string }

/** 建议列表里带上页码, 不然一堆同名标题("小结")看不出哪个是哪个 */
function scopeSuffix(s: TocSection): string {
  return s.pageTo > s.pageFrom ? `（第 ${s.pageFrom}-${s.pageTo} 页）` : `（第 ${s.pageFrom} 页）`
}

function scopeLabelOf(scope: CreateScope): string {
  return scope.tocKey !== null ? scope.label : `${scope.from}${scope.to > scope.from ? `-${scope.to}` : ''}`
}

/**
 * 输入框文本 → 结构化范围。
 * 三种输入都认: 目录里某一节的标题(建议列表点出来的)、页码范围("40-60")、清空(不限)。
 * 对不上就返回 null —— 宁可当成不限并在出题时如实说明, 也不要猜一个范围出来。
 */
function scopeFromText(text: string, sections: TocSection[]): CreateScope | null {
  // 建议列表里的条目带着"（第 X-Y 页）"后缀, 匹配前先摘掉
  const bare = text.replace(/（第[^）]*页）\s*$/, '').trim()
  if (!bare) return null

  const hit = sections.find((s) => s.title === bare) ?? sections.find((s) => s.title.includes(bare))
  if (hit) return { label: hit.title, from: hit.pageFrom, to: hit.pageTo, tocKey: hit.key }

  const range = /^(\d+)\s*(?:[-–—~]\s*(\d+))?$/.exec(bare)
  if (range) {
    const from = Number(range[1])
    return { label: '', from, to: Number(range[2] ?? range[1]), tocKey: null }
  }
  return null
}

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

/** 某一篇文献的章节目录(页码区间), 按篇缓存 —— 同一篇被反复选中时不再重拉 */
const sectionCache = new Map<string, TocSection[]>()
const NO_SECTIONS: TocSection[] = []

/**
 * 直接在渲染时读缓存, 而不是把缓存抄进一份 state。
 * 抄进 state 就得在 effect 体里同步 setState(先给旧值再给新值), 那既多一轮渲染, 也会让
 * "这一段目录到底加载完没有"变得看不出来; 缓存只增不减, 渲染时读它是安全的。
 */
function useDocumentSections(documentId: string | null): TocSection[] {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!documentId || sectionCache.has(documentId)) return
    let cancelled = false
    void import('@/lib/resource-library').then(async ({ loadDocumentSections }) => {
      const list = await loadDocumentSections(documentId)
      if (cancelled) return
      sectionCache.set(documentId, list)
      bump((n) => n + 1)
    }).catch(() => { /* 没有目录就退回手填页码范围 */ })
    return () => { cancelled = true }
  }, [documentId])
  return documentId ? sectionCache.get(documentId) ?? NO_SECTIONS : NO_SECTIONS
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
          aria-pressed={value === o.value}
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
  // 范围输入框自己持有一份文本: 用户打字打到一半时 scope 还是 null(章节名没对上),
  // 如果输入框的 value 直接绑 scope, 那半截字会被立刻抹掉, 根本没法往下打
  const [scopeText, setScopeText] = useState(() => (meta.spec.scope ? scopeLabelOf(meta.spec.scope) : ''))
  // 注意这里用的是本地 draft 的 documentId, 不是 meta.spec: 用户在卡片上选文献只改本地状态,
  // 要等点了"开始出题"才写回 meta。盯 meta 的话永远拉不到这一篇的目录。
  const sections = useDocumentSections(spec.documentId)

  /** 输入框里的文本 → 结构化范围: 先当章节名在目录里找, 再当页码范围 */
  function applyScopeText(text: string) {
    setScopeText(text)
    patch({ scope: scopeFromText(text, sections) })
  }

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

          <Field label="范围" hint={sections.length > 0 ? '选填，从目录里找一节' : '选填'}>
            {spec.source === 'resource' && sections.length > 0 ? (
              <AutocompleteInput
                value={scopeText}
                onChange={applyScopeText}
                // 一本书能解析出几百个标题, 普通下拉框根本翻不动 —— 给可搜索的建议列表,
                // 同时也允许直接写页码范围("40-60")
                suggestions={sections.map((s) => `${s.title}${scopeSuffix(s)}`)}
                placeholder="输入章节名或页码，如 40-60"
                className="h-7 text-xs"
                clearable
              />
            ) : (
              <Input
                value={scopeText}
                onChange={(e) => applyScopeText(e.target.value)}
                placeholder={spec.source === 'resource' ? '这篇文献没有目录，可填页码范围，如 40-60' : '先指定文献'}
                disabled={spec.source !== 'resource'}
                aria-label="范围"
                className="h-7 text-xs"
              />
            )}
          </Field>

          {spec.source === 'platform' && (
            <Field label="只用哪几类资料" hint="至少留一类">
              <div className="flex flex-wrap gap-1">
                {PLATFORM_SOURCES.map((s) => {
                  const on = spec.sources.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      // 最后一个是唯一选中的就不让取消 —— 一类都不选等于检索不出任何材料,
                      // 那时它会静默退化成"模型自己出题", 而用户以为用的是平台资料
                      disabled={on && spec.sources.length === 1}
                      onClick={() => patch({
                        sources: on ? spec.sources.filter((x) => x !== s) : [...spec.sources, s],
                      })}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                        on
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:border-primary/40 hover:text-foreground',
                        on && spec.sources.length === 1 && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      {PLATFORM_SOURCE_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

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
                  aria-pressed={on}
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
          <Field label="出题范围小结" hint="确认一下这行是不是你要的">
            <p className="pt-0.5 text-[11px] text-muted-foreground">{describeSpec(spec)}</p>
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
        {meta.spec.scope && (
          <Badge variant="secondary" className="border-transparent font-normal">
            范围 {meta.spec.scope.label}（第 {meta.spec.scope.from}{meta.spec.scope.to > meta.spec.scope.from ? `-${meta.spec.scope.to}` : ''} 页）
          </Badge>
        )}
        {meta.spec.source === 'platform' && meta.spec.sources.length < PLATFORM_SOURCES.length && (
          <Badge variant="secondary" className="border-transparent font-normal">
            只用 {meta.spec.sources.map((s) => PLATFORM_SOURCE_LABEL[s]).join('/')}
          </Badge>
        )}
        {meta.spec.avoidDuplicates && <Badge variant="secondary" className="border-transparent font-normal">已避重</Badge>}
      </div>

      {meta.grounded ? (
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed">
          <p className="flex items-center gap-1 text-muted-foreground">
            <Library className="h-2.5 w-2.5" />
            出题依据（{meta.sources.length} 处）
          </p>
          {meta.sources.map((s, i) => (
            <p key={i} className="flex items-center gap-1 truncate">
              <Badge variant="secondary" className="shrink-0 border-transparent text-[9px] font-normal">
                {PLATFORM_SOURCE_LABEL[s.type]}
              </Badge>
              <span className="truncate">{s.label}{s.pageNo ? ` · 第 ${s.pageNo} 页` : ''}</span>
              {s.anchor && <Link to={s.anchor} className="shrink-0 text-primary hover:underline">看原文</Link>}
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

      {meta.scopeMissed && meta.spec.scope && (() => {
        const scope = meta.spec.scope
        const pages = scope.to > scope.from ? `第 ${scope.from}-${scope.to} 页` : `第 ${scope.from} 页`
        return (
          <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            范围「{scope.label}」（{pages}）里一条材料都没检索到，这次是按整篇出的。
            换一节再试，或者把范围清掉。
          </p>
        )
      })()}

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
