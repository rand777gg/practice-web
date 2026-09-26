import { useState, useRef, useEffect, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileText, FileImage, FileSpreadsheet, File, FileCode, X } from 'lucide-react'
import { rasterizeForParse } from '@/lib/image-compress'

function fileIcon(ext: string) {
  switch (ext) {
    case 'pdf': return { Icon: FileText, color: 'text-red-500' }
    case 'doc': case 'docx': return { Icon: FileText, color: 'text-blue-500' }
    case 'xls': case 'xlsx': return { Icon: FileSpreadsheet, color: 'text-green-500' }
    case 'ppt': case 'pptx': return { Icon: File, color: 'text-orange-500' }
    case 'png': case 'jpg': case 'jpeg': case 'webp': case 'gif': case 'bmp':
    case 'svg': case 'avif': return { Icon: FileImage, color: 'text-purple-500' }
    case 'html': return { Icon: FileCode, color: 'text-yellow-500' }
    default: return { Icon: FileText, color: 'text-muted-foreground' }
  }
}

function getFileIcon(f: File) {
  return fileIcon(f.name.split('.').pop()?.toLowerCase() ?? '')
}

interface Props {
  onFile: (file: File) => void
  onFiles?: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
  acceptFormats?: string
}

// svg/avif 收, 但送解析前会先点阵化成 png —— MinerU 用 PIL 开图, 这两种它不认(见 rasterizeForParse)
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'jp2', 'webp', 'gif', 'bmp', 'svg', 'avif']
const DOC_EXTS = ['pdf', 'doc', 'docx']
const OFFICE_EXTS = ['ppt', 'pptx', 'xls', 'xlsx']

const ALL_EXTS = [...DOC_EXTS, ...OFFICE_EXTS, ...IMG_EXTS, 'html']

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp,.svg,.avif'
const PRECISION_ACCEPT = [DEFAULT_ACCEPT, '.ppt,.pptx,.xls,.xlsx,.html'].join(',')

const ACCEPT_EXTENSIONS: Record<string, string[]> = {
  lightweight: [...DOC_EXTS, ...IMG_EXTS],
  precision: ALL_EXTS,
}

export function AiImportUpload({ onFile, onFiles, disabled, multiple }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptExts = multiple
    ? ACCEPT_EXTENSIONS.precision
    : ACCEPT_EXTENSIONS.lightweight

  /**
   * 收文件: 先按扩展名筛, 再把 svg/avif 点阵化成 png, 最后才交给上层。
   * 放在这一层做是因为它是所有入口(选择/拖拽/粘贴)的必经之路 —— 上层拿到的永远是解析得了的文件。
   */
  const addFiles = async (incoming: File[]) => {
    const accepted: File[] = []
    for (const f of incoming) {
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (!ext || !acceptExts.includes(ext)) continue
      const rasterized = await rasterizeForParse(f)
      if (rasterized !== f) console.info(`[ai-import] ${f.name} 已转成 ${rasterized.name} 再送去解析`)
      accepted.push(rasterized)
    }
    if (accepted.length === 0) return
    if (multiple) {
      setFiles(prev => [...prev, ...accepted])
      onFiles?.([...files, ...accepted])
    } else {
      setFiles([accepted[0]])
      onFile(accepted[0])
    }
  }

  const acceptFile = (f: File) => { void addFiles([f]) }

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const next = prev.filter((_, i) => i !== idx)
      onFiles?.(next)
      return next
    })
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (multiple) {
      void addFiles(Array.from(e.dataTransfer.files))
    } else {
      const f = e.dataTransfer.files[0]
      if (f) acceptFile(f)
    }
  }

  // Clipboard paste support
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items || items.length === 0) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          e.preventDefault()
          const f = item.getAsFile()
          if (f) acceptFile(f)
          return
        }
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [multiple, files])

  const formatLabel = multiple
    ? '支持 PDF、图片（png/jpg/jpeg/jp2/webp/gif/bmp/svg/avif）、Docx、PPTx、Xlsx'
    : '支持 PDF、图片（png/jpg/jpeg/jp2/webp/gif/bmp/svg/avif）、Docx'

  const acceptAttr = multiple ? PRECISION_ACCEPT : DEFAULT_ACCEPT

  return (
    <div>
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-border hover:border-muted-foreground/50'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            const selectedFiles = e.target.files
            if (!selectedFiles || selectedFiles.length === 0) return
            // 单选也是同一条路: 筛选 + svg/avif 点阵化都在 addFiles 里
            if (multiple) void addFiles(Array.from(selectedFiles))
            else acceptFile(selectedFiles[0])
          }}
        />

        {files.length === 0 ? (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">拖拽文档到此处，或点击选择文件，或 Ctrl+V 粘贴</p>
            <p className="text-xs text-muted-foreground">{formatLabel}</p>
          </div>
        ) : multiple ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((f, i) => {
              const { Icon, color } = getFileIcon(f)
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setFiles([]); onFiles?.([]) }}
            >
              清除全部
            </Button>
          </div>
        ) : (() => {
          const { Icon, color } = getFileIcon(files[0])
          return (
            <div className="space-y-2">
              <Icon className={`h-10 w-10 mx-auto ${color}`} />
              <p className="text-sm font-medium">{files[0].name}</p>
              <p className="text-xs text-muted-foreground">{(files[0].size / 1024 / 1024).toFixed(1)} MB</p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setFiles([]); inputRef.current!.value = '' }}
              >
                重新选择
              </Button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
