/**
 * 小Q 的对话区 —— /assistant 页和全局悬浮面板共用同一个组件。
 *
 * 抽出来不是为了省行数, 是为了让两条入口的对话**就是同一份**: 之前对话状态住在
 * AssistantPage 里, 想在阅读文献时问一句就只能跳走, 回来还得重问。
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GraduationCap, HeartHandshake, Library, Send, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommandPalette } from '@/components/assistant/CommandPalette'
import { ExportCard, HelpCard, SkillCard } from '@/components/assistant/CommandCards'
import { QuestionDraftCard } from '@/components/assistant/QuestionDraftCard'
import { useAssistantStore, type ChatMessage } from '@/stores/assistant-store'
import { commandPrefix, matchCommands, parseCommand, type CommandSpec } from '@/lib/assistant-commands'
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
 */
function SourceChip({ source, onNavigate }: {
  source: NonNullable<AssistantReply['sources']>[number]
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-primary/15 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
      >
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

/** 指令产物卡片: meta 是判别联合, 这里就是那一个 switch */
function MetaCard({ message, onPickCommand }: { message: ChatMessage; onPickCommand: (command: string) => void }) {
  const meta = message.meta
  if (!meta) return null
  switch (meta.kind) {
    case 'question-draft':
      return <QuestionDraftCard messageId={message.id} meta={meta} />
    case 'skill':
      return <SkillCard meta={meta} />
    case 'export':
      return <ExportCard meta={meta} />
    case 'help':
      return <HelpCard onPickCommand={onPickCommand} />
  }
}

function MessageBody({ message, onNavigate, onPickCommand }: {
  message: ChatMessage
  onNavigate?: () => void
  onPickCommand: (command: string) => void
}) {
  return (
    <>
      <p className="text-sm">{message.content}</p>
      <MetaCard message={message} onPickCommand={onPickCommand} />
      {message.sub && <p className="text-xs leading-relaxed text-muted-foreground">{message.sub}</p>}

      {message.sources && message.sources.length > 0 && (
        <div className="space-y-1 rounded-lg border border-primary/20 bg-background/70 p-2">
          <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Library className="h-2.5 w-2.5" />
            依据平台资料（点开可核对原文）
          </p>
          {message.sources.map((source, i) => (
            <SourceChip key={`${source.label}-${i}`} source={source} onNavigate={onNavigate} />
          ))}
        </div>
      )}

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
  const scrollRef = useRef<HTMLDivElement>(null)

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
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {sending ? '正在组织语言…' : STATUS_TEXT[emotion]}
        </span>
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
                <MessageBody message={message} onNavigate={beforeNavigate} onPickCommand={(cmd) => { setInput(cmd) }} />
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
