/**
 * 小Q 的对话状态 —— /assistant 页和全局悬浮面板共用这一份。
 *
 * 为什么必须共用: 阅读文献时唤起面板问一句, 再回 /assistant 页接着问,
 * 这两个入口要是各存一份 messages, 用户看到的就是两个平行世界。
 *
 * 会话记录落库(chat_conversations / chat_messages), 不是本地存储:
 * 会话里带的是引用出处(文献名 + 页码 + 段落跳转地址), 换设备或清缓存就找不回来,
 * 那等于"查过的依据白查了"。
 */
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { produceReply } from '@/lib/assistant-runtime'
import type { AssistantMode, AssistantReply, LittleQEmotion } from '@/lib/assistant-demo'
import type { AssistantTurn } from '@/lib/ai/assistant'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  sub: string | null
  tags: string[] | null
  sources: NonNullable<AssistantReply['sources']> | null
  followups: string[] | null
}

export interface ConversationSummary {
  id: string
  title: string
  updated_at: string
}

const TITLE_MAX = 24
const MESSAGE_COLUMNS = 'id, role, content, sub, tags, sources, followups'
const ACTIVE_KEY = 'littleq_active_conversation'

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
  }
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
}

/**
 * 在途回复的作废序号。
 *
 * 用户可能在等回复时切到别的会话、或者点新会话 —— 那种情况下模型回来的答案
 * 不应该按"当前会话"落库, 否则会串到另一个会话里。序号对不上就整条丢掉。
 */
let sendSerial = 0

export const useAssistantStore = create<AssistantState>((set, get) => ({
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
      set({ conversations: list, conversationsLoaded: true, loadedForUserId: uid, activeId: null, messages: [] })
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
    set({ messages: ((data ?? []) as Row[]).map(toMessage), loadingMessages: false })
  },

  startNewConversation: () => {
    sendSerial++
    writeActiveId(null)
    // 不马上建行: 用户可能点开又关掉, 那就会留下一堆空会话。等第一句话落库时一起建
    set({ activeId: null, messages: [], view: 'chat', sending: false, error: null, emotion: 'happy' })
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
    const { sending, mode } = get()
    if (!value || sending) return

    const serial = ++sendSerial
    const history: AssistantTurn[] = get().messages.map((m) => ({ role: m.role, text: m.content }))
    const stamp = Date.now()
    set({
      sending: true,
      emotion: 'thinking',
      error: null,
      messages: [...get().messages, {
        id: -stamp, role: 'user', content: value, sub: null, tags: null, sources: null, followups: null,
      }],
    })

    let conversationId = get().activeId
    try {
      if (!conversationId) {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id
        if (!userId) throw new Error('未登录')
        const title = titleFrom(value)
        const { data, error } = await supabase
          .from('chat_conversations')
          .insert({ user_id: userId, title })
          .select('id, title, updated_at')
          .single()
        if (error) throw error
        conversationId = (data as ConversationSummary).id
        writeActiveId(conversationId)
        set({
          activeId: conversationId,
          conversations: [data as ConversationSummary, ...get().conversations],
        })
      }

      const { error: userMsgError } = await supabase.from('chat_messages').insert({
        conversation_id: conversationId, role: 'user', content: value,
      })
      if (userMsgError) throw userMsgError
    } catch (err) {
      if (serial === sendSerial) {
        set({ sending: false, emotion: 'concerned', error: err instanceof Error ? err.message : String(err) })
      }
      return
    }

    const outcome = await produceReply(value, history, mode)
    const { reply, emotion, scripted } = outcome
    const row = {
      conversation_id: conversationId,
      role: 'assistant' as const,
      content: reply.text,
      sub: reply.sub ?? null,
      tags: reply.tags ?? null,
      sources: reply.sources ?? null,
      followups: reply.followups ?? null,
      emotion,
    }

    let messageId = -Date.now()
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages').insert(row).select('id').single()
    if (insertError) {
      if (serial === sendSerial) set({ error: `回复保存失败(本次仍可查看): ${insertError.message}` })
    } else {
      messageId = (inserted as { id: number }).id
    }

    // 落到会话里, 但只有这个会话还开着才显示出来。
    // 反过来做(切走了就不落库)会把答案直接丢掉 —— 用户回来只看到自己的问题, 没有回答。
    const bumped = get().conversations.map((c) =>
      c.id === conversationId ? { ...c, updated_at: new Date().toISOString() } : c)
    if (serial !== sendSerial) {
      set({ conversations: bumped })
      return
    }
    set({
      sending: false,
      emotion,
      messages: [...get().messages, {
        id: messageId,
        role: 'assistant',
        content: reply.text,
        sub: reply.sub ?? null,
        tags: scripted ? [...(reply.tags ?? []), '内置回答'] : reply.tags ?? null,
        sources: reply.sources ?? null,
        followups: reply.followups ?? null,
      }],
      conversations: bumped,
    })
  },
}))
