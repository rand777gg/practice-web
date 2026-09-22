import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Settings2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { ResourceReader } from '@/components/resource/ResourceReader'
import { SeparatedList } from '@/components/ui/separated-list'
import {
  documentMarkdownFromParts, documentPagesFromParts, getResourceDocument,
  listResourceParts, loadDocumentToc, loadResourceBlocks,
  type ResourceDocumentDetail, type ResourcePart,
} from '@/lib/resource-library'
import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'

export function Component() {
  const { documentId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')

  const [doc, setDoc] = useState<ResourceDocumentDetail | null>(null)
  const [parts, setParts] = useState<ResourcePart[]>([])
  const [blocks, setBlocks] = useState<ResourceBlock[]>([])
  const [toc, setToc] = useState<TocEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockParam = searchParams.get('block')
  const initialBlockIndex = useMemo(() => {
    if (blockParam === null) return null
    const n = Number(blockParam)
    return Number.isInteger(n) && n >= 0 ? n : null
  }, [blockParam])
  const initialQuery = searchParams.get('q') ?? ''
  const initialTocEdit = searchParams.get('toc') === 'edit'

  /** 目录存过之后重拉一次: 不然退出编辑态会看到挂载时那份旧的 */
  const reloadToc = useCallback(async () => {
    if (!documentId) return
    setToc(await loadDocumentToc(documentId).catch(() => null))
  }, [documentId])

  const load = useCallback(async () => {
    if (!documentId) return
    setLoading(true)
    try {
      const found = await getResourceDocument(documentId)
      if (!found) {
        setError('文献不存在或未发布')
        setDoc(null)
        return
      }
      setDoc(found)
      if (found.parse_status === 'ready') {
        const [loadedParts, loadedBlocks, loadedToc] = await Promise.all([
          listResourceParts(found.id),
          loadResourceBlocks(found.id),
          loadDocumentToc(found.id),
        ])
        setParts(loadedParts)
        setBlocks(loadedBlocks)
        setToc(loadedToc)
      } else {
        setParts([])
        setBlocks([])
        setToc(null)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { void load() }, [load])

  // 页图和正文都按卷拼起来; 页码本来就是原文页码, 所以拼完就是连续的全篇
  const pages = useMemo(() => documentPagesFromParts(parts), [parts])
  const markdown = useMemo(() => documentMarkdownFromParts(parts, doc?.markdown ?? ''), [parts, doc])

  return (
    <div className="flex h-[calc(100vh-10.5rem)] min-h-[420px] min-w-0 flex-col xl:h-[calc(100vh-6.5rem)]">
      {/*
        头部压成一行。
        原来是"标题 / 作者·来源 / 标签"三行, 中间那列高 52px, 加上 py-2 整条 69px ——
        860 高的窗口里顶部一共吃掉 180px, 正文只剩 649px, 窗口一矮就明显不够读。
        现在作者·来源跟在标题后面(窄屏隐掉), 标签只在 xl 上显示前三个, 整条回到 36px。
      */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <Button variant="ghost" size="sm" className="h-6 shrink-0 gap-1 px-1.5 text-[11px]" asChild>
          <Link to="/resource-library">
            <ArrowLeft className="h-3 w-3" />资料库
          </Link>
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h1 className="truncate text-sm font-semibold">{doc?.title ?? (loading ? '加载中...' : '—')}</h1>
          {doc && <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[9px] leading-none">{doc.doc_type}</Badge>}
          {doc?.subject && (
            <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px] leading-none">{doc.subject}</Badge>
          )}
          {doc?.pub_year && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{doc.pub_year}</span>
          )}
          {/* 窄屏把作者/来源与标签隐掉: 它们挤掉的是标题, 而这几项在资料库列表页也看得到 */}
          <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground md:inline">
            {doc ? <SeparatedList items={[doc.authors, doc.source]} fallback="" /> : ''}
          </span>
          {doc && doc.tags.length > 0 && (
            <span className="hidden shrink-0 items-center gap-1 xl:flex">
              {doc.tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="px-1 py-0 text-[9px] leading-none">{t}</Badge>
              ))}
              {doc.tags.length > 3 && (
                <span className="text-[9px] text-muted-foreground">+{doc.tags.length - 3}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {doc?.pdf_url && (
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" asChild>
              <a href={doc.pdf_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />原件
              </a>
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" asChild>
              <Link to="/admin/resource-library">
                <Settings2 className="h-3 w-3" />管理
              </Link>
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/resource-library">返回资料库</Link>
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : doc && doc.parse_status !== 'ready' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <AlertCircle className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium">这篇文献还不能阅读</p>
          <p className="max-w-md text-xs text-muted-foreground">
            {doc.parse_status === 'failed'
              ? `解析失败: ${doc.parse_error ?? '未知原因'}`
              : '解析尚未完成, 稍后再试'}
          </p>
          {isAdmin && (
            <Button variant="outline" size="sm" className="mt-1" asChild>
              <Link to="/admin/resource-library">去管理页重新解析</Link>
            </Button>
          )}
        </div>
      ) : doc && blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <AlertCircle className="h-6 w-6 text-amber-500" />
          <p className="text-xs text-muted-foreground">这篇文献没有正文区块, 目录与定位不可用</p>
          {isAdmin && (
            <Button variant="outline" size="sm" className="mt-1" asChild>
              <Link to="/admin/resource-library">去管理页重新解析</Link>
            </Button>
          )}
        </div>
      ) : doc ? (
        <div className="min-h-0 flex-1">
          <ResourceReader
            key={`${doc.id}:${initialBlockIndex ?? ''}:${initialQuery}`}
            documentId={doc.id}
            blocks={blocks}
            pages={pages}
            markdown={markdown}
            pdfUrl={doc.pdf_url || null}
            pdfTotalPages={doc.pdf_total_pages}
            parts={parts}
            toc={toc}
            canEditToc={isAdmin}
            initialTocEdit={initialTocEdit}
            onTocSaved={() => void reloadToc()}
            initialBlockIndex={initialBlockIndex}
            initialQuery={initialQuery}
          />
        </div>
      ) : null}
    </div>
  )
}
