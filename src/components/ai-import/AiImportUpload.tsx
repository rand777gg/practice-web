import { useState, useRef, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileText } from 'lucide-react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function AiImportUpload({ onFile, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'doc', 'docx'].includes(ext)) return
    setFile(f)
    onFile(f)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) acceptFile(f)
  }

  return (
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
        accept=".pdf,.doc,.docx"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) acceptFile(f)
        }}
      />

      {file ? (
        <div className="space-y-2">
          <FileText className="h-10 w-10 mx-auto text-blue-500" />
          <p className="text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setFile(null); inputRef.current!.value = '' }}
          >
            重新选择
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">拖拽文档到此处，或点击选择文件</p>
          <p className="text-xs text-muted-foreground">支持 PDF、DOCX 格式</p>
        </div>
      )}
    </div>
  )
}
