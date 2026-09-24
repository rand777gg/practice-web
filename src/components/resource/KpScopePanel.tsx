/**
 * 知识点范围面板 —— 阅读页右侧那一栏: 这篇文献的哪几段属于哪个知识点。
 *
 * 谁看得到: **所有登录用户**。范围的意义就在于别人能顺着它跳过来(知识点解读、专题、路线图里
 * 都只放一条链接, 落到这里的那一段), 所以清单是公开读的; 圈范围与删除只有管理员能点。
 *
 * 圈法三种, 都是先算出区间给用户看一眼再落库(区间是这个功能的权威值, 不能猜):
 *   · 按目录圈一节 —— 该目录项到下一条目录项为止;
 *   · 按目录圈整章 —— 到下一个同级/更高级目录项为止(子节都在里面);
 *   · 正文里拖选任意区间 —— 一章里只有两段讲这个知识点时用这条(拖选由阅读页接管)。
 *
 * 对话框的开合是**派生**的: 有区间就开。于是"拖完自动弹出""关掉之后不再弹"都不需要在
 * effect 里同步 setState(那会多渲一轮, 而且拖选那一侧还得反过来通知这边)。
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Layers, Loader2, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { cn, naturalSort } from '@/lib/utils'
import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'
import {
  findDuplicate, kpCode, overlapping, scopeRangeFromToc, scopeWhere,
  type ResourceKpScope, type ScopeRange, type ScopeSpan,
} from '@/lib/resource-kp-scopes'
import { createKpScope, deleteKpScope } from '@/lib/resource-kp-scopes-store'

interface KpOption {
  subject: string
  keyPoints: string[]
}

/** 学科/知识点这两份选项与知识点解读、练习页同一个数据源(题库 key_points 的汇总) */
function useKpOptions(active: boolean) {
  const [options, setOptions] = useState<KpOption[]>([])
  // "加载完了没"而不是"正在加载" —— 后者要在 effect 里同步 setState, 会多渲一轮
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase.from('question_meta_cache').select('key_points_by_subject').single()
        if (cancelled) return
        const raw = (data?.key_points_by_subject ?? []) as { subject: string; key_points: string[] }[]
        setOptions(raw
          .map((item) => ({ subject: item.subject || '其他', keyPoints: [...item.key_points].sort(naturalSort) }))
          .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN')))
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [active])
  return { options, loading: active && !loaded }
}

interface DialogProps {
  documentId: string
  range: ScopeRange
  /** 区间的终点落到了全篇最后一段 —— 目录层级断掉时"圈整章"会变成"圈到书末", 得说一声 */
  endsAtDocumentEnd: boolean
  scopes: ResourceKpScope[]
  onClose: () => void
  onSaved: () => void
}

/** 区间已经定好, 这里只挑"挂到哪个知识点" */
function KpScopeDialog({ documentId, range, endsAtDocumentEnd, scopes, onClose, onSaved }: DialogProps) {
  const { options, loading } = useKpOptions(true)
  const [pickedSubject, setPickedSubject] = useState('')
  const [pickedKp, setPickedKp] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 默认落在第一个学科的第一个知识点上: 打开就能直接存, 不用先点两下。
  // 派生成"有效值"而不是在 effect 里 setState —— 选项是异步来的, 同步那次会先闪一个空选择。
  const subject = pickedSubject || options[0]?.subject || ''
  const subjectKps = useMemo(
    () => options.find((o) => o.subject === subject)?.keyPoints ?? [],
    [options, subject],
  )
  const kp = pickedKp || subjectKps[0] || ''

  const duplicate = findDuplicate(scopes, { subject, kp, blockFrom: range.blockFrom, blockTo: range.blockTo })
  const clashes = overlapping(scopes, range)

  const save = async () => {
    if (!documentId || !subject || !kp) return
    setSaving(true)
    setError(null)
    try {
      await createKpScope({ documentId, ...range, subject, kp, note })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>圈到知识点</DialogTitle>
          <DialogDescription>
            圈出来的区间对所有人可见：别人从知识点解读、专题或路线图点过来，就会落在这几段。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <p className="font-medium">{scopeWhere(range)}</p>
          <p className="mt-0.5 text-muted-foreground">
            段 {range.blockFrom}–{range.blockTo} · 共 {range.blockTo - range.blockFrom + 1} 段
          </p>
        </div>

        {endsAtDocumentEnd && (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            这个区间的终点落到了全篇末尾：这篇的目录在这一级之后已经没有同级的后面几章了（解析时常把后半本的章节层级压平）。
            要精确到本章末尾的话，先在目录编辑里把后续章节的层级改对，或者改用「正文里拖选一段」。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                {subject || '选择学科'}<ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {options.map((o) => (
                <DropdownMenuItem key={o.subject} onClick={() => { setPickedSubject(o.subject); setPickedKp('') }}>
                  {o.subject}
                  {o.subject === subject && <Check className="ml-auto h-4 w-4 text-green-600" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-72 gap-1 text-xs" disabled={!subject}>
                <span className="min-w-0 truncate">{kp || '选择知识点'}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {subjectKps.length === 0
                ? <div className="px-2 py-3 text-xs text-muted-foreground">该学科暂无知识点</div>
                : subjectKps.map((k) => (
                  <DropdownMenuItem key={k} onClick={() => setPickedKp(k)}>
                    <span className="min-w-0 flex-1 truncate">{k}</span>
                    {k === kp && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）：这一节里只有哪几段在讲这个知识点…"
          className="text-xs"
        />

        {duplicate
          ? <p className="text-xs text-amber-600 dark:text-amber-400">这一段已经挂在这个知识点上了。</p>
          : clashes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              这段还挂在 {clashes.map((c) => kpCode(c.kp)).join('、')} 上 —— 同一章讲两三个知识点是常事，能存。
            </p>
          )}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => void save()} disabled={saving || !subject || !kp || !!duplicate}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}圈上
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Props {
  documentId: string
  blocks: ResourceBlock[]
  toc: TocEntry[]
  canEdit: boolean
  scopes: ResourceKpScope[]
  loading: boolean
  error: string | null
  onLocate: (blockIndex: number) => void
  onChanged: () => void
  /** 正文拖选模式(拖选本身在阅读页那一侧接管, 这里只开关) */
  pickMode: boolean
  onPickModeChange: (on: boolean) => void
  /** 拖完得到的区间; 关掉对话框时由外层清空 */
  pickedRange: ScopeRange | null
  onPickedRangeDone: () => void
  onClose: () => void
}

export function KpScopePanel({
  documentId, blocks, toc, canEdit, scopes, loading, error,
  onLocate, onChanged, pickMode, onPickModeChange, pickedRange, onPickedRangeDone, onClose,
}: Props) {
  const [tocIndex, setTocIndex] = useState<number | null>(null)
  /** 从这里(按目录)算出来的区间 */
  const [range, setRange] = useState<ScopeRange | null>(null)
  /** 正文拖出来的那条优先: 它就是用户刚做的事 */
  const activeRange = pickedRange ?? range
  const [notice, setNotice] = useState<string | null>(null)

  const closeDialog = () => {
    setRange(null)
    onPickedRangeDone()
    onPickModeChange(false)
  }

  const openWithRange = (next: ScopeRange | null, emptyMessage: string) => {
    if (!next) { setNotice(emptyMessage); return }
    setNotice(null)
    setRange(next)
  }

  const remove = async (id: string) => {
    try {
      await deleteKpScope(id)
      onChanged()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">知识点范围</span>
        <span className="text-[10px] text-muted-foreground">{scopes.length} 段</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} title="关闭">
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          这一段正文讲的是哪个知识点。圈上之后，知识点解读、专题和路线图都能直接跳到这几段。
        </p>

        {canEdit && (
          <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/[0.04] p-2">
            <p className="text-[10px] font-medium text-muted-foreground">圈一段（管理员）</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 w-full justify-between gap-1 text-[11px]">
                  <span className="min-w-0 truncate">
                    {tocIndex === null ? '选一条目录项' : (toc[tocIndex]?.title || '(无标题)')}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-80 overflow-y-auto">
                {toc.map((entry, i) => (
                  <DropdownMenuItem
                    key={entry.key}
                    onClick={() => setTocIndex(i)}
                    className={cn(entry.level > 1 && 'pl-5')}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.title || '(无标题)'}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">P{entry.pageNo}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm" variant="outline" className="h-7 text-[11px]"
                disabled={tocIndex === null}
                title="从这条目录项的落点，一直圈到下一条目录项为止（可能只是这一小节）"
                onClick={() => openWithRange(
                  tocIndex === null ? null : scopeRangeFromToc(toc, tocIndex, blocks, 'section'),
                  '这条目录项没有可用的正文落点，请先在目录里给它映射一段',
                )}
              >
                圈到下一节
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-[11px]"
                disabled={tocIndex === null}
                title="从这条目录项的落点，一直圈到下一个同级或更高级目录项为止（整章含它下面的各小节）"
                onClick={() => openWithRange(
                  tocIndex === null ? null : scopeRangeFromToc(toc, tocIndex, blocks, 'subtree' as ScopeSpan),
                  '这条目录项没有可用的正文落点，请先在目录里给它映射一段',
                )}
              >
                含子节一起圈
              </Button>
              <Button
                size="sm" variant={pickMode ? 'default' : 'outline'} className="h-7 text-[11px]"
                onClick={() => onPickModeChange(!pickMode)}
                title="进入之后在正文里按住左键，从第一段拖到最后一段"
              >
                {pickMode ? '正在拖选…' : '正文里拖选一段'}
              </Button>
            </div>
            {notice && <p className="text-[10px] text-amber-600 dark:text-amber-400">{notice}</p>}
          </div>
        )}

        {loading && <p className="px-1 text-[11px] text-muted-foreground">加载中…</p>}
        {error && <p className="px-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        {!loading && scopes.length === 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">这一篇还没有圈过范围。</p>
        )}

        <div className="space-y-1">
          {scopes.map((scope) => (
            <div key={scope.id} className="rounded-md border border-primary/15 bg-background/60 px-1.5 py-1">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded bg-primary/10 px-1 text-[9px] font-medium text-primary">
                  {kpCode(scope.kp)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]" title={scope.kp}>{scope.kp}</span>
                <button
                  type="button"
                  onClick={() => onLocate(scope.blockFrom)}
                  className="shrink-0 text-[10px] text-primary hover:underline"
                >
                  看这段
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(scope.id)}
                    title="取消这个范围"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {scopeWhere(scope)}
                {scope.note && ` · ${scope.note}`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {activeRange && (
        <KpScopeDialog
          documentId={documentId}
          range={activeRange}
          endsAtDocumentEnd={blocks.length > 0 && activeRange.blockTo === blocks[blocks.length - 1].blockIndex}
          scopes={scopes}
          onClose={closeDialog}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}
