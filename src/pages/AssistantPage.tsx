import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, GraduationCap, HeartHandshake, Info, Library, MousePointer2, RotateCcw, Send, ShieldCheck,
  Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { LittleQAvatar } from '@/components/assistant/LittleQAvatar'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  FALLBACK_EMOTION, FALLBACK_REPLY, MODE_LABEL, QUICK_PROMPTS, matchScript,
  type AssistantMode, type AssistantReply, type LittleQEmotion,
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
  text: '我是小Q。你可以跟我聊备考里的情绪问题，也可以直接问专业课知识点——我会去平台题库、专题和原始文献里找依据再回答你。',
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

const STATUS_TEXT: Record<LittleQEmotion, string> = {
  neutral: '在听你说',
  happy: '心情不错，讲得正起劲',
  concerned: '在认真听你说',
  thinking: '在想怎么回答你',
}

export function Component() {
  const [turns, setTurns] = useState<Turn[]>([GREETING])
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AssistantMode>('auto')
  const [emotion, setEmotion] = useState<LittleQEmotion>('happy')
  const [nudge, setNudge] = useState(0)
  const [listening, setListening] = useState(false)
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
    const nextEmotion = script?.emotion ?? FALLBACK_EMOTION
    const delay = 700 + Math.min(reply.text.length * 4, 1100)
    timerRef.current = window.setTimeout(() => {
      setTyping(false)
      setEmotion(nextEmotion)
      setNudge((value) => value + 1)
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
    setEmotion('thinking')
    setNudge((value) => value + 1)
    respond(value)
  }

  function reset() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setTyping(false)
    setTurns([GREETING])
    setInput('')
    setEmotion('happy')
    idRef.current = 1
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="ai-ring relative inline-flex rounded-full p-[2px]">
          <img src="/logo.webp" alt="" aria-hidden="true" className="h-11 w-11 rounded-full object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            小Q
            <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            备考心理陪伴 + 基于平台题库与文献的专业课答疑
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-b from-sky-50 via-violet-50 to-rose-50 shadow-xl shadow-primary/5 dark:from-sky-950/30 dark:via-violet-950/20 dark:to-rose-950/20">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 top-8 h-40 w-40 rounded-full bg-sky-300/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 bottom-6 h-44 w-44 rounded-full bg-rose-300/20 blur-3xl"
            />
            <LittleQAvatar
              speaking={typing}
              listening={listening}
              emotion={emotion}
              nudge={nudge}
              className="h-[340px] sm:h-[400px] lg:h-[440px]"
            />
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  typing ? 'animate-pulse bg-primary' : 'bg-emerald-500',
                )}
              />
              {typing ? '正在组织语言…' : STATUS_TEXT[emotion]}
            </div>
            <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
              <div className="rounded-2xl border bg-background/80 px-3 py-2 backdrop-blur">
                <p className="text-sm font-semibold leading-none">小Q</p>
                <p className="mt-1 text-[10px] leading-none text-muted-foreground">备考搭子 · 不会催你</p>
              </div>
            </div>
          </div>
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <MousePointer2 className="h-3 w-3" />
            她一直在呼吸和眨眼；你打字时她会专注听，她思考时食指会抵在嘴边，讲到开心处会捂嘴笑。
          </p>
        </div>

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

          <div ref={scrollRef} className="h-[420px] space-y-4 overflow-y-auto p-5 lg:h-[460px]">
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
                  <img
                    src="/logo.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
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
                <img
                  src="/logo.webp"
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
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
                onFocus={() => setListening(true)}
                onBlur={() => setListening(false)}
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">小Q能做什么</CardTitle>
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
              <Link to="/topics" className="mt-0.5 inline-flex shrink-0 text-primary" aria-label="前往专业专题">
                <GraduationCap className="h-4 w-4" />
              </Link>
              <div>
                <p className="text-xs font-medium">转接到专题</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  问到某门课时，小Q引用的题库都能在
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
            <p>· 小Q不是真人，也不是心理咨询师，回答基于固定规则与平台资料，可能出错。</p>
            <p>· 涉及专业课结论请以教材与真题为准，小Q给出的解析只作为思路提示。</p>
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              如果情绪低落、失眠或进食异常持续两周以上，请务必联系学校心理中心或专业机构，不要只依赖这里。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              为什么她会长这样
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              左侧的小Q是平台品牌形象
              <span className="mx-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">littleQ.png</span>
              实时渲染的 Live2D 皮套：眨眼、呼吸、口型和跟随鼠标的转头都是实时算出来的。
            </p>
            <p>对话仍是内置剧本驱动，角色反应只反映「正在思考 / 正在回答」这类状态，不代表真实情绪判断。</p>
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              DEMO：未接入真实模型，也不会保存任何聊天内容。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
