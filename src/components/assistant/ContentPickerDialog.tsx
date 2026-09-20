/**
 * 「选择资料内容」弹窗 —— 出题的材料就在这儿挑。
 *
 * 三层对应三个粒度: 文献 → 章节 → 段落。勾一节等于勾它整段页码范围(不必把几百个 blockIndex
 * 塞进选中结果); 想更细就展开逐段勾。选中结果只记**页码区间 + 具体段号**, 所以"整节"和
 * "某一节里的三段"用的是同一套数据。
 *
 * 为什么不用下拉框选章节: 一本 295 页的书解析出近五百个标题, 下拉框翻不动; 而且用户要的是
 * "看着内容挑", 不是"看着标题猜"。
 *
 * 状态组织上刻意避开"在 effect 里同步 setState":
 *   · 每次打开都重新挂载 Body(key=generation), 初始状态直接取 props, 不需要"打开时重置"
 *   · 章节列表用 "docId 对得上才算数" 的派生值, 不需要"切文献时清空"
 *   · 模型预勾选的那一节是**算出来的**(preChecked), 用户取消掉的另记一个集合
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileText, Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ResourceBlock, TocSection } from '@/lib/resource-blocks'
import type { CreateSelection } from '@/lib/create-spec'
import { cn } from '@/lib/utils'
import { SeparatedList } from '@/components/ui/separated-list'

interface Doc { id: string; title: string }

interface BodyProps {
  documents: Doc[]
  initialDocumentId: string | null
  initialSelection: CreateSelection | null
  onConfirm: (selection: CreateSelection | null) => void
  onClose: () => void
}

function PickerBody({ documents, initialDocumentId, initialSelection, onConfirm, onClose }: BodyProps) {
  const [docId, setDocId] = useState(initialDocumentId ?? documents[0]?.id ?? '')
  const [sectionsState, setSectionsState] = useState<{ docId: string; list: TocSection[] } | null>(null)
  /** 展开的是哪一节; key 里带上 docId, 换文献就不必重置 */
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  /** 正文缓存按 "docId:节key" 存 —— block_index 每篇各算各的, 混用会串 */
  const [blockCache, setBlockCache] = useState<Record<string, ResourceBlock[]>>({})
  /** 用户取消掉的整节勾选 */
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set())
  /** 用户自己额外勾上的整节 —— 只有"预勾选 + 取消"两个集合的话, 点一节没预选的会毫无反应 */
  const [extra, setExtra] = useState<Set<number>>(new Set())
  const [checkedBlocks, setCheckedBlocks] = useState<Set<number>>(new Set(initialSelection?.blocks ?? []))

  useEffect(() => {
    let cancelled = false
    void import('@/lib/resource-library')
      .then(async ({ loadDocumentSections }) => {
        const list = await loadDocumentSections(docId).catch(() => [])
        if (!cancelled) setSectionsState({ docId, list })
      })
      .catch(() => { /* 读不到目录就当这篇没有章节可选 */ })
    return () => { cancelled = true }
  }, [docId])

  const loaded = sectionsState?.docId === docId ? sectionsState.list : null
  // memo 化: 否则每次渲染都是新数组, 下面几个 useMemo 会白算一遍
  const sections = useMemo(() => loaded ?? [], [loaded])
  const keyOf = (section: TocSection) => `${docId}:${section.key}`

  /** 模型从自然语言里预选的那一节: 页码区间被它覆盖就算它 */
  const preChecked = useMemo(() => {
    if (!loaded || !initialSelection) return new Set<number>()
    if (initialSelection.documentId !== docId) return new Set<number>()
    // blocks 非空 = 精确到段, 就不预勾整节了
    if (initialSelection.blocks.length > 0) return new Set<number>()
    const hit = loaded.find((s) => s.pageFrom <= initialSelection.from && s.pageTo >= initialSelection.to)
      ?? loaded.find((s) => s.title === initialSelection.label)
    return hit ? new Set([hit.key]) : new Set<number>()
  }, [loaded, initialSelection, docId])

  const checkedSections = useMemo(
    () => new Set([...[...preChecked, ...extra]].filter((k) => !unchecked.has(k))),
    [preChecked, extra, unchecked],
  )

  const expand = async (section: TocSection) => {
    const cacheKey = keyOf(section)
    setExpandedKey((prev) => (prev === cacheKey ? null : cacheKey))
    if (blockCache[cacheKey]) return
    const { loadDocumentBlocks } = await import('@/lib/resource-library')
    const blocks = await loadDocumentBlocks(docId, { from: section.pageFrom, to: section.pageTo })
    setBlockCache((prev) => ({ ...prev, [cacheKey]: blocks.filter((b) => b.text.trim().length > 0) }))
  }

  /**
   * 勾整节和勾具体段落是**互斥**的。
   *
   * 选中结果里 "blocks 为空 = 整个页码区间", 一旦同一份选择里既有整节又有零散段落, 就没法
   * 表达"这一节全部 + 那一节里三段", 只能二选一。与其留个会静默丢内容的坑, 不如让界面
   * 直接不允许混着勾。
   */
  const toggleSection = (section: TocSection) => {
    const on = checkedSections.has(section.key)
    if (on) {
      // 取消: 预勾选记进 unchecked, 自己勾的从 extra 里撤掉
      setUnchecked((prev) => new Set([...prev, section.key]))
      setExtra((prev) => { const next = new Set(prev); next.delete(section.key); return next })
    } else {
      setUnchecked((prev) => { const next = new Set(prev); next.delete(section.key); return next })
      setExtra((prev) => new Set([...prev, section.key]))
      setCheckedBlocks(new Set())
    }
  }

  const toggleBlock = (blockIndex: number) => {
    const willCheck = !checkedBlocks.has(blockIndex)
    setCheckedBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
    // 勾段落就把整节都松开 —— 两者互斥
    if (willCheck) {
      setUnchecked(new Set(sections.map((s) => s.key)))
      setExtra(new Set())
    }
  }

  /** 勾中的整节 / 单独勾的段落 → 一份统一的选中结果 */
  const selection = useMemo((): CreateSelection | null => {
    const doc = documents.find((d) => d.id === docId)
    if (!doc) return null

    const pages = new Set<number>()
    const labels: string[] = []
    for (const key of checkedSections) {
      const section = sections.find((s) => s.key === key)
      if (!section) continue
      labels.push(section.title)
      for (let p = section.pageFrom; p <= section.pageTo; p++) pages.add(p)
    }

    const loose = [...checkedBlocks].sort((a, b) => a - b)
    for (const cacheKey of Object.keys(blockCache)) {
      if (!cacheKey.startsWith(`${docId}:`)) continue
      for (const b of blockCache[cacheKey]) if (checkedBlocks.has(b.blockIndex)) pages.add(b.pageNo)
    }

    const all = [...pages]
    if (labels.length === 0 && loose.length === 0) return null
    if (all.length === 0) return null

    return {
      documentId: doc.id,
      documentTitle: doc.title,
      label: labels.length === 0
        ? '自定义段落'
        : labels.length === 1 ? labels[0] : `${labels[0]} 等 ${labels.length} 节`,
      from: Math.min(...all),
      to: Math.max(...all),
      // 勾了整节时 loose 必然是空的 → blocks 为空 = "整个页码区间"
      blocks: loose,
    }
  }, [documents, docId, checkedSections, sections, checkedBlocks, blockCache])

  const summary = useMemo(() => {
    if (!selection) return []
    const pages = selection.to > selection.from ? `第 ${selection.from}-${selection.to} 页` : `第 ${selection.from} 页`
    const parts = [pages]
    if (checkedSections.size > 0) parts.push(`${checkedSections.size} 节`)
    if (selection.blocks.length > 0) parts.push(`${selection.blocks.length} 段`)
    return parts
  }, [selection, checkedSections])

  return (
    <>
      <div className="flex items-center gap-2">
        <Select value={docId} onValueChange={setDocId}>
          <SelectTrigger aria-label="文献" className="h-8 flex-1 text-xs"><SelectValue placeholder="选择文献" /></SelectTrigger>
          <SelectContent>
            {documents.map((d) => <SelectItem key={d.id} value={d.id} className="text-xs">{d.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant="outline" className="h-8 shrink-0 text-xs"
          disabled={sections.length === 0}
          onClick={() => { setExtra(new Set(sections.map((s) => s.key))); setUnchecked(new Set()); setCheckedBlocks(new Set()) }}
        >
          全选本篇
        </Button>
        <Button
          size="sm" variant="ghost" className="h-8 shrink-0 text-xs"
          onClick={() => { setUnchecked(new Set(sections.map((s) => s.key))); setExtra(new Set()); setCheckedBlocks(new Set()) }}
        >
          清空
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {loaded === null ? (
          <p className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />正在读目录…
          </p>
        ) : sections.length === 0 ? (
          <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
            这篇文献没有解析出目录，没法按章节挑。可以改用「跨来源检索」出题，或者先把文献重新解析一遍。
          </p>
        ) : (
          sections.map((section) => {
            const cacheKey = keyOf(section)
            const isOpen = expandedKey === cacheKey
            const blocks = blockCache[cacheKey]
            const pages = section.pageTo > section.pageFrom
              ? `第 ${section.pageFrom}-${section.pageTo} 页`
              : `第 ${section.pageFrom} 页`
            const sectionChecked = checkedSections.has(section.key)
            return (
              <div key={section.key} className="border-b last:border-b-0">
                <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                    checked={sectionChecked}
                    onChange={() => toggleSection(section)}
                    aria-label={`章节 ${section.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => void expand(section)}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  >
                    <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                    <span
                      className="min-w-0 flex-1 truncate text-[11px]"
                      style={{ paddingLeft: `${Math.min(Math.max(section.level - 1, 0), 3) * 10}px` }}
                    >
                      {section.title}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{pages}</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-0.5 bg-muted/30 px-2 py-1.5">
                    {!blocks ? (
                      <p className="text-[10px] text-muted-foreground">正在读取正文…</p>
                    ) : blocks.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">这一节没有正文区块（可能只是目录或标题）。</p>
                    ) : blocks.map((b) => (
                      <label key={b.blockIndex} className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-accent/60">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3 w-3 shrink-0 accent-primary"
                          checked={checkedBlocks.has(b.blockIndex)}
                          disabled={sectionChecked}
                          onChange={() => toggleBlock(b.blockIndex)}
                          aria-label={`段落 第 ${b.pageNo} 页`}
                        />
                        <span className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">
                          <span className="mr-1 text-foreground/50">p{b.pageNo}</span>
                          {b.text.slice(0, 110)}{b.text.length > 110 ? '…' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          {selection ? <>已选 <SeparatedList items={summary} /></> : '至少勾一节或一段'}
        </span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { onConfirm(null); onClose() }}>清掉选择</Button>
          <Button size="sm" disabled={!selection} onClick={() => { onConfirm(selection); onClose() }}>确定</Button>
        </span>
      </DialogFooter>
    </>
  )
}

export function ContentPickerDialog({ open, onOpenChange, documents, initialDocumentId, initialSelection, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: Doc[]
  initialDocumentId: string | null
  initialSelection: CreateSelection | null
  onConfirm: (selection: CreateSelection | null) => void
}) {
  // 每次打开换一个 key, 让 Body 重新挂载 —— 于是"按外面传进来的预选初始化"就是普通的
  // useState 初值, 不需要在 effect 里同步 setState
  const [generation, setGeneration] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setGeneration((g) => g + 1)
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            选择资料内容
          </DialogTitle>
          <DialogDescription className="text-xs">
            勾一节就会带上它整段页码范围；想更细可以展开逐段勾。出的题就按你勾的这些内容来。
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PickerBody
            key={generation}
            documents={documents}
            initialDocumentId={initialDocumentId}
            initialSelection={initialSelection}
            onConfirm={onConfirm}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
