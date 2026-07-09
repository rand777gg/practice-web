import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Clock, Link, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'

export interface HistoryEntry {
  id: number
  file_name: string
  display_name: string | null
  markdown: string
  json_data: string | null
  questions_json: string | null
  status_json: string | null
  page_ranges: string | null
  pdf_total_pages: number | null
  pdf_page_urls: string | null
  mode: string
  created_at: string
  subject: string | null
  category: string | null
  key_points: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: HistoryEntry[]
  loading: boolean
  error: string
  onLoad: (id: number) => void
  onDelete: (id: number) => void
  onBatchDelete: (ids: number[]) => void
  onBatchCache: (ids: number[]) => void
  onBatchReplaceUrl: (ids: number[], newUrl: string) => void
  onRename: (id: number, displayName: string) => void
  onShowQuestions: (questionsJson: string) => void
  r2DisplayNames?: Map<string, string>
  r2Pdfs?: { key: string; url: string }[]
}

const MODES = [
  { value: 'all', label: '全部' },
  { value: 'lightweight', label: '轻量' },
  { value: 'precision', label: '精准' },
  { value: 'generate', label: '生成' },
] as const

function stateLabel(s: string) {
  const map: Record<string, string> = {
    done: '已完成', imported: '已导入', failed: '失败',
    running: '处理中', pending: '排队中', converting: '转换中',
    questions_extracted: '已提取题目', questions_generated: '已生成题目',
  }
  return map[s] || s
}

function stateColor(s: string) {
  if (s === 'done' || s === 'imported') return 'text-green-600 bg-green-100 dark:bg-green-900/30'
  if (s === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-900/30'
  if (s === 'questions_extracted' || s === 'questions_generated') return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30'
  return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30'
}

function fileNameFromUrl(url: string): string {
  return url.split('/').pop() || url
}

function r2KeyFromUrl(url: string): string | null {
  if (!url.includes('r2-rpw.pguide.dev')) return null
  const idx = url.indexOf('pdf/')
  return idx >= 0 ? url.slice(idx) : null
}

function extractMeta(h: HistoryEntry) {
  // Priority: direct stored fields, fallback to questions_json
  const subjects = h.subject || ''
  const cats = h.category || ''
  const kps = h.key_points || ''
  if (subjects || cats || kps) return { subjects, categories: cats, keyPoints: kps }

  // Fallback: extract from questions_json (for old records)
  const subs = new Set<string>()
  const cats2 = new Set<string>()
  const kps2 = new Set<string>()
  try {
    const qs = JSON.parse(h.questions_json || '[]') as any[]
    for (const q of qs) {
      if (q.subject) subs.add(q.subject)
      if (q.category) cats2.add(q.category)
      if (q.key_points) {
        for (const kp of String(q.key_points).split(/[,，;；]/)) {
          const t = kp.trim(); if (t) kps2.add(t)
        }
      }
    }
  } catch { /* ignore */ }
  return { subjects: [...subs].join(', '), categories: [...cats2].join(', '), keyPoints: [...kps2].join(', ') }
}

function displayFileName(h: HistoryEntry, r2Names?: Map<string, string>): string {
  if (h.display_name) return h.display_name
  if (r2Names) {
    const key = r2KeyFromUrl(h.file_name)
    if (key && r2Names.has(key)) return r2Names.get(key)!
  }
  return h.file_name.startsWith('http') ? fileNameFromUrl(h.file_name) : h.file_name
}

export function ParseHistoryDialog({ open, onOpenChange, history, loading, error, onLoad, onDelete, onBatchDelete, onBatchCache, onBatchReplaceUrl, onRename, onShowQuestions, r2DisplayNames, r2Pdfs }: Props) {
  const [mode, setMode] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [replaceUrl, setReplaceUrl] = useState('')
  const [showReplaceInput, setShowReplaceInput] = useState(false)
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  const filtered = mode === 'all' ? history : history.filter(h => h.mode === mode)
  const cacheable = filtered.filter(h => h.file_name.startsWith('http'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            解析历史记录
            <span className="text-xs text-muted-foreground font-normal">({history.length})</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode} className="shrink-0">
          <TabsList>
            {MODES.map(m => (
              <TabsTrigger key={m.value} value={m.value} className="text-xs">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex-1 min-h-[50vh] overflow-auto mt-2">
          {error ? (
            <p className="text-xs text-destructive text-center py-8">加载失败: {error}</p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">暂无记录</p>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10 flex-wrap">
                  <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 条</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={async () => {
                      const ids = [...selectedIds]
                      setSelectedIds(new Set())
                      onBatchCache(ids)
                    }}>
                    批量缓存到 R2
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onBatchDelete([...selectedIds])
                      setSelectedIds(new Set())
                    }}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    删除
                  </Button>
                  {showReplaceInput ? (
                    <>
                      <Input
                        value={replaceUrl}
                        onChange={(e) => setReplaceUrl(e.target.value)}
                        placeholder="输入新的 PDF URL 或从 R2 选择"
                        className="h-7 text-xs w-56"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && replaceUrl.trim()) {
                            onBatchReplaceUrl([...selectedIds], replaceUrl.trim())
                            setSelectedIds(new Set())
                            setReplaceUrl('')
                            setShowReplaceInput(false)
                          }
                        }}
                      />
                      {r2Pdfs && r2Pdfs.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                              R2 <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto max-w-xs">
                            {r2Pdfs.map((f) => (
                              <DropdownMenuItem key={f.key} className="text-xs" onClick={() => setReplaceUrl(f.url)}>
                                <span className="truncate">{r2DisplayNames?.get(f.key) || f.key.replace('pdf/', '')}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        disabled={!replaceUrl.trim()}
                        onClick={() => {
                          onBatchReplaceUrl([...selectedIds], replaceUrl.trim())
                          setSelectedIds(new Set())
                          setReplaceUrl('')
                          setShowReplaceInput(false)
                        }}>
                        确认换源
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => { setShowReplaceInput(false); setReplaceUrl('') }}>
                        取消
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setShowReplaceInput(true)}>
                      <Link className="h-3 w-3 mr-1" />
                      批量换源
                    </Button>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[32px]">
                      {cacheable.length > 0 && (
                        <Checkbox
                          checked={cacheable.every(h => selectedIds.has(h.id))}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(new Set(cacheable.map(h => h.id)))
                            else setSelectedIds(new Set())
                          }}
                        />
                      )}
                    </TableHead>
                    <TableHead className="text-xs w-[40px]">ID</TableHead>
                    <TableHead className="text-xs">文件名</TableHead>
                    <TableHead className="text-xs w-[48px]">模式</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">学科</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">分类</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">知识点</TableHead>
                    <TableHead className="text-xs w-[80px]">页码范围</TableHead>
                    <TableHead className="text-xs w-[44px]">题目</TableHead>
                    <TableHead className="text-xs w-[68px]">状态</TableHead>
                    <TableHead className="text-xs w-[44px]">缓存</TableHead>
                    <TableHead className="text-xs w-[120px]">时间</TableHead>
                    <TableHead className="text-xs w-[36px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((h) => {
                    const qCount = (() => { try { return (JSON.parse(h.questions_json || '[]') as unknown[]).length } catch { return 0 } })()
                    const s = (() => { try { return JSON.parse(h.status_json || '{}') } catch { return {} } })()
                    const statusText = stateLabel(s.state || '')
                    const statusCls = stateColor(s.state || '')
                    const cachePages = (() => { try { const urls = JSON.parse(h.pdf_page_urls || 'null'); return Array.isArray(urls) ? urls.length : 0 } catch { return 0 } })()
                    const meta = extractMeta(h)

                    return (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs py-1.5">
                          {h.file_name.startsWith('http') && (
                            <Checkbox
                              checked={selectedIds.has(h.id)}
                              onCheckedChange={() => {
                                setSelectedIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(h.id)) { next.delete(h.id) } else { next.add(h.id) }
                                  return next
                                })
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground tabular-nums">{h.id}</TableCell>
                        <TableCell className="text-xs py-1.5">
                          {editingNameId === h.id ? (
                            <Input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onBlur={() => {
                                if (editNameValue.trim()) onRename(h.id, editNameValue.trim())
                                setEditingNameId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editNameValue.trim()) onRename(h.id, editNameValue.trim())
                                  setEditingNameId(null)
                                } else if (e.key === 'Escape') {
                                  setEditingNameId(null)
                                }
                              }}
                              className="h-6 text-xs"
                              autoFocus
                            />
                          ) : (
                            <button type="button"
                              className="text-left hover:underline underline-offset-2 font-medium max-w-[280px] truncate block"
                              onClick={() => { onLoad(h.id); onOpenChange(false) }}
                              onDoubleClick={(e) => {
                                e.preventDefault()
                                setEditingNameId(h.id)
                                setEditNameValue(displayFileName(h, r2DisplayNames))
                              }}
                              title="单击查看 · 双击重命名">
                              {displayFileName(h, r2DisplayNames)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">
                          {{lightweight: '轻量', precision: '精准', generate: '生成'}[h.mode] || h.mode}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap max-w-[120px] truncate" title={meta.subjects || undefined}>
                          {meta.subjects || '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap max-w-[120px] truncate" title={meta.categories || undefined}>
                          {meta.categories || '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap max-w-[150px] truncate" title={meta.keyPoints || undefined}>
                          {meta.keyPoints || '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground font-mono whitespace-nowrap">
                          {h.mode === 'generate' ? '全部' : (h.page_ranges || '全部')}{h.pdf_total_pages ? ` / ${h.pdf_total_pages}页` : ''}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 tabular-nums">
                          {qCount > 0 ? (
                            <button type="button" className="hover:underline underline-offset-2 font-medium text-primary" onClick={() => { onShowQuestions(h.questions_json!); onOpenChange(false) }}>
                              {qCount}
                            </button>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          {statusText ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCls}`}>{statusText}</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          {cachePages > 0
                            ? <span className="text-green-600 text-[10px] font-medium">{cachePages}页</span>
                            : <span className="text-muted-foreground/40">-</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap">
                          {new Date(h.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => onDelete(h.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
