import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Settings2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { ResourceReader } from '@/components/resource/ResourceReader'
import {
  documentMarkdownFromParts, documentPagesFromParts, getResourceDocument,
  listResourceParts, loadResourceBlocks,
  type ResourceDocumentDetail, type ResourcePart,
} from '@/lib/resource-library'
import type { ResourceBlock } from '@/lib/resource-blocks'

export function Component() {
  const { documentId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isAdmin = useAuthStore((s) => s.profile?.role === 'admin')

  const [doc, setDoc] = useState<ResourceDocumentDetail | null>(null)
  const [parts, setParts] = useState<ResourcePart[]>([])
  const [blocks, setBlocks] = useState<ResourceBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockParam = searchParams.get('block')
  const initialBlockIndex = useMemo(() => {
    if (blockParam === null) return null
    const n = Number(blockParam)
    return Number.isInteger(n) && n >= 0 ? n : null
  }, [blockParam])
  const initialQuery = searchParams.get('q') ?? ''

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
        const [loadedParts, loadedBlocks] = await Promise.all([
          listResourceParts(found.id),
          loadResourceBlocks(found.id),
        ])
        setParts(loadedParts)
        setBlocks(loadedBlocks)
      } else {
        setParts([])
        setBlocks([])
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
      <div className="flex shrink-0 flex-wrap items-start gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
          <Link to="/resource-library">
            <ArrowLeft className="h-3.5 w-3.5" />资料库
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold">{doc?.title ?? (loading ? '加载中...' : '—')}</h1>
            {doc && <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-none">{doc.doc_type}</Badge>}
            {doc?.subject && (
              <Badge variant="outline" className="px-1 py-0 text-[9px] leading-none">{doc.subject}</Badge>
            )}
            {doc?.pub_year && (
              <span className="text-[10px] text-muted-foreground">{doc.pub_year}</span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {doc ? [doc.authors, doc.source].filter(Boolean).join(' · ') || '未填写作者与来源' : ''}
          </p>
          {doc && doc.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {doc.tags.map((t) => (
                <Badge key={t} variant="outline" className="px-1 py-0 text-[9px] leading-none">{t}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {doc?.pdf_url && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
              <a href={doc.pdf_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />原件
              </a>
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
              <Link to="/admin/resource-library">
                <Settings2 className="h-3.5 w-3.5" />管理
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
            initialBlockIndex={initialBlockIndex}
            initialQuery={initialQuery}
          />
        </div>
      ) : null}
    </div>
  )
}
