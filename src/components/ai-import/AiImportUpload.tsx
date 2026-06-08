import { useState, useRef, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileText, FileImage, FileSpreadsheet, File, FileCode, X } from 'lucide-react'

function fileIcon(ext: string) {
  switch (ext) {
    case 'pdf': return { Icon: FileText, color: 'text-red-500' }
    case 'doc': case 'docx': return { Icon: FileText, color: 'text-blue-500' }
    case 'xls': case 'xlsx': return { Icon: FileSpreadsheet, color: 'text-green-500' }
    case 'ppt': case 'pptx': return { Icon: File, color: 'text-orange-500' }
    case 'png': case 'jpg': case 'jpeg': case 'webp': case 'gif': case 'bmp': return { Icon: FileImage, color: 'text-purple-500' }
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

const DEFAULT_ACCEPT = '.pdf,.doc,.docx'
const PRECISION_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp,.html'

const ACCEPT_EXTENSIONS: Record<string, string[]> = {
  lightweight: ['pdf', 'doc', 'docx'],
  precision: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'jp2', 'webp', 'gif', 'bmp', 'html'],
}

export function getAcceptedFormats(mode: 'lightweight' | 'precision'): string {
  return mode === 'precision' ? PRECISION_ACCEPT : DEFAULT_ACCEPT
}

export function getAcceptedExtensions(mode: 'lightweight' | 'precision'): string[] {
  return ACCEPT_EXTENSIONS[mode]
}

export function AiImportUpload({ onFile, onFiles, disabled, multiple }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptExts = multiple
    ? ACCEPT_EXTENSIONS.precision
    : ACCEPT_EXTENSIONS.lightweight

  const acceptFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ext || !acceptExts.includes(ext)) return

    if (multiple) {
      setFiles(prev => [...prev, f])
      onFiles?.([...files, f])
    } else {
      setFiles([f])
      onFile(f)
    }
  }

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
      const newFiles = Array.from(e.dataTransfer.files).filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase()
        return ext && acceptExts.includes(ext)
      })
      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles])
        onFiles?.([...files, ...newFiles])
      }
    } else {
      const f = e.dataTransfer.files[0]
      if (f) acceptFile(f)
    }
  }

  const formatLabel = multiple
    ? '支持 PDF、图片（png/jpg/jpeg/jp2/webp/gif/bmp）、Docx、PPTx、Xlsx'
    : '支持 PDF、图片（png/jpg/jpeg/jp2/webp/gif/bmp）、Docx'

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
            if (!selectedFiles) return
            if (multiple) {
              const valid = Array.from(selectedFiles).filter(f => {
                const ext = f.name.split('.').pop()?.toLowerCase()
                return ext && acceptExts.includes(ext)
              })
              if (valid.length > 0) {
                setFiles(prev => [...prev, ...valid])
                onFiles?.([...files, ...valid])
              }
            } else {
              const f = selectedFiles[0]
              if (f) acceptFile(f)
            }
          }}
        />

        {files.length === 0 ? (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">拖拽文档到此处，或点击选择文件</p>
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
