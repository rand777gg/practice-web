import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, DatabaseZap, ExternalLink, FileUp, Layers, Loader2, Play, Square,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { KeyPointPicker } from '@/components/assistant/KeyPointPicker'
import { ResourceIngestDialog } from '@/components/resource/ResourceIngestDialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { searchKnowledge, syncRagSource, type RagHit } from '@/lib/rag'
import { listResourceDocuments, type ResourceDocument } from '@/lib/resource-library'
import {
  CONFIDENCE_TIER_LABEL, TRIAGE_CRITERIA, attributeHits, confidenceTier, defaultLevel, evidenceSnippet,
  levelsOf, matchKeyPoints, retrievalQuery, withChapterTag,
  type Attribution, type ConfidenceTier, type SectionNode, type TriageCriterion, type TriageQuestion,
} from '@/lib/experience-parse'
import {
  documentIndexStatus, loadQuestionMeta, loadSectionNodes, loadTriageQuestions, saveAttribution,
  type QuestionMetaOptions,
} from '@/lib/experience-parse-store'

/** 一个批次内同时在检索的题目数。每条检索都要服务端算一次查询向量, 并发再高只是挤同一把额度 */
const CONCURRENCY = 3
/** 每道题带回来的命中条数 —— 投票要有几条才看得出"集中在哪一节" */
const HITS_PER_QUESTION = 12
const ALL = 'all'

type RowState = 'pending' | 'running' | 'done' | 'error' | 'applied' | 'skipped'

interface ResultRow {
  question: TriageQuestion
  state: RowState
  hits: RagHit[]
  /** undefined = 还没手动改过, 跟着检索建议走; null = 管理员明确"不归类" */
  chapterKey: number | null | undefined
  keyPoints: string[]
  error: string | null
}

const TIER_CLASS: Record<ConfidenceTier, string> = {
  high: 'border-green-600/40 text-green-700 dark:text-green-400',
  medium: 'border-amber-600/40 text-amber-700 dark:text-amber-400',
  low: 'border-muted-foreground/30 text-muted-foreground',
}

function pathLabel(path: string[]): string {
  return path.join(' › ')
}

function stem(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export function Component() {
  const [docs, setDocs] = useState<ResourceDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [mainDocId, setMainDocId] = useState(ALL)
  const [refDocId, setRefDocId] = useState(ALL)
  const [indexStatus, setIndexStatus] = useState<{ chunks: number; embedded: number } | null>(null)
  const [nodes, setNodes] = useState<SectionNode[]>([])
  const [level, setLevel] = useState(1)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [indexing, setIndexing] = useState(false)

  const [meta, setMeta] = useState<QuestionMetaOptions>({ subjects: [], years: [] })
  const [subject, setSubject] = useState(ALL)
  const [year, setYear] = useState(ALL)
  const [criterion, setCriterion] = useState<TriageCriterion>('either')
  const [limit, setLimit] = useState(30)

  const [rows, setRows] = useState<ResultRow[]>([])
  const [scanned, setScanned] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stopRef = useRef(false)
  /** 学科 → 受控知识点词表。整批题基本同属一个学科, 不缓存就等于每题查一次库 */
  const vocabRef = useRef(new Map<string, string[]>())

  useEffect(() => {
    let alive = true
    listResourceDocuments()
      .then((list) => { if (alive) setDocs(list) })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setDocsLoading(false) })
    loadQuestionMeta()
      .then((m) => { if (alive) setMeta(m) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    // 清空留给选择器那一步做: 在 effect 体里同步 setState 会触发级联渲染
    if (mainDocId === ALL) return
    let alive = true
    Promise.all([loadSectionNodes(mainDocId), documentIndexStatus(mainDocId)])
      .then(([list, status]) => {
        if (!alive) return
        setNodes(list)
        setIndexStatus(status)
        setLevel(defaultLevel(list))
      })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [mainDocId])

  const docTitle = (id: string) => docs.find((d) => d.id === id)?.title ?? '材料'

  const levelOptions = useMemo(() => levelsOf(nodes), [nodes])

  /** 只列到当前粒度为止的节点: 归属不可能落进比粒度更细的节 */
  const chapterOptions = useMemo(
    () => nodes.filter((n) => n.level <= level).map((n) => ({ key: n.key, label: pathLabel(n.chain.map((c) => c.title)) })),
    [nodes, level],
  )

  const nodeByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes])

  /** 各级标题长什么样 —— 材料里"第 1 级"到底是章还是节只有看一条才知道, 光说层级选不出来 */
  const levelSample = (lv: number) => {
    const first = nodes.find((n) => n.level === lv)
    return first ? stem(first.title, 18) : ''
  }

  const attributionOf = (row: ResultRow): Attribution => attributeHits(
    row.hits.map((h) => ({ sourceId: h.sourceId, pageNo: h.pageNo, score: h.score, content: h.content })),
    nodes,
    level,
    mainDocId,
  )

  const chapterKeyOf = (row: ResultRow, attr: Attribution): number | null => {
    if (row.chapterKey !== undefined) return row.chapterKey
    return attr.best?.key ?? null
  }

  /** 该题命中的主材料片段, 按得分排序 —— 佐证材料的命中另算, 只给人看 */
  const evidenceOf = (row: ResultRow) => {
    const main = row.hits.filter((h) => h.sourceId === mainDocId)
    const aside = row.hits.filter((h) => h.sourceId !== mainDocId)
    return { main: main.slice(0, 3), aside: aside.slice(0, 2) }
  }

  const loadVocabulary = async (q: TriageQuestion): Promise<string[]> => {
    const key = q.subject ?? ''
    const cached = vocabRef.current.get(key)
    if (cached) return cached
    const { data } = await supabase.rpc('get_question_meta', { p_subject: q.subject })
    const list = ((data as { key_points?: string[] } | null)?.key_points ?? [])
    vocabRef.current.set(key, list)
    return list
  }

  const patchRow = (index: number, patch: Partial<ResultRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /** 一道题: 检索 → 归属(渲染时算) → 预选知识点 */
  const runOne = async (index: number, q: TriageQuestion) => {
    patchRow(index, { state: 'running' })
    try {
      const sourceIds = [mainDocId, refDocId === ALL ? null : refDocId].filter((x): x is string => Boolean(x))
      const found = await searchKnowledge(retrievalQuery(q), {
        sources: ['resource'],
        sourceIds,
        limit: HITS_PER_QUESTION,
      })
      const attr = attributeHits(
        found.hits.map((h) => ({ sourceId: h.sourceId, pageNo: h.pageNo, score: h.score, content: h.content })),
        nodes,
        level,
        mainDocId,
      )
      // 知识点只预选**对得上受控词表**的条目; 对不上就留空让管理员自己挑
      const texts = [
        ...(attr.best?.path ?? []),
        ...found.hits.filter((h) => h.sourceId === mainDocId).map((h) => h.content),
      ]
      const picked = matchKeyPoints(await loadVocabulary(q), texts)
      patchRow(index, { state: 'done', hits: found.hits, keyPoints: picked, error: null })
    } catch (err) {
      patchRow(index, { state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const run = async () => {
    if (mainDocId === ALL) { setError('先选一份「归类依据」材料'); return }
    if (nodes.length === 0) { setError('这份材料没有可用的标题层级, 无法判断"属于哪一部分"'); return }
    setError(null)
    setNotice(null)
    setRunning(true)
    stopRef.current = false

    try {
      const loaded = await loadTriageQuestions({
        subject: subject === ALL ? null : subject,
        year: year === ALL ? null : Number(year),
        criterion,
        limit,
      })
      setScanned(loaded.scanned)
      const initial: ResultRow[] = loaded.rows.map((q) => ({
        question: q, state: 'pending', hits: [], chapterKey: undefined, keyPoints: [], error: null,
      }))
      setRows(initial)
      if (initial.length === 0) {
        setNotice(`扫了 ${loaded.scanned} 道题, 没有符合「${TRIAGE_CRITERIA.find((c) => c.value === criterion)?.label}」的题目。`)
        return
      }

      let cursor = 0
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, initial.length) }, async () => {
        for (;;) {
          const i = cursor++
          if (i >= initial.length || stopRef.current) return
          await runOne(i, initial[i].question)
        }
      }))
      setNotice(stopRef.current ? '已停止 —— 已经跑完的结果照旧可以采纳。' : '解析完成, 逐条确认后采纳。')
      if (stopRef.current) setRows((prev) => prev.map((r) => (r.state === 'pending' ? { ...r, state: 'skipped' } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const applyOne = async (index: number): Promise<boolean> => {
    const row = rows[index]
    const attr = attributionOf(row)
    const key = chapterKeyOf(row, attr)
    const tag = key === null ? null : (nodeByKey.get(key)?.title ?? null)
    if (!tag && row.keyPoints.length === 0) return false

    await saveAttribution(row.question, { chapterTag: tag, keyPoints: row.keyPoints })
    patchRow(index, {
      state: 'applied',
      error: null,
      question: {
        ...row.question,
        categories: tag ? withChapterTag(row.question.categories, tag) : row.question.categories,
        chapterTags: tag ? withChapterTag(row.question.chapterTags, tag) : row.question.chapterTags,
        keyPoints: row.keyPoints.length > 0
          ? [...new Set([...row.question.keyPoints, ...row.keyPoints])]
          : row.question.keyPoints,
      },
    })
    return true
  }

  const apply = async (index: number) => {
    setApplying(true)
    try {
      await applyOne(index)
    } catch (err) {
      patchRow(index, { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setApplying(false)
    }
  }

  /** 批量只采纳高置信度的: 中低档的建议本来就是要人看一眼的 */
  const applyHighConfidence = async () => {
    const targets = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.state === 'done' && confidenceTier(attributionOf(row)) === 'high')
    if (targets.length === 0) { setNotice('没有高置信度的建议可批量采纳。'); return }
    setApplying(true)
    setNotice(null)
    let done = 0
    const failures: string[] = []
    for (const { index } of targets) {
      try {
        if (await applyOne(index)) done += 1
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }
    setNotice(`批量采纳 ${done} / ${targets.length} 道${failures.length > 0 ? `，${failures.length} 道失败: ${failures[0]}` : ''}`)
    setApplying(false)
  }

  const doneCount = rows.filter((r) => r.state === 'done' || r.state === 'applied').length
  const highCount = rows.filter((r) => r.state === 'done' && confidenceTier(attributionOf(r)) === 'high').length
  const indexReady = (indexStatus?.chunks ?? 0) > 0

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">经验解析</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            往年真题常常只带年份标签, 看不出属于哪一部分。这里拿题干在「归类依据」材料里检索,
            命中块各自落回材料的章节目录, 得票最高的那一节就是它所属的部分 ——
            确认后写进题目的章节分类, 顺带能挂上平台已有的知识点。
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={running} onClick={() => setIngestOpen(true)}>
          <FileUp className="h-3.5 w-3.5" />上传材料 PDF
        </Button>
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{notice}</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">解析依据</h2>
          <span className="text-[11px] text-muted-foreground">知识点材料决定"属于哪一部分", 经验类材料只当佐证</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">归类依据（知识点材料）</Label>
            <Select
              value={mainDocId}
              onValueChange={(v) => {
                setMainDocId(v)
                setNodes([])
                setIndexStatus(null)
                setLevel(1)
              }}
              disabled={running || docsLoading}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选一份文献" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>未选择</SelectItem>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">佐证材料（可选，只展示命中片段，不参与归属投票）</Label>
            <Select value={refDocId} onValueChange={setRefDocId} disabled={running || docsLoading}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="不用" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>不用</SelectItem>
                {docs.filter((d) => d.id !== mainDocId).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mainDocId !== ALL && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px]">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              目录 {nodes.length} 节
              {levelOptions.length > 0 && <>，层级 {levelOptions.join(' / ')}</>}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className={cn(indexReady ? 'text-muted-foreground' : 'font-medium text-destructive')}>
              索引 {indexStatus?.chunks ?? 0} 块（已向量化 {indexStatus?.embedded ?? 0}）
            </span>
            {!indexReady && <span className="text-destructive">没有索引块就检索不到任何东西</span>}
            <span className="flex-1" />
            <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))} disabled={running || levelOptions.length === 0}>
              <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {levelOptions.map((lv) => (
                  <SelectItem key={lv} value={String(lv)}>
                    按第 {lv} 级{levelSample(lv) ? `（如 ${levelSample(lv)}）` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={indexing || running}
              onClick={async () => {
                setIndexing(true)
                setError(null)
                try {
                  const r = await syncRagSource('resource', mainDocId, {
                    onRound: (round) => setNotice(`建索引中... 已重算 ${round.embedded} 个块`),
                  })
                  setNotice(`索引同步完成: 共 ${r.total} 块, 本次重算 ${r.embedded}`)
                  setIndexStatus(await documentIndexStatus(mainDocId))
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setIndexing(false)
                }
              }}
            >
              {indexing ? <Loader2 className="h-3 w-3 animate-spin" /> : <DatabaseZap className="h-3 w-3" />}
              建索引
            </Button>
          </div>
        )}

        {mainDocId !== ALL && nodes.length === 0 && (
          <p className="text-[11px] text-destructive">
            这份材料没识别出标题层级（没有带编号的章/节标题）。可以先在资料库管理页编辑目录，
            或者换一份带章节目录的材料 —— 没有目录就没有"部分"可归。
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">待归类题目</h2>
          <span className="text-[11px] text-muted-foreground">按条件从题库里挑出缺标签的题</span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">学科</Label>
            <Select value={subject} onValueChange={setSubject} disabled={running}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部学科</SelectItem>
                {meta.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">真题年份</Label>
            <Select value={year} onValueChange={setYear} disabled={running}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部年份</SelectItem>
                {meta.years.map((y) => <SelectItem key={y} value={String(y)}>{y}年真题</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">缺什么</Label>
            <Select value={criterion} onValueChange={(v) => setCriterion(v as TriageCriterion)} disabled={running}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIAGE_CRITERIA.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">本批数量</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={limit}
              disabled={running}
              onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              className="h-8 w-20 text-xs"
            />
          </div>

          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={running || mainDocId === ALL || nodes.length === 0}
            onClick={() => void run()}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? `解析中 ${doneCount}/${rows.length}` : '开始解析'}
          </Button>
          {running && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { stopRef.current = true }}>
              <Square className="h-3 w-3" />停止
            </Button>
          )}
          {!running && highCount > 0 && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={applying} onClick={() => void applyHighConfidence()}>
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              采纳全部高置信度（{highCount}）
            </Button>
          )}
        </div>

        {scanned !== null && (
          <p className="text-[11px] text-muted-foreground">
            扫过 {scanned} 道题, 命中 {rows.length} 道待归类。
            {TRIAGE_CRITERIA.find((c) => c.value === criterion)?.hint}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">题目</TableHead>
                <TableHead className="min-w-[200px]">建议归属（{level} 级）</TableHead>
                <TableHead className="w-32">置信度</TableHead>
                <TableHead className="min-w-[260px]">检索依据</TableHead>
                <TableHead className="min-w-[160px]">知识点</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const attr = attributionOf(row)
                const tier = confidenceTier(attr)
                const key = chapterKeyOf(row, attr)
                const evidence = evidenceOf(row)
                const locked = row.state === 'applied' || row.state === 'pending' || row.state === 'running'
                return (
                  <TableRow key={row.question.id}>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center gap-1">
                        {row.question.year !== null && (
                          <Badge variant="secondary" className="px-1 py-0 text-[10px] leading-none">{row.question.year}年真题</Badge>
                        )}
                        {row.question.chapterTags.length === 0
                          ? <Badge variant="outline" className="border-amber-600/40 px-1 py-0 text-[10px] leading-none text-amber-700 dark:text-amber-400">缺章节</Badge>
                          : row.question.chapterTags.map((t) => (
                            <Badge key={t} variant="outline" className="px-1 py-0 text-[10px] leading-none">{t}</Badge>
                          ))}
                        {row.question.keyPoints.length === 0 && (
                          <Badge variant="outline" className="border-amber-600/40 px-1 py-0 text-[10px] leading-none text-amber-700 dark:text-amber-400">缺知识点</Badge>
                        )}
                        {row.question.seqNumber !== null && (
                          <span className="text-[10px] text-muted-foreground">#{row.question.seqNumber}</span>
                        )}
                        <Link
                          to={`/admin/questions/${row.question.id}/edit`}
                          className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />看原题
                        </Link>
                      </div>
                      <p className="mt-1 text-xs leading-snug" title={row.question.questionText}>{stem(row.question.questionText)}</p>
                    </TableCell>

                    <TableCell className="align-top">
                      {row.state === 'pending' || row.state === 'running' ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {row.state === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {row.state === 'running' ? '检索中...' : '排队中'}
                        </span>
                      ) : row.state === 'error' ? (
                        <span className="text-[11px] text-destructive">{row.error}</span>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[11px] leading-snug">
                            {key === null
                              ? <span className="text-muted-foreground">没有命中任何一节</span>
                              : pathLabel(nodeByKey.get(key)?.chain.map((c) => c.title) ?? [])}
                          </p>
                          <Select
                            value={key === null ? 'none' : String(key)}
                            onValueChange={(v) => patchRow(index, { chapterKey: v === 'none' ? null : Number(v) })}
                            disabled={row.state === 'applied'}
                          >
                            <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不归类</SelectItem>
                              {chapterOptions.some((o) => o.key === key) || key === null ? null : (
                                <SelectItem value={String(key)}>{pathLabel(nodeByKey.get(key)?.chain.map((c) => c.title) ?? [])}</SelectItem>
                              )}
                              {chapterOptions.map((o) => (
                                <SelectItem key={o.key} value={String(o.key)}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      {row.state === 'done' || row.state === 'applied' ? (
                        <div className="space-y-1">
                          <Badge variant="outline" className={cn('px-1 py-0 text-[10px] leading-none', TIER_CLASS[tier])}>
                            {CONFIDENCE_TIER_LABEL[tier]}
                          </Badge>
                          <p className="text-[10px] tabular-nums text-muted-foreground">
                            {Math.round(attr.confidence * 100)}% · {attr.best?.hits ?? 0} 条命中
                          </p>
                          {attr.unattributed > 0 && (
                            <p className="text-[10px] text-muted-foreground">{attr.unattributed} 条落在标题之前</p>
                          )}
                        </div>
                      ) : null}
                    </TableCell>

                    <TableCell className="align-top">
                      <ul className="space-y-1">
                        {evidence.main.map((hit) => (
                          <li key={hit.id} className="text-[10px] leading-snug text-muted-foreground">
                            <span className="mr-1 tabular-nums">
                              {docTitle(hit.sourceId)}{hit.pageNo !== null ? ` 第${hit.pageNo}页` : ''}
                            </span>
                            {evidenceSnippet(hit.content, 90)}
                            {hit.anchor && (
                              <Link to={hit.anchor} className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline">
                                <ExternalLink className="h-2.5 w-2.5" />原文
                              </Link>
                            )}
                          </li>
                        ))}
                        {evidence.aside.map((hit) => (
                          <li key={hit.id} className="text-[10px] leading-snug text-muted-foreground/80">
                            <Badge variant="outline" className="mr-1 px-1 py-0 text-[9px] leading-none">佐证</Badge>
                            {evidenceSnippet(hit.content, 70)}
                          </li>
                        ))}
                        {evidence.main.length === 0 && evidence.aside.length === 0 && (
                          <li className="text-[10px] text-muted-foreground">—</li>
                        )}
                      </ul>
                    </TableCell>

                    <TableCell className="align-top">
                      <KeyPointPicker
                        subject={row.question.subject}
                        value={row.keyPoints}
                        onChange={(next) => patchRow(index, { keyPoints: next })}
                        compact
                        disabled={locked}
                      />
                      {row.state === 'done' && row.keyPoints.length === 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          词表里没有对得上的条目 —— 需要就自己挑一个
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      {row.state === 'applied' ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />已写入
                        </span>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={applying || row.state !== 'done'}
                            onClick={() => void apply(index)}
                          >
                            采纳
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-muted-foreground"
                            disabled={row.state !== 'done'}
                            onClick={() => patchRow(index, { state: 'skipped' })}
                          >
                            跳过
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ResourceIngestDialog
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        onDone={(id) => {
          setNotice('材料已录入。解析产物会切块建索引, 完成后就能选它做归类依据。')
          setNodes([])
          setIndexStatus(null)
          setMainDocId(id)
          listResourceDocuments().then(setDocs).catch(() => {})
        }}
      />
    </div>
  )
}
