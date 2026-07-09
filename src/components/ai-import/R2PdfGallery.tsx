import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { renderPdfThumbnail } from '@/lib/pdf-page-renderer'
import { RefreshCw, FileText, LayoutGrid, List } from 'lucide-react'

interface R2Pdf {
  key: string
  url: string
  size: number
}

interface Props {
  pdfs: R2Pdf[]
  displayNames: Map<string, string>
  loading?: boolean
  onSelect: (url: string) => void
  onRename: (key: string, name: string) => void
  onRefresh: () => void
}

function thumbKey(pdf: R2Pdf): string {
  const name = pdf.key.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 64)
  return `pdf-thumbs/${name}.webp`
}

function thumbUrl(pdf: R2Pdf): string {
  return `https://r2-rpw.pguide.dev/${thumbKey(pdf)}`
}

function displayName(pdf: R2Pdf, names: Map<string, string>): string {
  return names.get(pdf.key) || pdf.key.replace('pdf/', '')
}

export function R2PdfGallery({ pdfs, displayNames, loading, onSelect, onRename, onRefresh }: Props) {
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set())
  const [loadingThumbs, setLoadingThumbs] = useState<Set<string>>(new Set())
  const renderingRef = useRef<Set<string>>(new Set())
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleImgError = async (pdf: R2Pdf) => {
    const tKey = thumbKey(pdf)
    if (renderingRef.current.has(tKey)) return
    renderingRef.current.add(tKey)
    setLoadingThumbs(prev => new Set(prev).add(tKey))

    const url = await renderPdfThumbnail(pdf.url, tKey)
    if (url) {
      setFailedThumbs(prev => {
        const next = new Set(prev)
        next.delete(tKey)
        return next
      })
    }
    setLoadingThumbs(prev => {
      const next = new Set(prev)
      next.delete(tKey)
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{loading ? '加载中...' : `${pdfs.length} 个文件`}</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title={layout === 'grid' ? '列表视图' : '网格视图'}
            onClick={() => setLayout(l => l === 'grid' ? 'list' : 'grid')}
          >
            {layout === 'grid' ? <List className="h-3 w-3" /> : <LayoutGrid className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="刷新" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5' : 'space-y-1'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`flex rounded-lg border p-2 ${layout === 'grid' ? 'flex-col items-center gap-1.5' : 'items-center gap-3'}`}>
              <Skeleton className={layout === 'grid' ? 'w-full aspect-[3/4] rounded' : 'w-10 h-14 rounded shrink-0'} />
              <Skeleton className={layout === 'grid' ? 'h-3 w-3/4' : 'h-4 flex-1'} />
            </div>
          ))}
        </div>
      ) : pdfs.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-4">暂无文件</p>
      ) : layout === 'list' ? (
        <div className="space-y-1">
          {pdfs.map((pdf) => {
            const name = displayName(pdf, displayNames)
            return (
              <button
                key={pdf.key}
                type="button"
                className="flex items-center gap-3 p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors text-left w-full"
                onClick={() => onSelect(pdf.url)}
                title={name}
              >
                <div className="w-10 h-14 shrink-0 rounded border bg-muted/30 overflow-hidden">
                  <img src={thumbUrl(pdf)} alt={name} className="w-full h-full object-cover" loading="lazy" onError={() => handleImgError(pdf)} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingKey === pdf.key ? (
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => { onRename(pdf.key, editValue.trim()); setEditingKey(null) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { onRename(pdf.key, editValue.trim()); setEditingKey(null) }
                        if (e.key === 'Escape') setEditingKey(null)
                      }}
                      className="h-5 text-[10px] px-1 py-0"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="text-xs leading-tight line-clamp-1"
                      onDoubleClick={(e) => { e.preventDefault(); setEditingKey(pdf.key); setEditValue(name) }}
                      title="双击重命名"
                    >
                      {name}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{formatSize(pdf.size)}</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {pdfs.map((pdf) => {
            const tKey = thumbKey(pdf)
            const name = displayName(pdf, displayNames)
            const failed = failedThumbs.has(tKey)
            const loadingThumb = loadingThumbs.has(tKey)

            return (
              <button
                key={pdf.key}
                type="button"
                className="group flex flex-col items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors text-left"
                onClick={() => onSelect(pdf.url)}
                title={`${name} — ${formatSize(pdf.size)}`}
              >
                <div className="relative w-full aspect-[3/4] rounded border bg-muted/30 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                  {loadingThumb ? (
                    <Skeleton className="w-full h-full rounded" />
                  ) : failed ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/40">
                      <FileText className="h-8 w-8" />
                      <span className="text-[10px]">生成失败</span>
                    </div>
                  ) : (
                    <img
                      src={thumbUrl(pdf)}
                      alt={name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => handleImgError(pdf)}
                    />
                  )}
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] text-muted-foreground/70 bg-background/80 px-1 rounded">
                    {formatSize(pdf.size)}
                  </span>
                </div>

                {editingKey === pdf.key ? (
                  <Input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { onRename(pdf.key, editValue.trim()); setEditingKey(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRename(pdf.key, editValue.trim()); setEditingKey(null) }
                      if (e.key === 'Escape') setEditingKey(null)
                    }}
                    className="h-5 text-[10px] px-1 py-0 w-full"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-[10px] text-muted-foreground leading-tight text-center line-clamp-2 w-full group-hover:text-foreground"
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      setEditingKey(pdf.key)
                      setEditValue(name)
                    }}
                    title="双击重命名"
                  >
                    {name}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
