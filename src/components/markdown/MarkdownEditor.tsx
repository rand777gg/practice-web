import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownRenderer } from './MarkdownRenderer'
import { FormattingToolbar } from '@/components/notes/FormattingToolbar'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image-compress'
import { cn, normalizeChineseText } from '@/lib/utils'
import { ImagePlus, Loader2, Wand2, WrapText, Video, ScanEye, Sparkles, X } from 'lucide-react'
import { hasAiConfig, getAiConfig, getMinerUToken } from '@/lib/ai/config'
import { MinerUClient } from '@/lib/ai/mineru'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  minHeight?: string
  hidePreview?: boolean
  hideImageTools?: boolean
  extraToolbarButtons?: React.ReactNode
  bottomButtons?: React.ReactNode
  overlay?: React.ReactNode
  onImageAction?: (action: 'left' | 'center' | 'right', src: string) => void
  className?: string
}

const R2_BASE = (() => {
  const host = import.meta.env.VITE_R2_PUBLIC_HOST as string | undefined
  return (host ? `https://${host}` : 'https://r2-rpw.pguide.dev').replace(/\/+$/, '')
})()

// Collect R2 image URLs referenced as markdown images or raw <img src>.
function extractR2ImageUrls(md: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /!\[[^\]]*\]\(([^)\s]+)\)|\bsrc\s*=\s*["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const u = (m[1] || m[2] || '').trim()
    if (u.startsWith(R2_BASE) && u.length > R2_BASE.length + 1 && !seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

function deleteR2ImageByUrl(url: string) {
  const key = url.slice(R2_BASE.length + 1)
  if (!key) return
  supabase.functions.invoke('r2', { body: { action: 'delete', keys: [key] } }).catch(() => {})
}

interface StagedImage {
  file: File
  preview: string
  base64: string
}

export function MarkdownEditor({
  value, onChange, placeholder, textareaRef: externalRef, minHeight = '160px',
  hidePreview, hideImageTools, extraToolbarButtons, bottomButtons, overlay,
  onImageAction, className,
}: Props) {
  const [previewValue, setPreviewValue] = useState(value)
  const [dragOver, setDragOver] = useState(false)
  const [isUploadingImg, setIsUploadingImg] = useState(false)
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [isFormatting, setIsFormatting] = useState(false)

  // ── Image staging: paste / drop / pick lands here first, then keep-or-OCR ──
  const [staged, setStaged] = useState<StagedImage | null>(null)
  const [stageBusy, setStageBusy] = useState(false)
  const [stageAction, setStageAction] = useState<'upload' | 'ocr' | null>(null)
  const [ocrResult, setOcrResult] = useState('')
  const [ocrError, setOcrError] = useState('')

  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ta = externalRef ?? internalRef
  const containerRef = useRef<HTMLDivElement>(null)

  // ── R2 orphan cleanup: when the user deletes an inserted image md, drop the
  //    corresponding R2 object after a settle delay (undo-safe, doc-switch-safe)
  const r2TrackedRef = useRef<string[]>([])
  const userEditedRef = useRef(false)
  const r2CleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (r2CleanupTimer.current) clearTimeout(r2CleanupTimer.current) }, [])

  useEffect(() => {
    const current = extractR2ImageUrls(value)
    // External doc load (e.g. switching KP/question) cancels pending cleanup and
    // silently resets the baseline, so we never delete images of other docs.
    if (!userEditedRef.current) {
      if (r2CleanupTimer.current) { clearTimeout(r2CleanupTimer.current); r2CleanupTimer.current = null }
      userEditedRef.current = false
      r2TrackedRef.current = current
      return
    }
    if (r2CleanupTimer.current) clearTimeout(r2CleanupTimer.current)
    r2CleanupTimer.current = setTimeout(() => {
      const removed = r2TrackedRef.current.filter((u) => !current.includes(u))
      for (const u of removed) deleteR2ImageByUrl(u)
      r2TrackedRef.current = current
      userEditedRef.current = false
      r2CleanupTimer.current = null
    }, 5000)
  }, [value])

  // Marks a change as coming from the user so orphan cleanup can run.
  const emit = useCallback((v: string) => {
    userEditedRef.current = true
    onChange(v)
  }, [onChange])

  // Sync external ref
  useEffect(() => {
    if (externalRef) (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = internalRef.current
  })

  // Debounced preview
  useEffect(() => {
    const t = setTimeout(() => setPreviewValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  // Insert plain text (markdown) at the caret, separated by blank lines.
  const insertText = useCallback((text: string) => {
    const el = internalRef.current
    if (el) {
      const start = el.selectionStart
      const end = el.selectionEnd
      const before = el.value.slice(0, start)
      const after = el.value.slice(end)
      const padBefore = before.trim() ? '\n\n' : ''
      const padAfter = after.trim() ? '\n\n' : ''
      const next = before + padBefore + text + padAfter + after
      el.value = next
      const pos = start + padBefore.length + text.length + padAfter.length
      el.selectionStart = el.selectionEnd = pos
      el.focus()
      emit(next)
    } else {
      emit(value.trim() ? `${value.trimEnd()}\n\n${text}` : text)
    }
  }, [value, emit])

  const uploadImageFile = useCallback(async (file: File): Promise<boolean> => {
    setIsUploadingImg(true)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('folder', 'images')
      const { data, error } = await supabase.functions.invoke('r2', { body: formData })
      if (error) throw new Error(error.message || '上传失败')
      const url = (data as { url: string }).url
      if (!url) return false
      insertText(`![图片](${url})`)
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
      return false
    } finally {
      setIsUploadingImg(false)
    }
  }, [insertText])

  // ── Staging helpers ─────────────────────────────────────────────────────
  const stageImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setStaged({ file, preview: dataUrl, base64: dataUrl.split(',')[1] })
      setOcrResult('')
      setOcrError('')
    }
    reader.readAsDataURL(file)
  }

  const clearStage = () => {
    setStaged(null)
    setStageBusy(false)
    setStageAction(null)
    setOcrResult('')
    setOcrError('')
  }

  const handleStageInsert = async () => {
    if (!staged || stageBusy) return
    setStageBusy(true)
    setStageAction('upload')
    const ok = await uploadImageFile(staged.file)
    if (ok) clearStage()
    else { setStageBusy(false); setStageAction(null) }
  }

  const canOcr = !!getMinerUToken()

  const handleStageOcr = async () => {
    if (!staged || stageBusy) return
    const token = getMinerUToken()
    if (!token) { setOcrError('未配置 MinerU Token，请先到「设置 → AI」中配置'); return }
    setStageBusy(true)
    setStageAction('ocr')
    setOcrError('')
    try {
      const client = new MinerUClient()
      const markdown = await client.recognizeImage(staged.base64, token)
      setOcrResult(markdown.trim())
    } catch (err) {
      setOcrError(err instanceof Error ? `识别失败：${err.message}` : '识别失败')
    }
    setStageBusy(false)
    setStageAction(null)
  }

  const handleOcrInsert = () => {
    const text = ocrResult.trim()
    if (!text) return
    insertText(text)
    clearStage()
  }

  const handleUploadImage = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/' + '*'
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) stageImageFile(f)
    }
    input.click()
  }

  // Videos are compressed offline (see docs/video-compression.md), then uploaded
  // straight to R2 through a presigned URL (bypasses the edge function payload limit).
  const uploadVideoFile = useCallback(async (file: File) => {
    const type = file.type === '' && file.name.toLowerCase().endsWith('.webm') ? 'video/webm'
      : file.type === '' ? 'video/mp4' : file.type
    if (type !== 'video/mp4' && type !== 'video/webm') {
      alert('仅支持 MP4 / WebM 格式。请先用桌面工具（HandBrake / ffmpeg）压缩转码后再上传，见 docs/video-compression.md。')
      return
    }
    if (file.size > 1024 * 1024 * 1024) {
      alert('文件超过 1GB，建议压缩到 720p 以下并控制在 100MB 内，保证在线播放流畅。')
      return
    }
    const ext = type === 'video/webm' ? 'webm' : 'mp4'
    const key = `videos/${crypto.randomUUID()}.${ext}`
    setIsUploadingVideo(true)
    setVideoProgress(0)
    try {
      const { data, error } = await supabase.functions.invoke('r2', {
        body: JSON.stringify({ action: 'upload-url', key, contentType: type }),
      })
      if (error) throw new Error(error.message || '获取上传地址失败')
      const { url, publicUrl } = (data ?? {}) as { url: string; publicUrl: string }
      if (!url) throw new Error('获取上传地址失败')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', type)
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => { xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败 HTTP ${xhr.status}`)) }
        xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'))
        xhr.send(file)
      })
      insertText(`<video controls preload="metadata" src="${publicUrl}"></video>`)
    } catch (err) { alert(err instanceof Error ? err.message : '上传失败') }
    setIsUploadingVideo(false)
  }, [insertText])

  const handleUploadVideo = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'video/mp4,video/webm'
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) uploadVideoFile(f)
    }
    input.click()
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const f of files) {
      if (f.type.startsWith('video/')) uploadVideoFile(f)
      else if (f.type.startsWith('image/') && !staged) stageImageFile(f)
    }
  }

  // Paste image / video
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      if (hideImageTools) return
      const items = Array.from(e.clipboardData?.items ?? [])
      for (const item of items) {
        if (item.type.startsWith('video/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) uploadVideoFile(file)
          return
        }
      }
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file && !staged) stageImageFile(file)
          return
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [uploadVideoFile, staged, hideImageTools])

  const handleAiLineBreak = async () => {
    const config = getAiConfig()
    if (!config?.apiKey) return
    setIsFormatting(true)
    try {
      const current = internalRef.current?.value || value
      if (!current.trim()) return
      const { generateText } = await import('ai')
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL })
      const { text } = await generateText({
        model: client(config.model || 'deepseek-chat'),
        system: '你是一个纯文本格式化工具。你的唯一任务是在段落和列表项之间插入 <br> 换行符。你必须逐字保留原文，不得修改、替换、改写、省略任何内容，包括标点、空格、数学公式、Markdown 语法。只添加 <br>，不要做任何其他改动。直接输出格式化后的文本，不要加任何解释。',
        prompt: `以下是要格式化的文本，请严格原样保留，只在需要的地方添加 <br>：\n\n---\n${current}\n---`,
        temperature: 0.1,
      })
      if (text) emit(text)
    } catch (e) {
      console.error('AI line break failed:', e)
    }
    setIsFormatting(false)
  }

  const handleStandardize = () => {
    const blocks: string[] = []
    const t = value
      .replace(/```[\s\S]*?```/g, m => { blocks.push(m); return `@@CODE${blocks.length}@@` })
      .replace(/`[^`\n]+`/g, m => { blocks.push(m); return `@@CODE${blocks.length}@@` })
    emit(normalizeChineseText(t).replace(/@@CODE(\d+)@@/g, (_, i) => blocks[Number(i) - 1] || ''))
  }

  const toolbarButtons = (
    <>
      <span className="text-muted-foreground/40 text-xs mx-0.5">|</span>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="文字标准化（中英文加空格、标点全角化，代码块不受影响）"
        onClick={handleStandardize}>
        <Wand2 className="h-3.5 w-3.5" />
      </Button>
      {!hideImageTools && (
        <>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入图片（粘贴/拖入/选择后可在暂存条选择直接插入或 OCR）"
            disabled={isUploadingImg} onClick={handleUploadImage}>
            {isUploadingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入视频（MP4/WebM，R2 存储，建议先压缩）"
            disabled={isUploadingVideo} onClick={handleUploadVideo}>
            {isUploadingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
          </Button>
          {isUploadingVideo && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{videoProgress}%</span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
            title="AI 自动换行" disabled={isFormatting || !hasAiConfig()} onClick={handleAiLineBreak}>
            {isFormatting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WrapText className="h-3.5 w-3.5" />}
          </Button>
        </>
      )}
    </>
  )

  return (
    <div ref={containerRef} className={cn('space-y-2', className)}>
      <div className="relative flex gap-1 flex-wrap items-center">
        <FormattingToolbar textareaRef={ta} value={value} onChange={emit} extraButtons={
          <>
            {toolbarButtons}
            {extraToolbarButtons}
          </>
        } />
        {staged && (
          <div className="absolute inset-0 z-10 rounded-lg bg-background/70 pointer-events-auto" aria-hidden="true" />
        )}
      </div>

      {staged && (
        <div className="space-y-2 rounded-xl border-2 border-primary/50 bg-primary/5 p-2.5">
          <div className="flex items-start gap-2.5">
            <img
              src={staged.preview}
              alt="待插入图片"
              className="max-h-24 max-w-32 rounded-md border-2 border-primary object-contain shadow-sm"
            />
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              <p className="truncate font-medium text-foreground">{staged.file.name}</p>
              <p>选择「插入图片」直接保留，或「OCR 识别」把图片内容转为文字后插入</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleStageInsert} disabled={stageBusy}>
              {stageBusy && stageAction === 'upload'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ImagePlus className="h-3.5 w-3.5" />}
              {stageBusy && stageAction === 'upload' ? '上传插入中...' : '插入图片'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-primary/50 text-primary hover:bg-primary/10" onClick={handleStageOcr} disabled={stageBusy || !canOcr}>
              {stageBusy && stageAction === 'ocr'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ScanEye className="h-3.5 w-3.5" />}
              {stageBusy && stageAction === 'ocr' ? '识别中...' : 'OCR 识别'}
            </Button>
            {stageBusy && stageAction === 'ocr' && <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={stageBusy} onClick={clearStage}>
              <X className="h-3.5 w-3.5 mr-1" />取消
            </Button>
          </div>
          {!canOcr && !ocrResult && (
            <p className="text-[11px] text-muted-foreground">OCR 需要 MinerU Token：请先到「设置 → AI」中配置。</p>
          )}
          {ocrError && <p className="text-xs text-red-500">{ocrError}</p>}
          {ocrResult && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">识别结果（Markdown，含表格/公式，可编辑后插入；原图片不会保留）</p>
              <textarea
                value={ocrResult}
                onChange={(e) => setOcrResult(e.target.value)}
                rows={6}
                spellCheck={false}
                className="block min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm resize-y"
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleOcrInsert}>
                  <Sparkles className="h-3.5 w-3.5" />插入识别文字
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearStage}>放弃</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cn('grid gap-2 items-stretch', !hidePreview && 'grid-cols-1 lg:grid-cols-2')}>
        <div
          className={cn('relative', dragOver && 'ring-2 ring-primary ring-offset-1 rounded-lg')}
          onDragOver={!hideImageTools ? handleDragOver : undefined}
          onDragLeave={!hideImageTools ? handleDragLeave : undefined}
          onDrop={!hideImageTools ? handleDrop : undefined}
        >
          <Textarea
            ref={internalRef}
            value={value}
            onChange={(e) => emit(e.target.value)}
            placeholder={placeholder || '支持 Markdown 语法...'}
            className="font-mono text-sm h-full min-h-0"
            style={{ minHeight, resize: 'none' }}
            spellCheck={false}
            autoComplete="off"
          />
          {dragOver && (
            <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center pointer-events-none">
              <span className="text-sm font-medium text-primary">释放以插入图片</span>
            </div>
          )}
          {bottomButtons && (
            <div className="absolute right-1 bottom-1 flex gap-0.5">
              {bottomButtons}
            </div>
          )}
          {overlay}
        </div>
        {!hidePreview && (
          <div className="rounded-lg border bg-muted/30 p-3 overflow-auto" style={{ minHeight, maxHeight: '500px' }}>
            {previewValue ? (
              <MarkdownRenderer content={previewValue} onImageAction={onImageAction} />
            ) : (
              <p className="text-xs text-muted-foreground">预览区域，编辑内容后实时显示...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
