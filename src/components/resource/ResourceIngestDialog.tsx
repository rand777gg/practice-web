import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { canUseMinerU, hasMinerUToken, probeMinerU } from '@/lib/ai/config'
import { countPdfPages } from '@/lib/pdf-page-renderer'
import { MINERU_PAGE_LIMIT, selectedPageCount, slicePageRanges, sliceToRange } from '@/lib/page-slices'
import { ingestResource, type ParseMode } from '@/lib/resource-library'
import { ResourceMetaFields } from './ResourceMetaFields'
import { EMPTY_META, metaToInput, type MetaFormValue } from '@/lib/resource-meta-form'
import { Separator } from '@/components/ui/separator'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (documentId: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ResourceIngestDialog({ open, onOpenChange, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<MetaFormValue>(EMPTY_META)
  const [pageRanges, setPageRanges] = useState('')
  const [mode, setMode] = useState<ParseMode>(canUseMinerU() ? 'precision' : 'lightweight')

  const [phase, setPhase] = useState<'idle' | 'running' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(null)

  const running = phase === 'running'
  // 平台那把 token 在服务端, 前端默认按"有"渲染; 探测出平台没配、自己也没填, 才提示要自备
  const [tokenMissing, setTokenMissing] = useState(!canUseMinerU())
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void probeMinerU().then((fromPlatform) => {
      if (!cancelled) setTokenMissing(!fromPlatform && !hasMinerUToken())
    })
    return () => { cancelled = true }
  }, [open])

  const explicitRanges = pageRanges.trim()
  // 留空 = 按 200 页上限自动切卷; 显式填了页码范围则整段作为一卷, 超上限要拦下来
  const autoSlices = totalPages !== null && !explicitRanges ? slicePageRanges(totalPages) : []
  const explicitCount = totalPages !== null && explicitRanges
    ? selectedPageCount(totalPages, explicitRanges)
    : 0
  const overLimit = explicitCount > MINERU_PAGE_LIMIT

  const pickFile = async (picked: File | null) => {
    setFile(picked)
    setTotalPages(null)
    setPhase('idle')
    setMessage('')
    if (!picked) return
    try {
      setTotalPages(await countPdfPages(picked))
    } catch {
      setMessage('无法读取这份 PDF 的页数, 解析时可能失败')
      setPhase('error')
    }
  }

  const reset = () => {
    setFile(null)
    setMeta(EMPTY_META)
    setPageRanges('')
    setTotalPages(null)
    setPhase('idle')
    setMessage('')
    setProgress(null)
  }

  const submit = async () => {
    if (!file) { setPhase('error'); setMessage('请先选择 PDF 文件'); return }
    if (!meta.title.trim()) { setPhase('error'); setMessage('标题不能为空'); return }
    if (mode === 'precision' && tokenMissing) {
      setPhase('error'); setMessage('精准解析需要 MinerU Token: 平台未配置, 请到 AI 设置里填自己的 token, 或改用轻量解析')
      return
    }

    setPhase('running')
    setMessage('准备中...')
    setProgress(null)

    try {
      const id = await ingestResource(file, metaToInput(meta), {
        mode,
        pageRanges: pageRanges.trim() || undefined,
        producer: (p) => {
          setMessage(p.step)
          setProgress(p.done !== undefined && p.total ? { done: p.done, total: p.total } : null)
        },
      })
      onDone(id)
      reset()
      onOpenChange(false)
    } catch (err) {
      setPhase('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!running) { onOpenChange(next); if (!next) setPhase('idle') } }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>录入原始文献</DialogTitle>
          <DialogDescription>
            PDF 传到 R2, 正文由 MinerU 解析。解析结果会拆成带页码和坐标的区块, 目录、PDF 与正文的双向定位、以及检索都以这些区块为准。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>PDF 文件</Label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { void pickFile(e.target.files?.[0] ?? null) }}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={running} onClick={() => fileRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" />选择 PDF
              </Button>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {file ? <>{file.name}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{formatSize(file.size)}</> : '未选择文件'}
                {totalPages !== null && <><Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />共 {totalPages} 页</>}
              </span>
            </div>
            {autoSlices.length > 1 && (
              <p className="text-[10px] text-muted-foreground">
                共 {totalPages} 页, 超过 MinerU 单次 {MINERU_PAGE_LIMIT} 页上限, 将自动切成 {autoSlices.length} 卷并行解析：
                {autoSlices.map((s) => sliceToRange(s)).join('、')}。
                全篇仍是一篇文献, 页码连续。解析期间请保持此页面打开。
              </p>
            )}
            {overLimit && (
              <p className="text-[10px] text-destructive">
                指定的页码范围覆盖 {explicitCount} 页, 超过 MinerU 的 {MINERU_PAGE_LIMIT} 页上限。
                请把页码范围改小, 或清空让它自动切卷。
              </p>
            )}
          </div>

          <ResourceMetaFields value={meta} onChange={setMeta} disabled={running} />

          <div className="grid gap-3 rounded-md border p-2.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>解析模式</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ParseMode)} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="precision">精准 (MinerU v4)</SelectItem>
                  <SelectItem value="lightweight">轻量 (无需 Token)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {mode === 'precision'
                  ? tokenMissing ? '未配置 MinerU Token, 请改用轻量解析' : '支持公式 / 表格 / 精确版面坐标'
                  : '只有正文 Markdown, 没有版面坐标, 定位按段落估算页码'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>页码范围</Label>
              <Input value={pageRanges} onChange={(e) => setPageRanges(e.target.value)} disabled={running} placeholder="留空 = 全部, 如 1-30,50" />
              <p className="text-[10px] text-muted-foreground">只录入部分章节时可填, 能省解析额度</p>
            </div>
          </div>

          {phase !== 'idle' && (
            <div className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
              phase === 'error' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'bg-muted/40'
            }`}>
              {phase === 'error'
                ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                : <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words">{message}</p>
                {progress && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={running} onClick={() => { reset(); onOpenChange(false) }}>
            取消
          </Button>
          <Button disabled={running || overLimit} onClick={submit}>
            {running
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />解析中...</>
              : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />开始解析并录入</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
