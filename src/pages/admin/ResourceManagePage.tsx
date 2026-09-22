import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, Database, Eye, FileText, ListTree, Loader2, MoreHorizontal, Pencil,
  RefreshCw, Trash2, Upload,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  deleteResourceDocument, listResourceDocuments, listResourceParts, reparseResource,
  updateResourceDocument,
  type ParseMode, type ResourceDocument, type ResourcePart,
} from '@/lib/resource-library'
import { syncRagSource, autoIndex, type RagSource, type RagSyncResult } from '@/lib/rag'
import { ResourceIngestDialog } from '@/components/resource/ResourceIngestDialog'
import { ResourceMetaDialog } from '@/components/resource/ResourceMetaDialog'
import { SeparatedList } from '@/components/ui/separated-list'

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待解析', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  parsing: { label: '解析中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ready: { label: '就绪', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  failed: { label: '解析失败', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

type StatusFilter = 'all' | 'ready' | 'failed' | 'parsing' | 'pending'

/**
 * 停在「解析中」多久算可疑。
 *
 * 解析由发起它的那个标签页驱动, 关掉页面就断在半路, 库里永远停在 parsing ——
 * 但服务端分不清"这个还在慢慢跑"和"发起它的人跑了": 一整卷 199 页跑十几分钟是正常的,
 * 期间几乎不写库。所以阈值给得宽松, 措辞也是"可能", 只用来提示去重跑, 不当作结论。
 */
const STALE_PARSE_MS = 25 * 60 * 1000

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} 分 ${String(s % 60).padStart(2, '0')} 秒` : `${s} 秒`
}

/** 索引同步结果说人话: 关键是让管理员看出"这次到底重算了多少", 而不是又看到一个块数 */
function describeSync(r: RagSyncResult, suffix: string): string {
  if (r.embedded === 0 && r.removed === 0) return `内容无变化, 未重算向量${suffix}(共 ${r.total} 块)`
  const parts: string[] = []
  if (r.added) parts.push(`新增 ${r.added}`)
  if (r.updated) parts.push(`更新 ${r.updated}`)
  if (r.removed) parts.push(`删除 ${r.removed}`)
  parts.push(`重算向量 ${r.embedded}`)
  return `${parts.join(' / ')}${suffix}(共 ${r.total} 块)`
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ready', label: '就绪' },
  { key: 'failed', label: '失败' },
  { key: 'parsing', label: '解析中' },
  { key: 'pending', label: '待解析' },
]

export function Component() {
  const [docs, setDocs] = useState<ResourceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [ingestOpen, setIngestOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceDocument | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [partsByDoc, setPartsByDoc] = useState<Map<string, ResourcePart[]>>(new Map())
  const [indexing, setIndexing] = useState(false)
  /**
   * 正在跑的那次解析的实时进度。
   *
   * 解析是**这个标签页**在驱动(pdfjs 渲染页图 + 轮询 MinerU), 所以进度只有这里有;
   * 不显式接出来, 一次 400 页三卷的解析就是十几分钟一个转圈, 管理员只能干等 —— 既看不出
   * 是活着还是卡住了, 也不知道关掉页面会怎样。
   */
  const [job, setJob] = useState<{ docId: string; title: string; mode: ParseMode; step: string; done: number; total: number; startedAt: number } | null>(null)
  // 每秒重渲染一次, 让"已经跑了多久"是活的 —— 秒数不走, 人就以为死了
  const [tick, setTick] = useState(0)

  /**
   * silent 用于后台轮询: 定时刷新不能走 loading 分支 —— 那个分支会把整张表换成一行转圈,
   * 结果就是解析期间表格每 4 秒闪一次白, 连带着行上的按钮都点不着。
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [list, parts] = await Promise.all([listResourceDocuments(), listResourceParts()])
      setDocs(list)
      const grouped = new Map<string, ResourcePart[]>()
      for (const p of parts) {
        const arr = grouped.get(p.document_id)
        if (arr) arr.push(p)
        else grouped.set(p.document_id, [p])
      }
      setPartsByDoc(grouped)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return docs.filter((d) => {
      if (statusFilter !== 'all' && d.parse_status !== statusFilter) return false
      if (!kw) return true
      return [d.title, d.authors, d.source, d.subject, d.doc_type, d.tags.join(' ')]
        .join(' ').toLowerCase().includes(kw)
    })
  }, [docs, keyword, statusFilter])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: docs.length }
    for (const d of docs) map[d.parse_status] = (map[d.parse_status] ?? 0) + 1
    return map
  }, [docs])

  const retry = async (doc: ResourceDocument, mode: ParseMode, force = false) => {
    if (force && !window.confirm(
      `强制重新解析《${doc.title}》?\n\n`
      + `· 已解析成功的卷也会重新提交 MinerU 任务, 会再消耗一次额度\n`
      + `· 这本书现有的区块会先清空、按新结果重建; 中途失败要再跑一次才能补齐\n`
      + `· 解析在这个标签页里跑, 过程中不要关闭或刷新它\n\n`
      + `只是想补齐失败的那一卷, 用普通的「重新解析」即可。`,
    )) return
    setBusyId(doc.id)
    setNotice(null)
    setJob({
      docId: doc.id, title: doc.title, mode,
      step: '正在准备...', done: 0, total: 0, startedAt: Date.now(),
    })
    try {
      await reparseResource(doc.id, {
        mode,
        force,
        // 把解析器内部的 step/done/total 接出来 —— 这是唯一能证明"还活着"的信号
        producer: (p) => setJob((prev) => (prev && prev.docId === doc.id
          ? { ...prev, step: p.step, done: p.done ?? 0, total: p.total ?? 0 }
          : prev)),
      })
      setNotice(`《${doc.title}》重新解析完成`)
    } catch (err) {
      setNotice(`重新解析失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusyId(null)
      setJob(null)
      await load()
    }
  }

  /**
   * 只要有文献处于「解析中」就每 4 秒重拉一次分卷状态。
   *
   * 不能只在"本页发起的解析"期间轮询: 解析常常是另一个标签页(或刷新之前的那次)在跑,
   * 而一卷跑完就落库、页面不重拉就一直显示"…" —— 明明在推进, 看起来却像卡死。
   * 这是最让人以为"它不动了"的地方, 所以把条件放宽到"库里有东西在解析"。
   */
  const anyParsing = useMemo(() => docs.some((d) => d.parse_status === 'parsing'), [docs])

  useEffect(() => {
    if (!busyId && !anyParsing) return
    const timer = setInterval(() => { void load(true) }, 4000)
    return () => clearInterval(timer)
  }, [busyId, anyParsing, load])

  useEffect(() => {
    if (!job) return
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [job])

  void tick

  /**
   * 建检索索引。索引带时间预算, 单次调用可能跑不完(一本 295 页的书近千个块),
   * 所以这里循环调直到 done —— 否则管理员会以为"点一次就好了", 结果索引只建了一半。
   */
  const buildIndex = async (source: RagSource, id?: string, label?: string) => {
    setIndexing(true)
    setNotice(null)
    const suffix = label ? `: ${label}` : ''
    try {
      const r = await syncRagSource(source, id, {
        onRound: (round) => setNotice(`正在同步索引${suffix}... 已重算 ${round.embedded} 个块`),
      })
      setNotice(describeSync(r, suffix))
    } catch (err) {
      setNotice(`建索引失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIndexing(false)
    }
  }

  const rebuildAll = async () => {
    if (!window.confirm('重建全部检索索引(文献 + 题库 + 知识点解读 + 学科解读 + 公开笔记)?\n服务端按内容差分, 只有变过的内容才会重新算向量。')) return
    setIndexing(true)
    setNotice(null)
    const lines: string[] = []
    try {
      for (const [src, name] of [
        ['resource', '文献'], ['question', '题库'], ['kp', '知识点解读'],
        ['subject', '学科解读'], ['note', '公开笔记'],
      ] as [RagSource, string][]) {
        setNotice(`正在同步 ${name}...\n${lines.join('\n')}`)
        const r = await syncRagSource(src)
        lines.push(`${name}: ${describeSync(r, '')}`)
      }
      setNotice(`索引重建完成\n${lines.join('\n')}`)
    } catch (err) {
      setNotice(`建索引失败: ${err instanceof Error ? err.message : String(err)}\n${lines.join('\n')}`)
    } finally {
      setIndexing(false)
    }
  }

  const togglePublish = async (doc: ResourceDocument) => {
    setBusyId(doc.id)
    try {
      await updateResourceDocument(doc.id, { is_published: !doc.is_published })
      // 发布 → 正文进索引; 下架 → 已有区块被当孤儿清掉(否则下架了还搜得到)
      autoIndex('resource', doc.id)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (doc: ResourceDocument) => {
    if (!window.confirm(`确认删除《${doc.title}》? 正文区块和 R2 上的 PDF / 页图都会一并删掉。`)) return
    setBusyId(doc.id)
    try {
      await deleteResourceDocument(doc.id)
      setNotice(`已删除《${doc.title}》`)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">资料库管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            录入原始文献, 用 MinerU 解析成带页码与坐标的区块。前台按目录、PDF 与正文双向定位来读。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />刷新
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={indexing} onClick={() => void rebuildAll()}>
            {indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            {indexing ? '建索引中...' : '重建检索索引'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setIngestOpen(true)}>
            <Upload className="h-3.5 w-3.5" />录入原始文献
          </Button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {job && (
        <div className="space-y-1.5 rounded-md border border-blue-200 bg-blue-50/60 p-2.5 dark:border-blue-900/60 dark:bg-blue-900/15">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="font-medium">《{job.title}》正在解析{job.mode === 'lightweight' ? '(轻量)' : '(精准)'}</span>
            <span className="tabular-nums text-muted-foreground">已跑 {formatElapsed(Date.now() - job.startedAt)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{job.step}</span>
            {job.total > 0 && (
              <span className="shrink-0 tabular-nums text-muted-foreground">{job.done}/{job.total}</span>
            )}
          </div>

          {job.total > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200/70 dark:bg-blue-900/50">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500 dark:bg-blue-400"
                style={{ width: `${Math.min(100, Math.round((job.done / job.total) * 100))}%` }}
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            解析是在这个页面里跑的: <b className="font-medium text-foreground">期间别关标签页、别刷新、别离开这一页</b>,
            否则这次解析会断在半路, 状态会一直停在「解析中」。分卷进度见下表的页码块。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              statusFilter === f.key ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {f.label}
            <span className="ml-1 tabular-nums opacity-60">{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按标题 / 作者 / 标签过滤"
          className="h-7 w-56 text-xs"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文献</TableHead>
              <TableHead className="w-40">类型 / 学科</TableHead>
              <TableHead className="w-56">标签</TableHead>
              <TableHead className="w-20 text-right">页数</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-24">发布</TableHead>
              <TableHead className="w-28">录入时间</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-xs text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-xs text-muted-foreground">
                  {docs.length === 0 ? '还没有录入任何文献' : '没有匹配的文献'}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((doc) => {
                const status = STATUS_META[doc.parse_status] ?? STATUS_META.pending
                const busy = busyId === doc.id
                // 本页正在跑的那次不算可疑; 其余的"解析中"久了多半是发起它的标签页关了
                const stale = !busy && doc.parse_status === 'parsing'
                  && Date.now() - new Date(doc.updated_at).getTime() > STALE_PARSE_MS
                return (
                  <TableRow key={doc.id} className={cn(busy && 'opacity-60')}>
                    <TableCell className="max-w-0">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <Link
                          to={`/resource-library/${doc.id}`}
                          className="truncate text-xs font-medium hover:underline"
                          title={doc.title}
                        >
                          {doc.title}
                        </Link>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">
                        <SeparatedList items={[doc.authors, doc.source, doc.pub_year]} fallback="—" />
                      </p>
                      {doc.parse_status === 'failed' && doc.parse_error && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-destructive">{doc.parse_error}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px]">{doc.doc_type}</span>
                      {doc.subject && <span className="text-[11px] text-muted-foreground"> / {doc.subject}</span>}
                    </TableCell>
                    <TableCell>
                      {doc.tags.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="px-1 py-0 text-[9px] leading-none">{t}</Badge>
                          ))}
                          {doc.tags.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">+{doc.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-[11px] tabular-nums">
                      {doc.pdf_total_pages ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', status.className)}>
                        {status.label}
                      </span>
                      {stale && (
                        <div
                          className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          title={`最后一次进展是 ${new Date(doc.updated_at).toLocaleString()}, 已经超过 ${STALE_PARSE_MS / 60000} 分钟。解析是在浏览器里跑的, 当时关掉页面就会断在这里。`}
                        >
                          <AlertCircle className="h-2.5 w-2.5" />可能已中断
                        </div>
                      )}
                      {(partsByDoc.get(doc.id)?.length ?? 0) > 1 && (
                        <div className="mt-1 flex flex-wrap gap-0.5">
                          {partsByDoc.get(doc.id)!.map((p) => (
                            <span
                              key={p.id}
                              title={`第 ${p.page_from}-${p.page_to} 页 · ${STATUS_META[p.parse_status]?.label ?? p.parse_status}${p.parse_error ? `\n${p.parse_error}` : ''}`}
                              className={cn(
                                'rounded px-1 text-[9px] leading-tight',
                                p.parse_status === 'ready'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : p.parse_status === 'failed'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {p.page_from}-{p.page_to} {p.parse_status === 'ready' ? '✓' : p.parse_status === 'failed' ? '✗' : '…'}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void togglePublish(doc)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                          doc.is_published
                            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-muted text-muted-foreground hover:bg-accent',
                        )}
                        title={doc.is_published ? '点击下架' : '点击发布'}
                      >
                        {doc.is_published ? '已发布' : '已下架'}
                      </button>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link to={`/resource-library/${doc.id}`} className="gap-2 text-xs">
                              <Eye className="h-3.5 w-3.5" />查看阅读
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-xs" onSelect={() => setEditing(doc)}>
                            <Pencil className="h-3.5 w-3.5" />编辑信息
                          </DropdownMenuItem>
                          {doc.parse_status === 'ready' && (
                            <DropdownMenuItem asChild>
                              <Link to={`/resource-library/${doc.id}?toc=edit`} className="gap-2 text-xs">
                                <ListTree className="h-3.5 w-3.5" />编辑目录
                                {doc.toc_source === 'manual' && (
                                  <Badge variant="secondary" className="ml-auto px-1 py-0 text-[9px] leading-none">
                                    手工
                                  </Badge>
                                )}
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="gap-2 text-xs"
                            disabled={indexing}
                            onSelect={() => void buildIndex('resource', doc.id, doc.title)}
                          >
                            <Database className="h-3.5 w-3.5" />建立检索索引
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-xs" onSelect={() => void retry(doc, 'precision')}>
                            <RefreshCw className="h-3.5 w-3.5" />重新解析 (精准)
                          </DropdownMenuItem>
                          {/* 普通「重新解析」是重试语义, 会跳过已成功的卷 —— 已解析好的书要用这一条才会真重跑 */}
                          <DropdownMenuItem className="gap-2 text-xs" onSelect={() => void retry(doc, 'precision', true)}>
                            <RefreshCw className="h-3.5 w-3.5" />强制重新解析 (精准)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-xs" onSelect={() => void retry(doc, 'lightweight')}>
                            <RefreshCw className="h-3.5 w-3.5" />重新解析 (轻量)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-xs text-destructive focus:text-destructive"
                            onSelect={() => void remove(doc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        解析失败时用行尾菜单里的「重新解析」即可, 不必重新上传 PDF。
        已经解析成功的书要用「强制重新解析」才会真的重跑 —— 普通那个只补失败或缺页图的卷。
      </p>

      <ResourceIngestDialog
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        onDone={() => {
          setNotice('解析完成, 已录入资料库')
          void load()
        }}
      />

      {editing && (
        <ResourceMetaDialog
          key={editing.id}
          document={editing}
          onOpenChange={(next) => { if (!next) setEditing(null) }}
          onSaved={() => { setNotice('文献信息已更新'); void load() }}
        />
      )}
    </div>
  )
}
