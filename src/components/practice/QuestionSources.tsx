/**
 * 题面下方的「问小Q」+「关联信源」那一条。
 *
 * 为什么挂在练习页而不是 QuestionCard 里: 考试、结果回顾、错题本都用同一个 QuestionCard,
 * 而"问小Q 解释本题 / 往这道题上挂信源"是练习模式才成立的事(考试中给答案解释等于作弊)。
 * 这里自带数据加载与增删, 所以两个练习界面(经典版与顺序刷题新版)都只是插一行。
 *
 * 反向那条边(信源 → 题目)不在这里: 见 components/questions/LinkedQuestions。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Link2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { LinkedQuestions } from '@/components/questions/LinkedQuestions'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { buildQuestionContext } from '@/lib/ai/question-context'
import { searchKnowledge, type RagHit } from '@/lib/rag'
import { useAssistantStore } from '@/stores/assistant-store'
import { cn } from '@/lib/utils'
import {
  dedupeDrafts, draftFromHit, draftKey, linkedKeys, linkTitle, sourceLabel,
  type QuestionSourceLink,
} from '@/lib/question-links'
import { addQuestionLinks, listQuestionLinks, removeQuestionLink } from '@/lib/question-links-store'
import type { CorrectAnswer, Question } from '@/types'

/** 打开面板时替用户问的那一句: 点的是「解释本题」, 不是「打开一个空对话框」 */
const ASK_PROMPT = '解释一下这道题：为什么是这个答案，我容易错在哪一步？'

interface PickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  linked: Set<string>
  onConfirm: (drafts: ReturnType<typeof draftFromHit>[]) => Promise<void>
}

/** 挑信源: 一次检索把五类都捞回来(走的就是小Q 那条链路), 勾完一次挂上 */
function SourcePickerDialog({ open, onOpenChange, linked, onConfirm }: PickerProps) {
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<RagHit[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  /**
   * 关掉就清干净: 下次打开不该还留着上一次的勾。
   * 放在关闭回调里而不是 effect 里 —— effect 里同步 setState 会多渲染一轮(见 eslint 的
   * set-state-in-effect), 而这里本来就是"关闭"这个动作的一部分。
   */
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (next) return
    setKeyword(''); setHits([]); setPicked(new Set()); setMessage(null)
  }

  const runSearch = async () => {
    const query = keyword.trim()
    if (!query) return
    setSearching(true)
    setMessage(null)
    try {
      const result = await searchKnowledge(query, { limit: 20 })
      setHits(result.hits)
      setPicked(new Set())
      if (result.hits.length === 0) setMessage('没有搜到可挂的内容，换个说法再试（比如那个概念的原文说法）。')
      else if (result.error) setMessage(`向量检索不可用，这次只走了全文匹配：${result.error}`)
    } catch (err) {
      setHits([])
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  const confirm = async () => {
    const drafts = hits.filter((_, i) => picked.has(i)).map((hit) => draftFromHit(hit))
    if (drafts.length === 0) return
    setSaving(true)
    try {
      await onConfirm(drafts)
      handleOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>关联信源</DialogTitle>
          <DialogDescription>
            在平台文献、知识点解读、学科解读、公开笔记和题库里搜一段内容挂到这道题上；之后在那段内容里也能看到这道题。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch() } }}
            placeholder="比如：肾小球滤过率、PV 操作的原子性…"
          />
          <Button onClick={() => void runSearch()} disabled={searching || !keyword.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
          </Button>
        </div>

        {message && <p className="text-xs text-muted-foreground">{message}</p>}

        {hits.length > 0 && (
          <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {hits.map((hit, i) => {
              const draft = draftFromHit(hit)
              const already = linked.has(draftKey(draft))
              return (
                <label
                  key={`${hit.id}-${i}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5',
                    already ? 'border-border/60 bg-muted/40 opacity-70' : 'border-border hover:border-primary/40',
                  )}
                >
                  <Checkbox
                    checked={already || picked.has(i)}
                    disabled={already}
                    onCheckedChange={(v) => {
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (v === true) next.add(i)
                        else next.delete(i)
                        return next
                      })
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="border-transparent bg-primary/10 text-[10px] font-normal text-primary">
                        {sourceLabel(hit.source)}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs">{hit.label || '（无标题）'}</span>
                      {hit.pageNo !== null && (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">第 {hit.pageNo} 页</span>
                      )}
                      {already && <span className="shrink-0 text-[10px] text-muted-foreground">已挂</span>}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {hit.content.replace(/\s+/g, ' ').trim().slice(0, 160)}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>取消</Button>
          <Button onClick={() => void confirm()} disabled={saving || picked.size === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            挂上 {picked.size > 0 ? `(${picked.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Props {
  question: Question
  selectedAnswer?: CorrectAnswer | null
}

export function QuestionSources({ question, selectedAnswer }: Props) {
  const openForQuestion = useAssistantStore((s) => s.openForQuestion)
  const [links, setLinks] = useState<QuestionSourceLink[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 展开的那条(看摘录) */
  const [openId, setOpenId] = useState<string | null>(null)
  /** 增删之后要求重读一次 —— 比在增删里各写一遍 setLinks 少一处"忘了同步"的机会 */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    // 读不到只是这一块空着, 不该把整道题弄成错误页
    void (async () => {
      try {
        const rows = await listQuestionLinks(question.id)
        if (!cancelled) { setLinks(rows); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { cancelled = true }
  }, [question.id, version])

  const ask = () => {
    void openForQuestion({
      id: question.id,
      stem: question.question_text.replace(/\s+/g, ' ').trim(),
      context: buildQuestionContext(question, selectedAnswer),
    }, ASK_PROMPT)
  }

  const add = async (drafts: ReturnType<typeof draftFromHit>[]) => {
    await addQuestionLinks(question.id, dedupeDrafts(drafts))
    setVersion((v) => v + 1)
  }

  const remove = async (id: string) => {
    await removeQuestionLink(id)
    setVersion((v) => v + 1)
  }

  return (
    <div className="space-y-2 rounded-xl border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={ask}>
          问小Q解释本题
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Link2 className="h-3 w-3" />
          关联信源{links.length > 0 ? `（${links.length}）` : ''}
        </span>
        {links.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            问完小Q 可以把它的依据挂上来，也可以自己搜
          </span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />添加
        </Button>
      </div>

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((link) => (
            <div key={link.id} className="rounded-md border border-border/70 bg-background/60">
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setOpenId((cur) => (cur === link.id ? null : link.id))}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <Badge variant="secondary" className="shrink-0 border-transparent bg-primary/10 px-1 py-0 text-[9px] font-normal leading-4 text-primary">
                    {sourceLabel(link.source)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{linkTitle(link)}</span>
                  {link.origin === 'littleq' && (
                    <span className="shrink-0 text-[9px] text-muted-foreground">小Q 挂的</span>
                  )}
                  <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', openId === link.id && 'rotate-90')} />
                </button>
                {link.anchor && (
                  <Link to={link.anchor} className="shrink-0 text-[10px] text-primary hover:underline">看原文</Link>
                )}
                <button
                  type="button"
                  onClick={() => void remove(link.id)}
                  title="取消关联"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {openId === link.id && link.snippet && (
                <p className="border-t border-border/60 px-1.5 py-1 text-[10px] leading-relaxed text-muted-foreground">
                  {link.snippet}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <SourcePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        linked={linkedKeys(links)}
        onConfirm={add}
      />

      {/* 反过来的那一头: 哪几道题把这道题当成它们的信源(相关题) */}
      <LinkedQuestions source="question" sourceId={question.id} title="关联到本题的其他题" />
    </div>
  )
}
