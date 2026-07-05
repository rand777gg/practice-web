import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Clock } from 'lucide-react'

export interface HistoryEntry {
  id: number
  file_name: string
  markdown: string
  json_data: string | null
  questions_json: string | null
  status_json: string | null
  page_ranges: string | null
  pdf_total_pages: number | null
  pdf_page_urls: string | null
  mode: string
  created_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: HistoryEntry[]
  loading: boolean
  error: string
  onLoad: (id: number) => void
  onDelete: (id: number) => void
  onBatchCache: (ids: number[]) => void
  onShowQuestions: (questionsJson: string) => void
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

export function ParseHistoryDialog({ open, onOpenChange, history, loading, error, onLoad, onDelete, onBatchCache, onShowQuestions }: Props) {
  const [mode, setMode] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

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
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                  <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 条</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={async () => {
                      const ids = [...selectedIds]
                      setSelectedIds(new Set())
                      onBatchCache(ids)
                    }}>
                    批量缓存到 R2
                  </Button>
                </div>
              )}

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

                    return (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs py-1.5">
                          {h.file_name.startsWith('http') && (
                            <Checkbox
                              checked={selectedIds.has(h.id)}
                              onCheckedChange={() => {
                                setSelectedIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(h.id)) next.delete(h.id)
                                  else next.add(h.id)
                                  return next
                                })
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground tabular-nums">{h.id}</TableCell>
                        <TableCell className="text-xs py-1.5">
                          <button type="button" className="text-left hover:underline underline-offset-2 font-medium max-w-[280px] truncate block"
                            onClick={() => { onLoad(h.id); onOpenChange(false) }}>
                            {h.file_name.startsWith('http') ? (h.file_name.split('/').pop() || h.file_name) : h.file_name}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">
                          {{lightweight: '轻量', precision: '精准', generate: '生成'}[h.mode] || h.mode}
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
