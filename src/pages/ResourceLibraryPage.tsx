import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, BookOpen, FileText, Layers, Loader2, Search, Settings2, X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { listResourceDocuments, type ResourceDocument } from '@/lib/resource-library'
import { searchBlocks, searchDocuments, type BlockHit, type DocumentHit } from '@/lib/resource-search'
import { HighlightText } from '@/components/resource/HighlightText'
import { SeparatedList } from '@/components/ui/separated-list'
import { Separator } from '@/components/ui/separator'

const ALL = '__all__'

type SearchMode = 'documents' | 'content'

const NO_BLOCKS: BlockHit[] = []

interface HitState {
  /** 这组结果对应的检索条件; 条件变了结果就作废 */
  key: string
  docHits: DocumentHit[]
  blockHits: BlockHit[]
  error: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待解析',
  parsing: '解析中',
  ready: '可读',
  failed: '解析失败',
}

export function Component() {
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')

  const [docs, setDocs] = useState<ResourceDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [mode, setMode] = useState<SearchMode>('documents')
  const [subject, setSubject] = useState(ALL)
  const [docType, setDocType] = useState(ALL)
  const [tag, setTag] = useState(ALL)

  const [hitState, setHitState] = useState<HitState>({ key: '', docHits: [], blockHits: [], error: null })
  const [searching, setSearching] = useState(false)

  const q = keyword.trim()
  const scopeKey = `${mode}|${subject}|${docType}|${tag}|${q}`
  // 命中结果连同"它属于哪组条件"一起存: 条件一变旧结果自动失效, 省掉一个专门清空状态的 effect
  const current = hitState.key === scopeKey ? hitState : null
  const docHits = current ? current.docHits : null
  const blockHits = current ? current.blockHits : NO_BLOCKS
  const searchError = current ? current.error : null

  const load = useCallback(async () => {
    setLoadingDocs(true)
    try {
      setDocs(await listResourceDocuments())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const options = useMemo(() => {
    const subjects = new Set<string>()
    const types = new Set<string>()
    const tags = new Set<string>()
    for (const d of docs) {
      if (d.subject) subjects.add(d.subject)
      if (d.doc_type) types.add(d.doc_type)
      for (const t of d.tags) tags.add(t)
    }
    return {
      subjects: [...subjects].sort(),
      types: [...types].sort(),
      tags: [...tags].sort(),
    }
  }, [docs])

  const hasFilters = subject !== ALL || docType !== ALL || tag !== ALL

  // 关键词检索走服务端 RPC(pg_trgm); 空关键词就直接用已加载的列表, 省一次往返
  useEffect(() => {
    if (!q) return
    const scope = {
      subject: subject === ALL ? null : subject,
      docType: docType === ALL ? null : docType,
      tag: tag === ALL ? null : tag,
    }
    const key = `${mode}|${subject}|${docType}|${tag}|${q}`
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setSearching(true)
      const run = mode === 'documents'
        ? searchDocuments(q, { ...scope, limit: 50 })
        : searchBlocks(q, { ...scope, limit: 80 })
      run
        .then((result) => {
          if (cancelled) return
          setHitState(mode === 'documents'
            ? { key, docHits: result as DocumentHit[], blockHits: [], error: null }
            : { key, docHits: [], blockHits: result as BlockHit[], error: null })
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setHitState({
            key, docHits: [], blockHits: [],
            error: err instanceof Error ? err.message : String(err),
          })
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [q, mode, subject, docType, tag])

  const browsing = useMemo(() => {
    return docs.filter((d) => {
      if (subject !== ALL && d.subject !== subject) return false
      if (docType !== ALL && d.doc_type !== docType) return false
      if (tag !== ALL && !d.tags.includes(tag)) return false
      return true
    })
  }, [docs, subject, docType, tag])

  const blockHitDocs = useMemo(() => {
    const map = new Map<string, { title: string; hits: BlockHit[] }>()
    for (const h of blockHits) {
      const entry = map.get(h.documentId)
      if (entry) entry.hits.push(h)
      else map.set(h.documentId, { title: h.docTitle, hits: [h] })
    }
    return [...map.entries()]
  }, [blockHits])

  const showResults = keyword.trim().length > 0

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">资料库</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            原始文献已按段落切好并挂了页码与坐标: 可以看目录、在 PDF 与正文之间双向定位, 也能按知识点直接搜到那一段。
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/admin/resource-library">
              <Settings2 className="h-3.5 w-3.5" />资料库管理
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2 rounded-md border p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={mode === 'documents' ? '搜标题 / 作者 / 标签 / 摘要' : '搜正文知识点, 如「死锁」, 直接定位到那一段'}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="清空"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center rounded-md border">
            <button
              type="button"
              onClick={() => setMode('documents')}
              className={cn(
                'flex h-8 items-center gap-1 px-2 text-[11px]',
                mode === 'documents' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              <FileText className="h-3.5 w-3.5" />按文献
            </button>
            <button
              type="button"
              onClick={() => setMode('content')}
              className={cn(
                'flex h-8 items-center gap-1 px-2 text-[11px]',
                mode === 'content' ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              <Layers className="h-3.5 w-3.5" />按正文
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="学科" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部学科</SelectItem>
              {options.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部类型</SelectItem>
              {options.types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="标签" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部标签</SelectItem>
              {options.tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => { setSubject(ALL); setDocType(ALL); setTag(ALL) }}
            >
              <X className="h-3 w-3" />清除筛选
            </Button>
          )}
          <span className="flex-1" />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {showResults && !searching && (
            <span className="text-[10px] text-muted-foreground">
              {mode === 'documents'
                ? `${docHits?.length ?? 0} 篇文献`
                : <>{blockHits.length} 处命中<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{blockHitDocs.length} 篇文献</>}
            </span>
          )}
        </div>
      </div>

      {(loadError || searchError) && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{loadError ?? searchError}</span>
        </div>
      )}

      {loadingDocs && docs.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !showResults ? (
        browsing.length === 0 ? (
          <EmptyState hasAny={docs.length > 0} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {browsing.map((doc) => (
              <Link
                key={doc.id}
                to={`/resource-library/${doc.id}`}
                className="flex flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <div className="flex items-start gap-1.5">
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{doc.title}</span>
                </div>
                <p className="line-clamp-1 text-[11px] text-muted-foreground">
                  <SeparatedList items={[doc.authors, doc.source, doc.pub_year]} fallback="未填写作者与来源" />
                </p>
                {doc.abstract && (
                  <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/80">{doc.abstract}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-none">{doc.doc_type}</Badge>
                  {doc.subject && (
                    <Badge variant="outline" className="px-1 py-0 text-[9px] leading-none">{doc.subject}</Badge>
                  )}
                  {doc.tags.slice(0, 2).map((t) => (
                    <Badge key={t} variant="outline" className="px-1 py-0 text-[9px] leading-none text-muted-foreground">
                      {t}
                    </Badge>
                  ))}
                  {doc.tags.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">+{doc.tags.length - 2}</span>
                  )}
                  {doc.parse_status !== 'ready' && (
                    <Badge variant="secondary" className="bg-amber-100 px-1 py-0 text-[9px] leading-none text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {STATUS_LABEL[doc.parse_status] ?? doc.parse_status}
                    </Badge>
                  )}
                  <span className="flex-1" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {doc.pdf_total_pages ? `${doc.pdf_total_pages} 页` : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : mode === 'documents' ? (
        (docHits?.length ?? 0) === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">没有命中的文献</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docHits!.map((hit) => (
              <Link
                key={hit.id}
                to={`/resource-library/${hit.id}${keyword.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : ''}`}
                className="flex flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  <HighlightText text={hit.title} query={keyword} />
                </span>
                <p className="line-clamp-1 text-[11px] text-muted-foreground">
                  <HighlightText
                    text={[hit.authors, hit.source, hit.pubYear].filter(Boolean).join(' · ') || '未填写作者与来源'}
                    query={keyword}
                  />
                </p>
                {hit.snippet && (
                  <p className="line-clamp-3 text-[11px] leading-snug text-muted-foreground/80">
                    <HighlightText text={hit.snippet} query={keyword} />
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-none">{hit.docType}</Badge>
                  {hit.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="px-1 py-0 text-[9px] leading-none">
                      <HighlightText text={t} query={keyword} />
                    </Badge>
                  ))}
                  <span className="flex-1" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {hit.pdfTotalPages ? `${hit.pdfTotalPages} 页` : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : blockHits.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">正文里没有命中的段落</p>
      ) : (
        <div className="space-y-4">
          {blockHitDocs.map(([docId, group]) => (
            <div key={docId} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Link
                  to={`/resource-library/${docId}`}
                  className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
                >
                  {group.title}
                </Link>
                <span className="shrink-0 text-[10px] text-muted-foreground">{group.hits.length} 处</span>
              </div>
              <div className="divide-y">
                {group.hits.map((hit) => (
                  <Link
                    key={`${hit.documentId}-${hit.blockIndex}`}
                    to={`/resource-library/${docId}?block=${hit.blockIndex}&q=${encodeURIComponent(keyword.trim())}`}
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">
                      P{hit.pageNo}
                    </span>
                    {hit.headingLevel > 0 && (
                      <span className="mt-0.5 shrink-0 rounded bg-blue-100 px-1 text-[9px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        标题
                      </span>
                    )}
                    <p className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug">
                      <HighlightText text={hit.snippet} query={keyword} />
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16">
      <BookOpen className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">
        {hasAny ? '当前筛选下没有文献' : '资料库还没有内容'}
      </p>
      {isAdmin && !hasAny && (
        <Button variant="outline" size="sm" className="mt-1 gap-1.5" asChild>
          <Link to="/admin/resource-library">
            <Settings2 className="h-3.5 w-3.5" />去录入原始文献
          </Link>
        </Button>
      )}
    </div>
  )
}
