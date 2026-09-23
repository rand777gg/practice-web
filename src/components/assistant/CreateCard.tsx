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
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, Info, Library, RotateCcw, Search,
  Sparkles, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ContentPickerDialog } from '@/components/assistant/ContentPickerDialog'
import { KeyPointChips, KeyPointPicker } from '@/components/assistant/KeyPointPicker'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import { useAssistantStore } from '@/stores/assistant-store'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import {
  COUNT_MAX, PLATFORM_SOURCES, PLATFORM_SOURCE_LABEL, SOURCE_LABEL, SPREAD_LABEL, describeSpec,
  formatKeyPoints, normalizeSpec, selectionSummary, splitKeyPoints, type CreateSource, type CreateSpec,
  type CreateSpread,
} from '@/lib/assistant-create'
import type { CreateDraftMeta } from '@/lib/assistant-commands'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { QuestionType } from '@/types'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SeparatedList } from '@/components/ui/separated-list'

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

function QuestionRow({ q, index, subject, onKeyPoints }: {
  q: ParsedQuestion
  index: number
  subject: string | null
  onKeyPoints: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const kps = splitKeyPoints(q.key_points)
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
          {q.source_page && <p><span className="text-foreground">出处：</span>{q.source_page}</p>}

          {/* 知识点在这儿可以自己挑 —— 它是一套带编号的受控词表, 不该由模型写死 */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-foreground">知识点：</span>
            <KeyPointPicker subject={subject} value={kps} onChange={onKeyPoints} compact />
            {kps.length === 0 && <span className="text-amber-600 dark:text-amber-400">未设置</span>}
          </div>
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
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 第 2 步里用户对每道题知识点的改动; 没动过的题不在这个表里 */
  const [kpEdits, setKpEdits] = useState<Record<number, string[]>>({})
  const [batchKp, setBatchKp] = useState<string[]>([])

  /**
   * 知识点的最终值 = 出题结果 + 用户在卡片上的改动。
   * 改动只留在本地 state, 入库那一刻才合并 —— 点一下写一次库既吵又没必要。
   */
  const questions = useMemo(
    () => meta.questions.map((q, i) => (
      kpEdits[i] ? { ...q, key_points: formatKeyPoints(kpEdits[i]) ?? undefined } : q
    )),
    [meta.questions, kpEdits],
  )
  const setQuestionKeyPoints = (index: number, next: string[]) => {
    setKpEdits((prev) => ({ ...prev, [index]: next }))
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
           <Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{meta.spec.subject}{meta.spec.categories[0] ? ` / ${meta.spec.categories[0]}` : ''}
            {meta.spec.markVerified && <><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />已标为已核对</>}
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
      <>
        <ContentPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          documents={documents}
          initialDocumentId={spec.documentId}
          initialSelection={spec.selection}
          onConfirm={(selection) => patch({
            selection,
            // 用户在弹窗里换了文献, 卡片上的"哪一篇"要跟着走, 否则出题时用的是另一篇
            documentId: selection?.documentId ?? spec.documentId,
          })}
        />
        <div className="space-y-2.5 rounded-lg border border-primary/25 bg-background/70 p-2.5">
        <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          第 1 步<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />确认参数（还没出题）
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

          <Field label="范围" hint={spec.source === 'resource' ? '点开挑你要考的内容' : '需先指定文献'}>
            <Button
              type="button"
              variant="outline"
              aria-label="选择资料内容"
              disabled={spec.source !== 'resource' || documents.length === 0}
              onClick={() => setPickerOpen(true)}
              className="h-7 w-full justify-between px-2 text-xs font-normal"
            >
              <span className={cn('flex min-w-0 items-center gap-1.5', !spec.selection && 'text-muted-foreground')}>
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {spec.source !== 'resource'
                    ? '先选「指定某一篇文献」'
                    : spec.selection ? <SeparatedList items={selectionSummary(spec.selection)} /> : '选择资料内容'}
                </span>
              </span>
              <Search className="h-3 w-3 shrink-0 opacity-60" />
            </Button>
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
          <Field label="知识点" hint="选填，从平台已有的知识点里挑">
            <div className="space-y-1">
              <KeyPointPicker
                subject={spec.subject}
                value={spec.keyPoints}
                onChange={(next) => patch({ keyPoints: next })}
                disabled={!spec.subject}
              />
              <KeyPointChips value={spec.keyPoints} onChange={(next) => patch({ keyPoints: next })} />
              {spec.keyPoints.length === 0 && (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  不选的话，出的题不带知识点，也就进不了按知识点统计的练习进度。
                </p>
              )}
            </div>
          </Field>
        </div>

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
            <p className="pt-0.5 text-[11px] text-muted-foreground"><SeparatedList items={describeSpec(spec)} /></p>
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
            // 指定文献时必须先选内容: 没选就等于"从整篇里按主题猜着找", 而用户以为自己选好了
            disabled={busy || sending || !spec.subject || (spec.source === 'resource' && !spec.selection)}
            onClick={() => {
              setBusy(true)
              void startGeneration(messageId, spec).finally(() => setBusy(false))
            }}
          >
            {busy || sending ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            开始出题
          </Button>
          <span className={cn(
            'text-[10px]',
            spec.subject && !(spec.source === 'resource' && !spec.selection)
              ? 'text-muted-foreground'
              : 'text-amber-600 dark:text-amber-400',
          )}>
            {!spec.subject
              ? '先选学科'
              : spec.source === 'resource' && !spec.selection
                ? '先点「选择资料内容」'
                : <>{SOURCE_LABEL[spec.source]}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{spec.count} 道</>}
          </span>
        </div>
        </div>
      </>
    )
  }

  // ── ② 出题结果确认 ──
  const shown = showAllQuestions ? questions : questions.slice(0, 2)
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-background/70 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Sparkles className="h-2.5 w-2.5" />
        第 2 步<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />确认题目（共 {meta.questions.length} 道，入库前还没写进题库）
      </p>

      <div className="flex flex-wrap gap-1 text-[10px]">
        <Badge variant="secondary" className="border-transparent font-normal">{SOURCE_LABEL[meta.spec.source]}</Badge>
        <Badge variant="secondary" className="border-transparent font-normal">
          {meta.spec.subject}{meta.spec.categories[0] ? ` / ${meta.spec.categories[0]}` : ''}
        </Badge>
        {meta.spec.selection && (
          <Badge variant="secondary" className="border-transparent font-normal">
            <SeparatedList items={selectionSummary(meta.spec.selection)} />
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
            <div key={i} className="flex items-center gap-1 truncate">
              <Badge variant="secondary" className="shrink-0 border-transparent text-[9px] font-normal">
                {PLATFORM_SOURCE_LABEL[s.type]}
              </Badge>
              <span className="truncate">{s.label}{s.pageNo && <><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />第 {s.pageNo} 页</>}</span>
              {s.anchor && <Link to={s.anchor} className="shrink-0 text-primary hover:underline">看原文</Link>}
            </div>
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

      {meta.materialNote && (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {meta.materialNote}
        </p>
      )}

      <div className="space-y-1">
        {shown.map((q, i) => (
          <QuestionRow
            key={i}
            q={q}
            index={i}
            subject={meta.spec.subject}
            onKeyPoints={(next) => setQuestionKeyPoints(i, next)}
          />
        ))}
      </div>

      

      {/* 知识点是一套受控词表, 这里给一个"一次改完"的口子 —— 10 道题逐个点太累 */}      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground">全部设为</span>
        <KeyPointPicker subject={meta.spec.subject} value={batchKp} onChange={setBatchKp} compact />
        <Button
          size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
          disabled={batchKp.length === 0}
          onClick={() => {
            const next: Record<number, string[]> = {}
            for (let i = 0; i < questions.length; i++) next[i] = batchKp
            setKpEdits(next)
          }}
        >
          应用到全部 {questions.length} 道
        </Button>
        <span className="text-[10px] text-muted-foreground">
          或者展开每道题单独改（现在有 {questions.filter((q) => !q.key_points?.trim()).length} 道没知识点）
        </span>
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
            void confirmDraft(messageId, questions).finally(() => setBusy(false))
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
