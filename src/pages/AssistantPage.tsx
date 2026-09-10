import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, GraduationCap, HeartHandshake, Info, Library, RotateCcw, Send, ShieldCheck,
  Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  FALLBACK_REPLY, MODE_LABEL, QUICK_PROMPTS, matchScript,
  type AssistantMode, type AssistantReply,
} from '@/lib/assistant-demo'
import { cn } from '@/lib/utils'

interface Turn {
  id: number
  role: 'user' | 'assistant'
  text: string
  sub?: string
  tags?: string[]
  sources?: AssistantReply['sources']
  followups?: string[]
}

const GREETING: Turn = {
  id: 0,
  role: 'assistant',
  text: '我是小刷。你可以跟我聊备考里的情绪问题，也可以直接问专业课知识点——我会去平台题库、专题和原始文献里找依据再回答你。',
  sub: '不太确定怎么开口的话，点下面任意一个话题试试；也可以直接说「操作系统 内存管理」这种「科目 + 章节」的格式。',
  tags: ['备考心理', '专业课答疑', '基于平台资料'],
}

const MODES: AssistantMode[] = ['auto', 'psych', 'study']

const SOURCE_TONE: Record<NonNullable<AssistantReply['sources']>[number]['type'], string> = {
  题库: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  专题: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  文献: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  真题: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

export function Component() {
  const [turns, setTurns] = useState<Turn[]>([GREETING])
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AssistantMode>('auto')
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const idRef = useRef(1)

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns, typing])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  function respond(text: string) {
    const script = matchScript(text, mode)
    const reply: AssistantReply = script?.reply ?? FALLBACK_REPLY
    const delay = 700 + Math.min(reply.text.length * 4, 1100)
    timerRef.current = window.setTimeout(() => {
      setTyping(false)
      setTurns((prev) => [
        ...prev,
        {
          id: idRef.current++,
          role: 'assistant',
          text: reply.text,
          sub: reply.sub,
          tags: reply.tags,
          sources: reply.sources,
          followups: reply.followups,
        },
      ])
    }, delay)
  }

  function send(text: string) {
    const value = text.trim()
    if (!value || typing) return
    setTurns((prev) => [...prev, { id: idRef.current++, role: 'user', text: value }])
    setInput('')
    setTyping(true)
    respond(value)
  }

  function reset() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setTyping(false)
    setTurns([GREETING])
    setInput('')
    idRef.current = 1
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="ai-ring relative inline-flex rounded-full p-[2px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background">
            <Sparkles className="h-5 w-5 text-primary" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            小刷
            <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            备考心理陪伴 + 基于平台题库与文献的专业课答疑
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    mode === item
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {MODE_LABEL[item]}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-[11px]" onClick={reset}>
              <RotateCcw className="mr-1 h-3 w-3" />
              清空
            </Button>
          </div>

          <div ref={scrollRef} className="h-[460px] space-y-4 overflow-y-auto p-5">
            {turns.map((turn) =>
              turn.role === 'user' ? (
                <div
                  key={turn.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-2 flex justify-end duration-300"
                >
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {turn.text}
                  </div>
                </div>
              ) : (
                <div
                  key={turn.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-2 flex items-start gap-2.5 duration-300"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
                    <p className="text-sm">{turn.text}</p>
                    {turn.sub && <p className="text-xs leading-relaxed text-muted-foreground">{turn.sub}</p>}

                    {turn.sources && turn.sources.length > 0 && (
                      <div className="space-y-1 rounded-lg border border-primary/20 bg-background/70 p-2">
                        <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                          <Library className="h-2.5 w-2.5" />
                          依据平台资料
                        </p>
                        {turn.sources.map((source) => (
                          <p key={source.label} className="flex items-center gap-1.5 text-[11px]">
                            <Badge
                              variant="secondary"
                              className={cn('shrink-0 border-transparent text-[9px] font-normal', SOURCE_TONE[source.type])}
                            >
                              {source.type}
                            </Badge>
                            <span className="min-w-0 truncate">{source.label}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {turn.tags && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {turn.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {turn.followups && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {turn.followups.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => send(item)}
                            className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {typing && (
              <div className="animate-in fade-in-0 flex items-start gap-2.5 duration-300">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t p-4">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.filter((prompt) => mode === 'auto' || prompt.mode === mode).map((prompt) => (
                <button
                  key={prompt.text}
                  type="button"
                  onClick={() => send(prompt.text)}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {prompt.mode === 'psych' ? (
                    <HeartHandshake className="h-3 w-3" />
                  ) : (
                    <GraduationCap className="h-3 w-3" />
                  )}
                  {prompt.text}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send(input)
                  }
                }}
                rows={2}
                placeholder="说说你现在的情况，或者直接问「操作系统 内存管理」这样的知识点…"
                className="min-h-[44px] flex-1 resize-none text-sm"
              />
              <Button size="sm" className="h-11 shrink-0" disabled={!input.trim() || typing} onClick={() => send(input)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                发送
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">小刷能做什么</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-1">
              <div className="flex gap-2.5">
                <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <div>
                  <p className="text-xs font-medium">备考心理陪伴</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    焦虑、拖延、失眠、与人比较、二战压力、想放弃——用结构化提问帮你把情绪落到可执行的一步。
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-medium">专业课答疑</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    基于平台题库、专题框架与原始文献作答，并标出依据来源，方便你顺着去刷对应的题。
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Link
                  to="/topics"
                  className="mt-0.5 inline-flex shrink-0 text-primary"
                  aria-label="前往专业专题"
                >
                  <GraduationCap className="h-4 w-4" />
                </Link>
                <div>
                  <p className="text-xs font-medium">转接到专题</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    问到某门课时，小刷引用的题库都能在
                    <Link to="/topics" className="mx-0.5 text-primary hover:underline">
                      专业专题
                    </Link>
                    里找到并直接练习。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                边界说明
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
              <p>· 小刷不是真人，也不是心理咨询师，回答基于固定规则与平台资料，可能出错。</p>
              <p>· 涉及专业课结论请以教材与真题为准，小刷给出的解析只作为思路提示。</p>
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                如果情绪低落、失眠或进食异常持续两周以上，请务必联系学校心理中心或专业机构，不要只依赖这里。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              DEMO：对话由内置剧本驱动，未接入真实模型，也不会保存任何聊天内容。
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
