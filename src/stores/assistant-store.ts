/**
 * 小Q 的对话状态 —— /assistant 页和全局悬浮面板共用这一份。
 *
 * 为什么必须共用: 阅读文献时唤起面板问一句, 再回 /assistant 页接着问,
 * 这两个入口要是各存一份 messages, 用户看到的就是两个平行世界。
 *
 * 会话记录落库(chat_conversations / chat_messages), 不是本地存储:
 * 会话里带的是引用出处(文献名 + 页码 + 段落跳转地址), 换设备或清缓存就找不回来,
 * 那等于"查过的依据白查了"。
 *
 * 斜杠指令在这里拦下来(见 lib/assistant-commands): /create /skill /export /help
 * 都不是发给模型的, 各自走自己的分支, 结果作为一条带 meta 的消息落到同一个会话里。
 */
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { produceReply } from '@/lib/assistant-runtime'
import { exportConversation } from '@/lib/assistant-export'
import { insertQuestionDraft } from '@/lib/assistant-question-draft'
import { searchKnowledge } from '@/lib/rag'
import { hasAiConfig } from '@/lib/ai/config'
import {
  activeSkillFrom, listSkills, loadSkillDoc, parseCommand,
  type CommandSpec, type MessageMeta, type QuestionDraftMeta,
} from '@/lib/assistant-commands'
import type { AssistantMode, AssistantReply, LittleQEmotion } from '@/lib/assistant-demo'
import type { AssistantTurn } from '@/lib/ai/assistant'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { SkillId } from '@/lib/skills-catalog'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  sub: string | null
  tags: string[] | null
  sources: NonNullable<AssistantReply['sources']> | null
  followups: string[] | null
  /** 指令卡片的结构化数据; 普通对话是 null */
  meta: MessageMeta | null
  createdAt: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  updated_at: string
}

const TITLE_MAX = 24
const MESSAGE_COLUMNS = 'id, role, content, sub, tags, sources, followups, meta, created_at'
const ACTIVE_KEY = 'littleq_active_conversation'
/** /create 一次最多出几道: 再多就不是"顺手出两道题", 而是一屏卡片压在对话里 */
const CREATE_MAX = 5
const CREATE_DEFAULT = 3

/**
 * 记住最后聊的那个会话。
 * 不做这件事的话, 每刷新一次页面(或从别的页面进来) 小Q 都是一张白纸 ——
 * 用户会觉得"刚才问的内容丢了", 即使它其实好好地躺在会话记录里。
 */
function readActiveId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}

function writeActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* 隐私模式下写不了就算了, 不影响本次会话 */ }
}

/** 会话标题直接取第一句话 —— 让模型起标题要多花一次调用, 而用户自己写的那句往往更准 */
function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return '新会话'
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat
}

interface Row {
  id: number
  role: 'user' | 'assistant'
  content: string
  sub: string | null
  tags: string[] | null
  sources: ChatMessage['sources']
  followups: string[] | null
  meta: MessageMeta | null
  created_at: string | null
}

function toMessage(row: Row): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sub: row.sub,
    tags: row.tags,
    sources: row.sources,
    followups: row.followups,
    meta: row.meta ?? null,
    createdAt: row.created_at ?? null,
  }
}

function emptyMessage(id: number, role: ChatMessage['role'], content: string, meta: MessageMeta | null = null): ChatMessage {
  return { id, role, content, sub: null, tags: null, sources: null, followups: null, meta, createdAt: null }
}

/** 第一句话落库时才建会话行: 用户点开又关掉不该在列表里留下一堆空会话 */
async function ensureConversationId(
  activeId: string | null,
  title: string,
): Promise<{ id: string; created: ConversationSummary | null }> {
  if (activeId) return { id: activeId, created: null }
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('未登录')
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, title })
    .select('id, title, updated_at')
    .single()
  if (error) throw error
  return { id: (data as ConversationSummary).id, created: data as ConversationSummary }
}

async function insertMessage(row: Record<string, unknown>): Promise<{ id: number; error: string | null }> {
  const { data, error } = await supabase.from('chat_messages').insert(row).select('id').single()
  if (error) return { id: -Date.now(), error: error.message }
  return { id: (data as { id: number }).id, error: null }
}

/** /create 的数量参数: 允许 "/create 3 死锁的必要条件" 这种写法 */
function parseCreateArgs(args: string): { count: number; prompt: string } {
  const match = /^(\d+)\s+(.+)$/.exec(args)
  if (!match) return { count: CREATE_DEFAULT, prompt: args }
  const count = Math.max(1, Math.min(CREATE_MAX, Number(match[1])))
  return { count, prompt: match[2].trim() }
}

interface AssistantState {
  /** 悬浮面板是否展开 */
  open: boolean
  /** 面板里显示对话还是会话列表 */
  view: 'chat' | 'history'
  conversations: ConversationSummary[]
  conversationsLoaded: boolean
  /** 列表是为哪个账号拉的 —— 换账号后必须重拉, 否则界面上会留着上一个人的会话标题 */
  loadedForUserId: string | null
  activeId: string | null
  messages: ChatMessage[]
  loadingMessages: boolean
  sending: boolean
  mode: AssistantMode
  emotion: LittleQEmotion
  error: string | null
  /** 当前会话挂着的技能, 会作为固定上下文注入后面每一轮 */
  activeSkillId: SkillId | null

  setOpen: (open: boolean) => void
  toggle: () => void
  setView: (view: 'chat' | 'history') => void
  setMode: (mode: AssistantMode) => void
  clearError: () => void

  loadConversations: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  startNewConversation: () => void
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  send: (text: string) => Promise<void>

  confirmQuestionDraft: (messageId: number, patch: { subject: string | null; categories: string[] }) => Promise<number>
  discardQuestionDraft: (messageId: number) => Promise<void>
}

/**
 * 在途回复的作废序号。
 *
 * 用户可能在等回复时切到别的会话、或者点新会话 —— 那种情况下模型回来的答案
 * 不应该按"当前会话"落库, 否则会串到另一个会话里。序号对不上就整条丢掉。
 */
let sendSerial = 0

export const useAssistantStore = create<AssistantState>((set, get) => {
  /** 把一条 assistant 消息落库、上屏, 并顺带把会话顶到列表最前 */
  async function appendAssistant(
    conversationId: string,
    content: string,
    extra: { sub?: string | null; tags?: string[] | null; sources?: ChatMessage['sources']; followups?: string[] | null; meta?: MessageMeta | null; emotion?: LittleQEmotion } = {},
    serial?: number,
  ): Promise<void> {
    const row = {
      conversation_id: conversationId,
      role: 'assistant' as const,
      content,
      sub: extra.sub ?? null,
      tags: extra.tags ?? null,
      sources: extra.sources ?? null,
      followups: extra.followups ?? null,
      meta: extra.meta ?? null,
      emotion: extra.emotion ?? null,
    }
    const { id, error } = await insertMessage(row)
    if (error && (serial === undefined || serial === sendSerial)) {
      set({ error: `消息保存失败(本次仍可查看): ${error}` })
    }

    const bumped = get().conversations.map((c) =>
      c.id === conversationId ? { ...c, updated_at: new Date().toISOString() } : c)
    // 会话被切走了: 消息照样落库, 只是不上屏 —— 丢掉的话用户回来只看到自己的问题, 没有回答
    if (serial !== undefined && serial !== sendSerial) {
      set({ conversations: bumped })
      return
    }
    const messages = [...get().messages, {
      ...emptyMessage(id, 'assistant', content),
      sub: extra.sub ?? null,
      tags: extra.tags ?? null,
      sources: extra.sources ?? null,
      followups: extra.followups ?? null,
      meta: extra.meta ?? null,
    }]
    set({
      messages,
      conversations: bumped,
      activeSkillId: activeSkillFrom(messages),
    })
  }

  /** 用户那条消息先上屏再落库: 等一次往返才显示自己发的话, 感觉像卡住了 */
  async function pushUserMessage(conversationId: string, value: string, serial: number): Promise<void> {
    const tempId = -Date.now()
    set({ messages: [...get().messages, emptyMessage(tempId, 'user', value)] })
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId, role: 'user', content: value,
    })
    if (error && serial === sendSerial) set({ error: `消息保存失败: ${error.message}` })
  }

  /** 指令的统一入口: 会话 + 用户消息 + 指令自己的产物 */
  async function runCommand(spec: CommandSpec, args: string, raw: string): Promise<void> {
    const serial = ++sendSerial
    set({ sending: true, emotion: 'thinking', error: null })

    let conversationId: string
    try {
      const { id, created } = await ensureConversationId(get().activeId, titleFrom(raw))
      conversationId = id
      if (created) {
        writeActiveId(id)
        set({ activeId: id, conversations: [created, ...get().conversations] })
      }
      await pushUserMessage(conversationId, raw, serial)
    } catch (err) {
      if (serial === sendSerial) {
        set({ sending: false, emotion: 'concerned', error: err instanceof Error ? err.message : String(err) })
      }
      return
    }

    try {
      switch (spec.id) {
        case 'help':
          await appendAssistant(conversationId, '这些是小Q 支持的指令。点下面的指令名可以直接用。', {
            meta: { kind: 'help' },
            tags: ['指令'],
          }, serial)
          break

        case 'export': {
          // 导出的是"到目前为止的对话", 不含这条导出回执本身
          const snapshot = get().messages.filter((m) => m.role !== 'user' || m.content !== raw)
          const { filename, bytes } = await exportConversation({
            conversationId,
            title: get().conversations.find((c) => c.id === conversationId)?.title ?? '小Q 会话',
            messages: snapshot,
          })
          await appendAssistant(conversationId, `已导出 ${filename}（${snapshot.length} 条消息，${Math.max(1, Math.round(bytes / 1024))} KB）。`, {
            meta: { kind: 'export', filename, bytes, turns: snapshot.length },
            tags: ['导出'],
          }, serial)
          break
        }

        case 'skill': {
          const { lang } = useLangStore.getState()
          const skillArg = args.trim().toLowerCase()
          if (!skillArg) {
            const skills = await listSkills(lang)
            await appendAssistant(conversationId, [
              '可用的平台技能：',
              ...skills.map((s) => `· ${s.id} —— ${s.title}`),
              '',
              `用 /skill <技能名> 让 小Q 按它带你做；/skill off 关掉。`,
            ].join('\n'), {
              meta: { kind: 'skill', action: 'list', skillId: get().activeSkillId, skillTitle: '' },
              tags: ['技能'],
            }, serial)
            break
          }
          if (skillArg === 'off' || skillArg === 'none' || skillArg === '取消') {
            await appendAssistant(conversationId, '已关掉当前技能，后面的回答不再带技能文档。', {
              meta: { kind: 'skill', action: 'clear', skillId: null, skillTitle: '' },
              tags: ['技能'],
            }, serial)
            break
          }
          const skills = await listSkills(lang)
          const hit = skills.find((s) => s.id.toLowerCase() === skillArg)
            ?? skills.find((s) => s.id.toLowerCase().includes(skillArg))
          if (!hit) {
            await appendAssistant(conversationId, [
              `没有找到技能「${args}」。可用的有：`,
              ...skills.map((s) => `· ${s.id} —— ${s.title}`),
            ].join('\n'), {
              meta: { kind: 'skill', action: 'list', skillId: get().activeSkillId, skillTitle: '' },
              tags: ['技能'],
            }, serial)
            break
          }
          await appendAssistant(conversationId, [
            `已启用技能：${hit.title}`,
            '',
            '接下来 小Q 会按这份技能文档带你做，可以直接问「第一步怎么开始」。',
          ].join('\n'), {
            meta: { kind: 'skill', action: 'set', skillId: hit.id, skillTitle: hit.title },
            tags: ['技能', hit.id],
          }, serial)
          break
        }

        case 'create': {
          const profile = useAuthStore.getState().profile
          if (profile?.role !== 'admin') {
            await appendAssistant(conversationId, '出题会把题目写进平台题库，所以只有管理员能用 /create。', {
              tags: ['权限'],
            }, serial)
            break
          }
          if (!hasAiConfig()) {
            await appendAssistant(conversationId, '当前没有配置可用的模型，暂时没法出题。', { tags: ['未配置'] }, serial)
            break
          }
          const { count, prompt } = parseCreateArgs(args)
          if (!prompt) {
            await appendAssistant(conversationId, '用法：/create [数量] <要考的知识点或题干要求>\n例如：/create 3 死锁产生的四个必要条件', {
              meta: { kind: 'help' },
              tags: ['用法'],
            }, serial)
            break
          }

          // 先看平台资料里有没有相关内容: 有就拿它当材料出题, 这样出的题和文献对得上,
          // 也才有出处可核对; 没有就退回"按主题描述出题", 由模型自己的知识来, 并在卡片里说清楚。
          let questions: ParsedQuestion[] = []
          let grounded = false
          try {
            const { hits } = await searchKnowledge(prompt, { sources: ['resource', 'question', 'kp', 'subject'], limit: 6 })
            if (hits.length > 0) {
              const material = hits.map((h, i) => `[${i + 1}] ${h.content}`).join('\n\n')
              const { generateFromText } = await import('@/lib/ai')
              questions = (await generateFromText({ documentText: material, count })).questions
              grounded = true
            }
          } catch (err) {
            console.warn('[assistant] /create 检索平台资料失败, 改为按主题出题:', err)
          }

          if (questions.length === 0) {
            const { generateQuestions } = await import('@/lib/ai')
            questions = (await generateQuestions({
              subject: '综合',
              questionTypes: ['single_choice', 'multiple_choice'],
              count,
              topicDescription: prompt,
            })).questions
          }

          if (questions.length === 0) {
            await appendAssistant(conversationId, '模型这次没有给出可用题目，换个说法再试一次？', { tags: ['出题失败'] }, serial)
            break
          }

          await appendAssistant(conversationId, grounded
            ? `按平台资料出了 ${questions.length} 道题。学科和分类确认一下再入库 —— 这一步只有你知道该归到哪儿。`
            : `平台资料里没找到「${prompt}」的对应内容，这 ${questions.length} 道题来自模型自己的知识，请重点核对学科、分类和答案。`, {
            meta: {
              kind: 'question-draft',
              questions,
              subject: null,
              categories: [],
              status: 'pending',
              prompt,
              grounded,
            } satisfies QuestionDraftMeta,
            tags: grounded ? ['待确认', '基于平台资料'] : ['待确认', '非平台资料'],
          }, serial)
          break
        }
      }
    } catch (err) {
      await appendAssistant(
        conversationId,
        `指令执行失败：${err instanceof Error ? err.message : String(err)}`,
        { tags: ['失败'] },
        serial,
      )
    } finally {
      if (serial === sendSerial) set({ sending: false, emotion: 'happy' })
    }
  }

  return {
    open: false,
    view: 'chat',
    conversations: [],
    conversationsLoaded: false,
    loadedForUserId: null,
    activeId: readActiveId(),
    messages: [],
    loadingMessages: false,
    sending: false,
    mode: 'auto',
    emotion: 'happy',
    error: null,
    activeSkillId: null,

    setOpen: (open) => {
      set({ open })
      if (!open) return
      // 首次展开拉一次, 之后靠本地状态维护 —— 但不是"拉过一次就永远不拉": 换账号要重来
      const uid = useAuthStore.getState().user?.id ?? null
      if (!get().conversationsLoaded || get().loadedForUserId !== uid) void get().loadConversations()
      // 上次聊到一半的那条: 面板一开就把它接回来, 而不是让用户自己去列表里翻
      const { activeId, messages } = get()
      if (activeId && messages.length === 0) void get().openConversation(activeId)
    },
    toggle: () => get().setOpen(!get().open),
    setView: (view) => set({ view }),
    setMode: (mode) => set({ mode }),
    clearError: () => set({ error: null }),

    loadConversations: async () => {
      const uid = useAuthStore.getState().user?.id ?? null
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100)
      if (error) {
        set({ error: `会话列表读取失败: ${error.message}`, conversationsLoaded: true, loadedForUserId: uid })
        return
      }
      const list = (data ?? []) as ConversationSummary[]
      // 上次记住的那条已经被删了(或换账号了) → 清掉, 否则会停在一个不存在的会话上
      const activeId = get().activeId
      if (activeId && !list.some((c) => c.id === activeId)) {
        writeActiveId(null)
        set({
          conversations: list, conversationsLoaded: true, loadedForUserId: uid,
          activeId: null, messages: [], activeSkillId: null,
        })
        return
      }
      set({ conversations: list, conversationsLoaded: true, loadedForUserId: uid })
    },

    openConversation: async (id) => {
      sendSerial++
      writeActiveId(id)
      set({ activeId: id, view: 'chat', messages: [], loadingMessages: true, sending: false, error: null })
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', id)
        .order('id', { ascending: true })
        .limit(500)
      // 加载期间用户可能又点了别的会话, 这份结果就过期了
      if (get().activeId !== id) return
      if (error) {
        set({ error: `会话内容读取失败: ${error.message}`, loadingMessages: false })
        return
      }
      const messages = ((data ?? []) as Row[]).map(toMessage)
      set({ messages, loadingMessages: false, activeSkillId: activeSkillFrom(messages) })
    },

    startNewConversation: () => {
      sendSerial++
      writeActiveId(null)
      // 不马上建行: 用户可能点开又关掉, 那就会留下一堆空会话。等第一句话落库时一起建
      set({
        activeId: null, messages: [], view: 'chat', sending: false,
        error: null, emotion: 'happy', activeSkillId: null,
      })
    },

    renameConversation: async (id, title) => {
      const next = title.trim() || '新会话'
      const prev = get().conversations
      set({ conversations: prev.map((c) => (c.id === id ? { ...c, title: next } : c)) })
      const { error } = await supabase.from('chat_conversations').update({ title: next }).eq('id', id)
      if (error) set({ conversations: prev, error: `重命名失败: ${error.message}` })
    },

    deleteConversation: async (id) => {
      const prev = get().conversations
      set({ conversations: prev.filter((c) => c.id !== id) })
      if (get().activeId === id) get().startNewConversation()
      // 消息靠外键 ON DELETE CASCADE 一起走, 不用前端再删一遍
      const { error } = await supabase.from('chat_conversations').delete().eq('id', id)
      if (error) set({ conversations: prev, error: `删除失败: ${error.message}` })
    },

    send: async (text) => {
      const value = text.trim()
      if (!value || get().sending) return

      // 指令先拦下来: 打 /export 是想导出, 不是想让模型写一篇关于导出的散文
      const parsed = parseCommand(value)
      if (parsed?.kind === 'command') { await runCommand(parsed.spec, parsed.args, value); return }
      if (parsed?.kind === 'unknown') {
        const serial = ++sendSerial
        set({ sending: true, emotion: 'thinking', error: null })
        try {
          const { id, created } = await ensureConversationId(get().activeId, titleFrom(value))
          if (created) {
            writeActiveId(id)
            set({ activeId: id, conversations: [created, ...get().conversations] })
          }
          await pushUserMessage(id, value, serial)
          await appendAssistant(id, `没有 /${parsed.name} 这条指令。`, {
            meta: { kind: 'help' },
            tags: ['未知指令'],
          }, serial)
        } catch (err) {
          set({ error: err instanceof Error ? err.message : String(err) })
        } finally {
          if (serial === sendSerial) set({ sending: false, emotion: 'happy' })
        }
        return
      }

      const serial = ++sendSerial
      const { mode, activeSkillId } = get()
      const history: AssistantTurn[] = get().messages.map((m) => ({ role: m.role, text: m.content }))
      set({ sending: true, emotion: 'thinking', error: null })

      let conversationId: string
      try {
        const { id, created } = await ensureConversationId(get().activeId, titleFrom(value))
        conversationId = id
        if (created) {
          writeActiveId(id)
          set({ activeId: id, conversations: [created, ...get().conversations] })
        }
        await pushUserMessage(conversationId, value, serial)
      } catch (err) {
        if (serial === sendSerial) {
          set({ sending: false, emotion: 'concerned', error: err instanceof Error ? err.message : String(err) })
        }
        return
      }

      const skill = activeSkillId
        ? await loadSkillDoc(activeSkillId, 'zh').catch(() => null) ?? undefined
        : undefined

      const outcome = await produceReply(value, history, mode, skill)
      const { reply, emotion, scripted } = outcome
      const { error } = await insertMessage({
        conversation_id: conversationId,
        role: 'assistant',
        content: reply.text,
        sub: reply.sub ?? null,
        tags: reply.tags ?? null,
        sources: reply.sources ?? null,
        followups: reply.followups ?? null,
        emotion,
      })

      const bumped = get().conversations.map((c) =>
        c.id === conversationId ? { ...c, updated_at: new Date().toISOString() } : c)
      if (error && serial === sendSerial) set({ error: `回复保存失败(本次仍可查看): ${error}` })
      // 落到会话里, 但只有这个会话还开着才显示出来
      if (serial !== sendSerial) {
        set({ conversations: bumped })
        return
      }
      set({
        sending: false,
        emotion,
        messages: [...get().messages, {
          ...emptyMessage(-Date.now(), 'assistant', reply.text),
          sub: reply.sub ?? null,
          tags: scripted ? [...(reply.tags ?? []), '内置回答'] : reply.tags ?? null,
          sources: reply.sources ?? null,
          followups: reply.followups ?? null,
        }],
        conversations: bumped,
      })
    },

    confirmQuestionDraft: async (messageId, patch) => {
      const message = get().messages.find((m) => m.id === messageId)
      const meta = message?.meta
      if (!meta || meta.kind !== 'question-draft' || meta.status !== 'pending') return 0

      const next: QuestionDraftMeta = {
        ...meta,
        subject: patch.subject,
        categories: patch.categories,
        status: 'inserted',
      }
      try {
        const inserted = await insertQuestionDraft(meta.questions, {
          subject: patch.subject,
          categories: patch.categories,
          importMode: 'littleq',
        })
        next.insertedCount = inserted
        set({ messages: get().messages.map((m) => (m.id === messageId ? { ...m, meta: next } : m)) })
        // 卡片状态也要落库, 否则刷新之后又变回"待确认", 用户会以为没成功
        await supabase.from('chat_messages').update({ meta: next }).eq('id', messageId)
        return inserted
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
        return 0
      }
    },

    discardQuestionDraft: async (messageId) => {
      const message = get().messages.find((m) => m.id === messageId)
      const meta = message?.meta
      if (!meta || meta.kind !== 'question-draft') return
      const next: QuestionDraftMeta = { ...meta, status: 'discarded' }
      set({ messages: get().messages.map((m) => (m.id === messageId ? { ...m, meta: next } : m)) })
      const { error } = await supabase.from('chat_messages').update({ meta: next }).eq('id', messageId)
      if (error) set({ error: `丢弃草稿失败: ${error.message}` })
    },
  }
})
