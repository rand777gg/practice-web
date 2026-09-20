import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, Database, Eye, FileText, Loader2, MoreHorizontal, Pencil,
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

  const load = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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

  const retry = async (doc: ResourceDocument, mode: ParseMode) => {
    setBusyId(doc.id)
    setNotice(null)
    try {
      await reparseResource(doc.id, { mode })
      setNotice(`《${doc.title}》重新解析完成`)
      await load()
    } catch (err) {
      setNotice(`重新解析失败: ${err instanceof Error ? err.message : String(err)}`)
      await load()
    } finally {
      setBusyId(null)
    }
  }

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
