import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, DatabaseZap, Eraser, ExternalLink,
  Loader2, RefreshCw, Search,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { RAG_SOURCE_LABEL, searchKnowledge, syncRagSource, type RagSource, type RagSearchResult } from '@/lib/rag'
import { clearRagIndex, listRagChunks, ragStats, type RagChunkRow, type RagSourceStat } from '@/lib/rag-admin'

/** 索引里的五个来源, 顺序即展示顺序 */
const RAG_SOURCES: RagSource[] = ['resource', 'question', 'kp', 'subject', 'note']

const PAGE_SIZE = 20

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

/** 同步结果说人话: 关键是让管理员看出"这次到底重算了多少", 而不是又看到一个块数 */
function describeSync(result: { total: number; embedded: number; added: number; updated: number; removed: number }, suffix: string): string {
  if (result.embedded === 0 && result.removed === 0) return `内容无变化, 未重算向量${suffix}(共 ${result.total} 块)`
  const parts: string[] = []
  if (result.added) parts.push(`新增 ${result.added}`)
  if (result.updated) parts.push(`更新 ${result.updated}`)
  if (result.removed) parts.push(`删除 ${result.removed}`)
  parts.push(`重算向量 ${result.embedded}`)
  return `${parts.join(' / ')}${suffix}(共 ${result.total} 块)`
}

export function Component() {
  const [stats, setStats] = useState<RagSourceStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searchSources, setSearchSources] = useState<RagSource[]>([])
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<RagSearchResult | null>(null)

  const [browseSource, setBrowseSource] = useState<RagSource | 'all'>('all')
  const [browseKeyword, setBrowseKeyword] = useState('')
  const [browsePage, setBrowsePage] = useState(0)
  const [chunkNonce, setChunkNonce] = useState(0)
  const [chunks, setChunks] = useState<{ rows: RagChunkRow[]; total: number }>({ rows: [], total: 0 })

  // 初值直接落在状态里, 不在 effect 里同步 setState —— 首屏由下面两个 effect 拉数据
  useEffect(() => {
    let alive = true
    ragStats()
      .then((rows) => { if (alive) { setStats(rows); setError(null) } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  /**
   * 块列表跟着筛选条件走。
   * alive 标志不是多余的: 在关键词框里连打几个字会并发起多次查询, 慢的那次后到就会把
   * 新结果盖掉 —— 表格显示的筛选结果和框里输的不一致。
   */
  useEffect(() => {
    let alive = true
    listRagChunks({
      source: browseSource === 'all' ? null : browseSource,
      keyword: browseKeyword,
      limit: PAGE_SIZE,
      offset: browsePage * PAGE_SIZE,
    })
      .then((r) => { if (alive) setChunks(r) })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [browseSource, browseKeyword, browsePage, chunkNonce])

  /** 命令式刷新(按钮、重建/清空之后): 块列表用 nonce 重新触发上面的 effect */
  const reload = async () => {
    setLoading(true)
    try {
      setStats(await ragStats())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
    setChunkNonce((n) => n + 1)
  }

  const bySource = useMemo(() => new Map(stats.map((s) => [s.source, s])), [stats])
  const totals = useMemo(() => stats.reduce(
    (acc, s) => ({
      chunks: acc.chunks + s.chunks,
      embedded: acc.embedded + s.embedded,
      unembedded: acc.unembedded + s.unembedded,
      contentBytes: acc.contentBytes + s.contentBytes,
    }),
    { chunks: 0, embedded: 0, unembedded: 0, contentBytes: 0 },
  ), [stats])

  /** 不传 source 就是全部来源 */
  const rebuild = async (source?: RagSource) => {
    setBusy(source ?? 'all')
    setNotice(null)
    const keys: RagSource[] = source ? [source] : RAG_SOURCES
    const lines: string[] = []
    try {
      for (const key of keys) {
        const name = RAG_SOURCE_LABEL[key]
        setNotice(`正在同步${name}的索引...\n${lines.join('\n')}`)
        const r = await syncRagSource(key, undefined, {
          onRound: (round) => setNotice(`正在同步${name}的索引... 已重算 ${round.embedded} 个块\n${lines.join('\n')}`),
        })
        lines.push(`${name}: ${describeSync(r, '')}`)
      }
      setNotice(`索引同步完成\n${lines.join('\n')}`)
      await reload()
    } catch (err) {
      setNotice(`建索引失败: ${err instanceof Error ? err.message : String(err)}\n${lines.join('\n')}`)
    } finally {
      setBusy(null)
    }
  }

  const wipe = async (source: RagSource | null) => {
    const name = source ? RAG_SOURCE_LABEL[source] : '全部来源'
    const count = source ? (bySource.get(source)?.chunks ?? 0) : totals.chunks
    if (!window.confirm(
      `清空${name}的检索索引?\n\n`
      + `· 会删掉 ${count} 个索引块(向量一并删除), 小Q 随后搜不到这些内容\n`
      + `· 源内容(题目、文献、笔记、解读)不受影响, 随时能在这一页重建\n`
      + `· 重建要为每块重新算一次向量, 会消耗 embedding 额度`,
    )) return
    setBusy(source ? `clear:${source}` : 'clear:all')
    try {
      const deleted = await clearRagIndex(source)
      setNotice(`已清空${name}的索引: 删除 ${deleted} 个块`)
      setBrowsePage(0)
      await reload()
    } catch (err) {
      setNotice(`清空失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResult(null)
    try {
      setResult(await searchKnowledge(query, {
        sources: searchSources.length > 0 ? searchSources : undefined,
        limit: 20,
      }))
    } catch (err) {
      setNotice(`检索失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSearching(false)
    }
  }

  const toggleSource = (source: RagSource) => {
    setSearchSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]))
  }

  const pages = Math.max(1, Math.ceil(chunks.total / PAGE_SIZE))

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">检索索引 (RAG)</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            把题库、文献、知识点解读、学科解读、公开笔记切成块并算出向量, 供小Q 检索引用。
            这里看索引健康度、试检索、重建或清空 —— 改内容时前端会自动增量同步, 不必手工重建。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void rebuild()}
          >
            {busy === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
            {busy === 'all' ? '重建中...' : '重建全部'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            disabled={busy !== null || totals.chunks === 0}
            onClick={() => void wipe(null)}
          >
            {busy === 'clear:all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
            清空全部
          </Button>
        </div>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '索引块总数', value: totals.chunks.toLocaleString() },
          { label: '已算向量', value: totals.embedded.toLocaleString() },
          { label: '未算向量', value: totals.unembedded.toLocaleString(), warn: totals.unembedded > 0 },
          { label: '正文占用', value: formatBytes(totals.contentBytes) },
        ].map((card) => (
          <div key={card.label} className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', card.warn && 'text-amber-600 dark:text-amber-400')}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {totals.unembedded > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          有 {totals.unembedded} 个块没有向量 —— 多半是上次同步中途失败(例如 embedding 额度欠费)。
          这些块只能被全文那一路搜到, 点对应来源的「重建」补齐即可。
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">来源</TableHead>
              <TableHead className="w-24 text-right">块数</TableHead>
              <TableHead className="w-28 text-right">已向量化</TableHead>
              <TableHead className="w-28 text-right">未向量化</TableHead>
              <TableHead className="w-24 text-right">正文占用</TableHead>
              <TableHead className="w-44">最后向量化</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : (
              RAG_SOURCES.map((source) => {
                const stat = bySource.get(source)
                const rowBusy = busy === source || busy === `clear:${source}`
                return (
                  <TableRow key={source} className={cn(rowBusy && 'opacity-60')}>
                    <TableCell className="text-xs font-medium">{RAG_SOURCE_LABEL[source]}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{stat?.chunks ?? 0}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{stat?.embedded ?? 0}</TableCell>
                    <TableCell className={cn(
                      'text-right text-xs tabular-nums',
                      (stat?.unembedded ?? 0) > 0 && 'font-medium text-amber-600 dark:text-amber-400',
                    )}>
                      {stat?.unembedded ?? 0}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatBytes(stat?.contentBytes ?? 0)}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{formatTime(stat?.lastEmbeddedAt ?? null)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[11px]"
                          disabled={busy !== null}
                          onClick={() => void rebuild(source)}
                        >
                          {busy === source ? <Loader2 className="h-3 w-3 animate-spin" /> : <DatabaseZap className="h-3 w-3" />}
                          重建
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                          disabled={busy !== null || (stat?.chunks ?? 0) === 0}
                          onClick={() => void wipe(source)}
                        >
                          {busy === `clear:${source}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eraser className="h-3 w-3" />}
                          清空
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">检索测试</h2>
          <span className="text-[11px] text-muted-foreground">走的正是小Q 那条链路(向量 + 全文, 服务端 RRF 融合)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }}
            placeholder="输入一个问题, 例如: 死锁产生的必要条件是什么"
            className="h-8 max-w-md text-xs"
          />
          <Button size="sm" className="gap-1.5" disabled={searching || !query.trim()} onClick={() => void runSearch()}>
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            检索
          </Button>
          {RAG_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => toggleSource(source)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                searchSources.includes(source)
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {RAG_SOURCE_LABEL[source]}
            </button>
          ))}
          {searchSources.length === 0 && <span className="text-[10px] text-muted-foreground">不选 = 全部来源</span>}
        </div>

        {result && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <Badge variant={result.mode === 'hybrid' ? 'secondary' : 'destructive'} className="px-1.5 py-0 text-[10px] leading-none">
                {result.mode === 'hybrid' ? '向量 + 全文' : '仅全文'}
              </Badge>
              <span className="text-muted-foreground">命中 {result.hits.length} 块</span>
              {result.error && <span className="text-destructive">向量服务不可用: {result.error}</span>}
            </div>
            {result.hits.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">没有命中 —— 换种问法, 或先重建对应来源的索引。</p>
            ) : (
              <ol className="space-y-1.5">
                {result.hits.map((hit, i) => (
                  <li key={hit.id} className="rounded border bg-muted/30 p-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="tabular-nums text-muted-foreground">#{i + 1}</span>
                      <Badge variant="outline" className="px-1 py-0 text-[10px] leading-none">
                        {RAG_SOURCE_LABEL[hit.source] ?? hit.source}
                      </Badge>
                      <span className="font-medium">{hit.label || '—'}</span>
                      {hit.subLabel && <span className="text-muted-foreground">· {hit.subLabel}</span>}
                      {hit.pageNo !== null && <span className="text-muted-foreground">· 第 {hit.pageNo} 页</span>}
                      {hit.anchor && (
                        <Link to={hit.anchor} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />跳转原文
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">{hit.content}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">索引块</h2>
          <span className="text-[11px] text-muted-foreground">共 {chunks.total.toLocaleString()} 块</span>
          <span className="flex-1" />
          <Select value={browseSource} onValueChange={(v) => { setBrowseSource(v as RagSource | 'all'); setBrowsePage(0) }}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              {RAG_SOURCES.map((source) => (
                <SelectItem key={source} value={source}>{RAG_SOURCE_LABEL[source]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={browseKeyword}
            onChange={(e) => { setBrowseKeyword(e.target.value); setBrowsePage(0) }}
            placeholder="按内容筛选"
            className="h-7 w-48 text-xs"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">来源</TableHead>
                <TableHead>标题 / 位置</TableHead>
                <TableHead className="w-24">向量</TableHead>
                <TableHead className="w-32">写入时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chunks.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                    {totals.chunks === 0 ? '索引是空的 —— 点右上角「重建全部」建一次' : '没有匹配的块'}
                  </TableCell>
                </TableRow>
              ) : (
                chunks.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-[11px]">{RAG_SOURCE_LABEL[row.source] ?? row.source}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium" title={row.label}>{row.label || '—'}</span>
                        {row.subLabel && (
                          <span className="truncate text-[10px] text-muted-foreground" title={row.subLabel}>· {row.subLabel}</span>
                        )}
                        {row.anchor && (
                          <Link to={row.anchor} className="ml-auto shrink-0 text-[10px] text-primary hover:underline">原文</Link>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{row.content}</p>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        row.embedded
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                      )}>
                        {row.embedded ? '已算' : '缺失'}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 text-[11px]">
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={browsePage === 0}
              onClick={() => setBrowsePage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="tabular-nums text-muted-foreground">{browsePage + 1} / {pages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={browsePage + 1 >= pages}
              onClick={() => setBrowsePage((p) => Math.min(pages - 1, p + 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
