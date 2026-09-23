/**
 * 「从资料库找依据」—— 管理员按关键词搜文献正文, 勾中命中的段落当依据。
 *
 * 为什么不能只靠"按章节挑"(ContentPickerDialog): 管理员手里通常只有知识点名字, 不知道该去
 * 哪本书的哪一章找; 而资料库的正文检索本来就是按子串命中的, 拿知识点当关键词一搜就能落到
 * 具体那几段。两条路都留着: 搜到了直接勾, 心里有数哪一章就整节整节地挑。
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { HighlightText } from '@/components/resource/HighlightText'
import { searchBlocks, type BlockHit } from '@/lib/resource-search'
import { fallbackTermForKp, searchTermForKp, type KpRefDraft } from '@/lib/kp-resource-refs'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 用来生成默认关键词: 知识点编码剥掉前缀之后的那部分 */
  kp: string
  onAdd: (drafts: KpRefDraft[]) => void
}

const hitKey = (h: BlockHit) => `${h.documentId}:${h.blockIndex}`

function PickerBody({ kp, onAdd, onClose }: { kp: string; onAdd: (d: KpRefDraft[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState(() => searchTermForKp(kp))
  /**
   * 结果连"它属于哪个关键词"一起存: 关键词一变旧结果自动失效(派生值), 于是"还没搜"就等于
   * result 为 null, 不必在 effect 里同步 setState 去清空 —— 那样每次输入都多渲一轮。
   */
  const [result, setResult] = useState<{ query: string; hits: BlockHit[]; error: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Map<string, BlockHit>>(new Map())
  /** 请求按序号作废: 手快连打几个字时, 先发的慢请求回来不能覆盖后发的结果 */
  const seq = useRef(0)

  const q = query.trim()
  const current = result && result.query === q ? result : null
  const hits = current?.hits ?? []
  const error = current?.error ?? null
  const searched = current !== null

  useEffect(() => {
    if (!q) return
    const mine = ++seq.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchBlocks(q, { limit: 30 })
        .then((list) => {
          if (mine !== seq.current) return
          setResult({ query: q, hits: list, error: null })
        })
        .catch((err: unknown) => {
          if (mine !== seq.current) return
          setResult({ query: q, hits: [], error: err instanceof Error ? err.message : String(err) })
        })
        .finally(() => { if (mine === seq.current) setLoading(false) })
    }, 300)
    return () => { window.clearTimeout(timer) }
  }, [q])

  const toggle = (hit: BlockHit) => {
    setPicked((prev) => {
      const next = new Map(prev)
      const key = hitKey(hit)
      if (next.has(key)) next.delete(key)
      else next.set(key, hit)
      return next
    })
  }

  const selected = [...picked.values()]
  const fallback = searched && hits.length === 0 ? fallbackTermForKp(q) : null

  const confirm = () => {
    onAdd(selected.map((h) => ({
      documentId: h.documentId,
      docTitle: h.docTitle,
      // 搜索挑的是单段, 没有章节名可写: 摘录(服务端补)才是这条依据的说明
      label: '',
      pageFrom: h.pageNo,
      pageTo: h.pageNo,
      blocks: [h.blockIndex],
      note: '',
    })))
    onClose()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜文献正文的关键词, 如「死锁」「内存管理」"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {error ? (
          <p className="px-3 py-4 text-[11px] text-destructive">{error}</p>
        ) : !q ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            中文按子串匹配, 两个字也能搜
          </p>
        ) : !searched ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">正在检索…</p>
        ) : hits.length === 0 ? (
          <div className="space-y-2 px-3 py-6 text-center">
            <p className="text-[11px] text-muted-foreground">没有命中</p>
            {fallback && (
              <Button size="sm" variant="outline" className="text-[11px]" onClick={() => setQuery(fallback)}>
                改用「{fallback}」再搜一次
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 p-1.5">
            {hits.map((hit) => {
              const key = hitKey(hit)
              const on = picked.has(key)
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 transition-colors ${on ? 'bg-primary/10' : 'hover:bg-accent/60'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                    checked={on}
                    onChange={() => toggle(hit)}
                    aria-label={`${hit.docTitle} 第 ${hit.pageNo} 页`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="rounded bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">
                        P{hit.pageNo}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{hit.docTitle}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-[11px] leading-snug">
                      <HighlightText text={hit.snippet} query={query.trim()} />
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {picked.size > 0 ? `已选 ${picked.size} 段` : '勾中命中的段落即可作为依据'}
        </span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>取消</Button>
          <Button size="sm" disabled={picked.size === 0} onClick={confirm}>加入依据</Button>
        </span>
      </DialogFooter>
    </>
  )
}

export function KpRefPickerDialog({ open, onOpenChange, kp, onAdd }: Props) {
  // 每次打开换 key 重挂载: 初始关键词与勾选状态就都是普通的 useState 初值, 不必写"打开时重置"
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
            <Search className="h-4 w-4" />
            从资料库找依据
          </DialogTitle>
          <DialogDescription className="text-xs">
            关键词已按知识点名字填好, 可以直接搜。命中的段落勾上就是这条解读的依据, 保存后读者能在解读里点回原文核对。
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PickerBody
            key={generation}
            kp={kp}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
