/**
 * 小Q 的对话区 —— /assistant 页和全局悬浮面板共用同一个组件。
 *
 * 抽出来不是为了省行数, 是为了让两条入口的对话**就是同一份**: 之前对话状态住在
 * AssistantPage 里, 想在阅读文献时问一句就只能跳走, 回来还得重问。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Coins, GraduationCap, HeartHandshake, Library, Send, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommandPalette } from '@/components/assistant/CommandPalette'
import { ExportCard, HelpCard, SkillCard } from '@/components/assistant/CommandCards'
import { CreateCard } from '@/components/assistant/CreateCard'
import { ReadAloudButton, SpeechSettings } from '@/components/tts/ReadAloudButton'
import { assistantSpeech } from '@/lib/tts/assistant'
import { useAssistantStore, type ChatMessage } from '@/stores/assistant-store'
import { commandPrefix, matchCommands, parseCommand, type CommandSpec } from '@/lib/assistant-commands'
import {
  costOfRound, formatCost, formatTokens, loadAiPriceMap, sumRounds,
  type AiPriceMap, type AiRoundUsage,
} from '@/lib/ai-usage'
import {
  MODE_LABEL, QUICK_PROMPTS, type AssistantMode, type AssistantReply, type LittleQEmotion,
} from '@/lib/assistant-demo'
import { cn } from '@/lib/utils'

const MODES: AssistantMode[] = ['auto', 'psych', 'study']

const SOURCE_TONE: Record<NonNullable<AssistantReply['sources']>[number]['type'], string> = {
  题库: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  专题: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  文献: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  真题: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  笔记: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const STATUS_TEXT: Record<LittleQEmotion, string> = {
  neutral: '在听你说',
  happy: '心情不错，讲得正起劲',
  concerned: '在认真听你说',
  thinking: '在想怎么回答你',
}

const GREETING = {
  content: '我是小Q。你可以跟我聊备考里的情绪问题，也可以直接问专业课知识点——我会去平台文献、题库、专题和公开笔记里找依据再回答你。',
  sub: '不太确定怎么开口的话，点下面任意一个话题试试；也可以直接说「操作系统 内存管理」这种「科目 + 章节」的格式。',
  tags: ['备考心理', '专业课答疑', '基于平台资料'],
}

/**
 * 引用条目: 点一下展开检索到的原文片段, 有 anchor 的还能直接跳到出处。
 * 展开原文是刻意的 —— 让用户能当场核对答案有没有依据, 而不是只能相信标注。
 *
 * 展开与否由外面管(受控): 正文里点 [n] 要能就地把它展开, 状态只能有一份。
 * 左边那个 [n] 是**正文里那个编号**: 少了它, 正文写着「……[7]」而下面这张清单一个号都没有,
 * 用户没法知道说的是哪一条 —— 清单的顺序是检索序号, 不等于它在列表里的位置。
 */
function SourceChip({ source, open, onToggle, onNavigate }: {
  source: NonNullable<AssistantReply['sources']>[number]
  open: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  return (
    <div
      // 正文点 [n] 时靠它找过来 —— 用一个属性而不是 ref 表: 一张清单里的 ref 回调
      // 是在渲染期建的, 在里面读写 ref 正是 React Compiler 不让做的事
      data-cite={source.index}
      className={cn(
        'rounded-md border bg-background/60 transition-colors',
        // 从正文点进来的那条会一直亮着, 直到点别处 —— 否则滚过去也不知道是哪一条
        open ? 'border-primary/40 ring-1 ring-primary/25' : 'border-primary/15',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
      >
        {source.index !== undefined && (
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-primary">[{source.index}]</span>
        )}
        <Badge
          variant="secondary"
          className={cn('shrink-0 border-transparent text-[9px] font-normal', SOURCE_TONE[source.type])}
        >
          {source.type}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[11px]">{source.label}</span>
        {source.anchor && (
          <Link
            to={source.anchor}
            onClick={(e) => { e.stopPropagation(); onNavigate?.() }}
            className="shrink-0 text-[10px] text-primary hover:underline"
          >
            看原文
          </Link>
        )}
        <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && source.snippet && (
        <p className="border-t border-primary/10 px-1.5 py-1 text-[10px] leading-relaxed text-muted-foreground">
          {source.snippet}
        </p>
      )}
    </div>
  )
}

/**
 * 回答的一段文字, 其中 [n] 是可点的。
 *
 * 点了就地展开下面那条依据并滚过去 —— 编号和条目隔着几行, 让用户自己上下找,
 * 标了号也等于没标。对不上任何一条的编号(检索越界被丢掉的)原样显示, 不做成按不动的假按钮。
 */
function CitedText({ text, sources, onJump, className }: {
  text: string
  sources: NonNullable<AssistantReply['sources']> | null | undefined
  onJump: (index: number) => void
  className?: string
}) {
  const has = (index: number) => !!sources?.some((source) => source.index === index)
  return (
    <p className={className}>
      {text.split(/(\[\d{1,2}\])/g).map((part, i) => {
        const match = /^\[(\d{1,2})\]$/.exec(part)
        const index = match ? Number(match[1]) : null
        if (index === null || !has(index)) return part
        return (
          <button
            key={`${index}-${i}`}
            type="button"
            onClick={() => onJump(index)}
            title={`展开依据 [${index}]`}
            className="mx-0.5 rounded bg-primary/10 px-1 text-[10px] font-medium tabular-nums text-primary transition-colors hover:bg-primary/20"
          >
            [{index}]
          </button>
        )
      })}
    </p>
  )
}

/** 指令产物卡片: meta 是判别联合, 这里就是那一个 switch */
function MetaCard({ message, onPickCommand }: { message: ChatMessage; onPickCommand: (command: string) => void }) {
  const meta = message.meta
  if (!meta) return null
  switch (meta.kind) {
    case 'create-draft':
      return <CreateCard messageId={message.id} meta={meta} />
    case 'skill':
      return <SkillCard meta={meta} />
    case 'export':
      return <ExportCard meta={meta} />
    case 'help':
      return <HelpCard onPickCommand={onPickCommand} />
  }
}

/**
 * 这一轮花了多少。
 *
 * 只挂在模型真答过的消息上(内置剧本回答没有 usage), 也不显示"0 tokens":
 * 一次调用没记到用量时宁可不显示, 也不要给一个看着像真的零。
 */
function RoundUsageLine({ usage, prices }: { usage: AiRoundUsage; prices: AiPriceMap }) {
  if (usage.totalTokens <= 0) return null
  const cost = costOfRound(usage, prices)
  return (
    <p
      className="flex flex-wrap items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
      title={[
        `输入 ${formatTokens(usage.promptTokens)} · 输出 ${formatTokens(usage.completionTokens)}`,
        usage.model && `模型 ${usage.model}`,
        cost === null && '这个模型在 ai_model_prices 里没有单价, 不计成本',
      ].filter(Boolean).join(' · ')}
    >
      <Coins className="h-2.5 w-2.5" />
      本轮 {formatTokens(usage.totalTokens)} tokens
      <span aria-hidden="true">·</span>
      {cost === null ? <span className="text-amber-600 dark:text-amber-400">未定价</span> : formatCost(cost)}
    </p>
  )
}

function MessageBody({ message, prices, onNavigate, onPickCommand }: {
  message: ChatMessage
  prices: AiPriceMap
  onNavigate?: () => void
  onPickCommand: (command: string) => void
}) {
  /** 展开的是哪一条依据(按编号); null = 都收着 */
  const [openSource, setOpenSource] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sources = message.sources

  /**
   * 正文里点了 [n]: 展开那条依据并滚过去。
   *
   * 滚动放在下一帧: 展开会改变高度, 这一帧里那个盒子还在原位, 立刻滚会滚偏。
   * 不用 effect 收尾是为了不引入"渲染完再改状态"那一轮。
   */
  function jumpToSource(index: number) {
    setOpenSource(index)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-cite="${index}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  return (
    <>
      <CitedText text={message.content} sources={sources} onJump={jumpToSource} className="text-sm" />
      <MetaCard message={message} onPickCommand={onPickCommand} />
      {message.sub && (
        <CitedText
          text={message.sub}
          sources={sources}
          onJump={jumpToSource}
          className="text-xs leading-relaxed text-muted-foreground"
        />
      )}

      {sources && sources.length > 0 && (() => {
        const numbered = sources.some((source) => source.index !== undefined)
        // 正文与补充说明里一个 [n] 都没有 = 模型这次没标; 那清单上的号就没处可对, 得说一声
        const marked = /\[\d{1,2}\]/.test(`${message.content}\n${message.sub ?? ''}`)
        return (
          <div ref={listRef} className="space-y-1 rounded-lg border border-primary/20 bg-background/70 p-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Library className="h-2.5 w-2.5" />
              {numbered ? '依据平台资料（点正文里的 [n] 或点这里都能展开原文）' : '依据平台资料（点开可核对原文）'}
            </p>
            {numbered && !marked && (
              <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                这条正文没标编号，下面是它实际用到的资料。
              </p>
            )}
            {sources.map((source, i) => (
              <SourceChip
                key={`${source.label}-${i}`}
                source={source}
                open={source.index !== undefined && openSource === source.index}
                onToggle={() => setOpenSource((current) => (
                  source.index !== undefined && current === source.index ? null : source.index ?? null
                ))}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )
      })()}

      {message.tags && message.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {message.tags.map((tag) => (
            <span key={tag} className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {message.followups && message.followups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {message.followups.map((item) => (
            <FollowupButton key={item} text={item} />
          ))}
        </div>
      )}

      {/* 一条回答一行脚注: 左边是"读给我听", 右边是这一轮花了多少 —— 都是关于这条回答本身的 */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <ReadAloudButton
          compact
          id={`littleq:${message.id}`}
          // 点的时候才算朗读稿: 一条会话几十条回答, 预先算一遍纯属浪费
          build={() => ({ prompt: [], answer: assistantSpeech(message.content, message.sub) })}
        />
        {message.usage && <RoundUsageLine usage={message.usage} prices={prices} />}
      </div>
    </>
  )
}

function FollowupButton({ text }: { text: string }) {
  const send = useAssistantStore((s) => s.send)
  return (
    <button
      type="button"
      onClick={() => void send(text)}
      className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {text}
    </button>
  )
}

export function AssistantChat({ variant }: { variant: 'page' | 'panel' }) {
  const messages = useAssistantStore((s) => s.messages)
  const sending = useAssistantStore((s) => s.sending)
  const mode = useAssistantStore((s) => s.mode)
  const setMode = useAssistantStore((s) => s.setMode)
  const emotion = useAssistantStore((s) => s.emotion)
  const send = useAssistantStore((s) => s.send)
  const [input, setInput] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [paletteHidden, setPaletteHidden] = useState(false)
  const [prices, setPrices] = useState<AiPriceMap>(() => new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingInput = useAssistantStore((s) => s.pendingInput)

  // 单价表只为把 tokens 折成钱, 拿不到就只显示 tokens —— 不能因为查不到单价就让对话报错
  useEffect(() => {
    let alive = true
    void loadAiPriceMap().then((map) => { if (alive) setPrices(map) })
    return () => { alive = false }
  }, [])

  /**
   * 本会话累计。用消息里的 usage 加出来, 而不是回头查一次用量表:
   * 这些数字用户刚刚一条条看过来, 现场加出来的和上面每一行天然一致; 而且刷新之后
   * usage 跟着消息一起读回来, 不依赖"这次刷新是不是还在一周窗口内"。
   */
  const sessionUsage = useMemo(
    () => sumRounds(messages.map((m) => m.usage), prices),
    [messages, prices],
  )
  const sessionCostText = sessionUsage.rounds === 0
    ? ''
    : sessionUsage.cost === 0 && sessionUsage.unpriced > 0
      ? '未定价'
      : `${formatCost(sessionUsage.cost)}${sessionUsage.unpriced > 0 ? '+' : ''}`

  // 快速搜索里「询问小Q」带过来的问题: 直接填进输入框, 让用户看一眼再发
  useEffect(() => {
    if (!pendingInput) return
    setInput(pendingInput)
    useAssistantStore.getState().setPendingInput('')
  }, [pendingInput])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, sending])

  const prefix = commandPrefix(input)
  const candidates = paletteHidden || prefix === null ? [] : matchCommands(prefix)
  /** 当前挂着的技能: 从最后一条 skill 消息推, 让用户随时看得见"现在按哪份文档在答" */
  let activeSkill: string | null = null
  for (const message of messages) {
    const meta = message.meta
    if (meta?.kind === 'skill' && meta.action !== 'list') activeSkill = meta.action === 'set' ? meta.skillTitle : null
  }

  function pickCommand(command: CommandSpec) {
    setInput(`/${command.name} `)
    setPaletteIndex(0)
    setPaletteHidden(false)
  }

  function submit(text: string) {
    void send(text)
    setInput('')
    setPaletteIndex(0)
  }

  /**
   * 面板跳转到原文时把小屏面板收起来: 面板在小屏是整屏浮层, 留着它就等于跳了个寂寞。
   * 大屏是停靠式(内容自己让出宽度), 不挡着, 所以不收 —— 用户接着问更方便。
   */
  function beforeNavigate() {
    if (variant !== 'panel') return
    if (!window.matchMedia('(min-width: 1024px)').matches) useAssistantStore.getState().setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (candidates.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPaletteIndex((i) => (i + 1) % candidates.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPaletteIndex((i) => (i - 1 + candidates.length) % candidates.length)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        pickCommand(candidates[paletteIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setPaletteHidden(true)
        return
      }
      // 已经打完整条指令(比如 "/export")时 Enter 该是"发送"而不是"补全",
      // 否则只用键盘就没法发一条不带参数的指令
      const complete = parseCommand(input)?.kind === 'command'
      if (event.key === 'Enter' && !event.shiftKey && !complete) {
        event.preventDefault()
        pickCommand(candidates[paletteIndex])
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(input)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
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
        {activeSkill && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] text-primary">
            <GraduationCap className="h-3 w-3" />
            {activeSkill}
            <button type="button" onClick={() => submit('/skill off')} className="hover:underline">关掉</button>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {sessionUsage.rounds > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
              title={`本会话有 ${sessionUsage.rounds} 轮是模型答的, 合计 ${formatTokens(sessionUsage.tokens)} tokens; 每条回答下面的数字加起来就是这个数`}
            >
              <Coins className="h-3 w-3" />
              本会话 {formatTokens(sessionUsage.tokens)} tokens · {sessionCostText}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {sending ? '正在组织语言…' : STATUS_TEXT[emotion]}
          </span>
        </span>
        {/* 「先问后答」是题目的规则, 小Q 这里没有题干可停, 所以那个开关不显示 */}
        <SpeechSettings showAskFirst={false} />
        <button
          type="button"
          onClick={() => submit('/help')}
          className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Terminal className="h-3 w-3" />
          指令
        </button>
      </div>

      <div ref={scrollRef} className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto', variant === 'page' ? 'p-5' : 'p-3.5')}>
        {messages.length === 0 && !sending && (
          <div className="flex items-start gap-2.5">
            <img src="/littleq.webp" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            <div className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
              <p className="text-sm">{GREETING.content}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{GREETING.sub}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {GREETING.tags.map((tag) => (
                  <span key={tag} className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="animate-in fade-in-0 slide-in-from-bottom-2 flex justify-end duration-300">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={message.id} className="animate-in fade-in-0 slide-in-from-bottom-2 flex items-start gap-2.5 duration-300">
              <img src="/littleq.webp" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              <div className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
                <MessageBody
                  message={message}
                  prices={prices}
                  onNavigate={beforeNavigate}
                  onPickCommand={(cmd) => { setInput(cmd) }}
                />
              </div>
            </div>
          ),
        )}

        {sending && (
          <div className="animate-in fade-in-0 flex items-start gap-2.5 duration-300">
            <img src="/littleq.webp" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
              <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-[thinking_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className={cn('space-y-3 border-t', variant === 'page' ? 'p-4' : 'p-3')}>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.filter((prompt) => mode === 'auto' || prompt.mode === mode)
            .slice(0, variant === 'page' ? undefined : 4)
            .map((prompt) => (
              <button
                key={prompt.text}
                type="button"
                onClick={() => void send(prompt.text)}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {prompt.mode === 'psych'
                  ? <HeartHandshake className="h-3 w-3" />
                  : <GraduationCap className="h-3 w-3" />}
                {prompt.text}
              </button>
            ))}
        </div>

        {candidates.length > 0 && (
          <CommandPalette commands={candidates} activeIndex={paletteIndex} onPick={pickCommand} />
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => { setInput(event.target.value); setPaletteIndex(0); setPaletteHidden(false) }}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="说说你现在的情况，或者直接问「操作系统 内存管理」这样的知识点…打 / 看指令"
            className="min-h-[44px] flex-1 resize-none text-sm"
          />
          <Button
            size="sm"
            className="h-11 shrink-0"
            disabled={!input.trim() || sending}
            onClick={() => submit(input)}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}
