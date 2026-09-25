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
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { registerUserScopedStore } from '@/stores/user-scope'
import {
  appendMessage, createConversation, deleteConversation, fetchConversations, fetchMessages,
  findConversationIdByQuestion, renameConversation, updateMessageMeta,
  type ChatMessage, type ConversationSummary, type NewMessage,
} from '@/services/assistant'
import { fetchQuestionMetaCache } from '@/services/questions'
import { listPublishedDocuments } from '@/services/resources'
import { logError, userMessage } from '@/services/errors'
import { hasAiConfig } from '@/lib/ai/config'
import {
  activeSkillFrom, conversationTitleFrom, listSkills, loadSkillDoc, parseCommand,
  type CommandSpec, type CreateDraftMeta, type MessageMeta,
} from '@/lib/assistant-commands'
import type { CreateSpec } from '@/lib/assistant-create'
import type { AssistantMode, LittleQEmotion } from '@/lib/assistant-demo'
import type { AssistantTurn } from '@/lib/ai/assistant'
import type { QuestionContext } from '@/lib/ai/question-context'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { SkillId } from '@/lib/skills-catalog'

/**
 * 出题、回复生成、导出这三件事都不在首屏路径上，但它们的模块会拖进整条重依赖链
 * （assistant-create → resource-library → pdf-page-renderer → pdfjs 及其 1.3MB worker，
 * 还有 r2-upload、MinerU）。这个 store 被全局布局 AppLayout 引入，一旦静态 import，
 * 那 1.6MB 就会跟着首屏一起下载 —— 所以这三个都在用到的那一刻才加载。
 */
const loadCreate = () => import('@/lib/assistant-create')
const loadRuntime = () => import('@/lib/assistant-runtime')
const loadExport = () => import('@/lib/assistant-export')

export type { ChatMessage, ConversationSummary }

/**
 * 练习模式里"正在解释的那道题"。
 *
 * context 是练习页当场拼好带过来的(见 lib/ai/question-context): 题干/选项/答案/用户选了什么,
 * 后面每一轮都注入 prompt —— 会话是关于这道题的, 用户接着问"那 B 为什么不对"时不该再解释一遍题干。
 */
export interface QuestionScope {
  id: string
  /** 面板头部那行小字与生成会话标题用 */
  stem: string
  context: QuestionContext
}

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
const titleFrom = conversationTitleFrom

function emptyMessage(id: number, role: ChatMessage['role'], content: string, meta: MessageMeta | null = null): ChatMessage {
  return { id, role, content, sub: null, tags: null, sources: null, followups: null, meta, usage: null, createdAt: null }
}

/** 第一句话落库时才建会话行: 用户点开又关掉不该在列表里留下一堆空会话 */
async function ensureConversationId(
  activeId: string | null,
  title: string,
  questionId: string | null = null,
): Promise<{ id: string; created: ConversationSummary | null }> {
  if (activeId) return { id: activeId, created: null }
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('未登录')
  const created = await createConversation(userId, { title, questionId })
  return { id: created.id, created }
}

/**
 * 找到(或建好)这道题的专属会话。
 *
 * 一题一会话(库里有唯一索引兜着): 同一道题点两次「问小Q」应该接着上次说, 而不是新开一条 ——
 * 否则侧栏里会积一串"同一道题"的一次性会话。它不进 conversations 列表(列表只列主会话),
 * 所以新建之后不往列表里塞。
 */
async function ensureQuestionConversation(questionId: string, title: string): Promise<string> {
  const existing = await findConversationIdByQuestion(questionId)
  if (existing) return existing

  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('未登录')
  return (await createConversation(userId, { title, questionId })).id
}

/**
 * 落一条消息。写失败不往上抛: 消息已经上了屏, 各调用点自己决定"这条没存上"怎么跟用户说。
 */
async function insertMessage(input: NewMessage): Promise<{ id: number; error: string | null }> {
  try {
    return { id: await appendMessage(input), error: null }
  } catch (e) {
    logError('assistant.appendMessage', e)
    return { id: -Date.now(), error: userMessage(e) }
  }
}

/** 参数卡片要用的候选项: 学科/分类走缓存表(跟题库筛选同一份数据源), 文献只列已发布的 */
async function loadCreateOptions(): Promise<{
  subjects: string[]
  categories: string[]
  documents: { id: string; title: string }[]
}> {
  const [meta, documents] = await Promise.all([fetchQuestionMetaCache(), listPublishedDocuments()])
  return { subjects: meta.subjects, categories: meta.categories, documents }
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
  /** 快速搜索里「询问小Q」带过来的预填文本, 输入框取走后清空 */
  pendingInput: string
  /** 非空 = 面板正在解释这道题, 消息走它的专属会话 */
  questionScope: QuestionScope | null
  /** 进题目会话之前停在哪个主会话 —— 退出时要回到它, 而不是回到"新会话" */
  mainActiveId: string | null

  setOpen: (open: boolean) => void
  setPendingInput: (text: string) => void
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

  /** 练习页「问小Q解释本题」: 切到这道题的专属会话并把面板打开 */
  openForQuestion: (scope: QuestionScope, ask?: string) => Promise<void>
  /** 回到主会话 */
  exitQuestionScope: () => Promise<void>

  /** 用户改完参数点「开始出题」 */
  startCreateGeneration: (messageId: number, spec: CreateSpec) => Promise<void>
  /** 回到参数确认那一步重来 */
  reopenCreateSpec: (messageId: number) => Promise<void>
  confirmCreateDraft: (messageId: number, questions?: ParsedQuestion[]) => Promise<number>
  discardCreateDraft: (messageId: number) => Promise<void>
  /** 换账号时清空账号数据（会话、消息、题目上下文）；界面开合状态保留 */
  reset: () => void
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
    const { id, error } = await insertMessage({
      conversationId,
      role: 'assistant',
      content,
      sub: extra.sub ?? null,
      tags: extra.tags ?? null,
      sources: extra.sources ?? null,
      followups: extra.followups ?? null,
      meta: extra.meta ?? null,
      emotion: extra.emotion ?? null,
    })
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

  /**
   * 卡片状态改了就立刻落库。
   * 不落库的话刷新之后卡片会退回上一步 —— 用户明明确认过入库, 回来却又是"待确认",
   * 会以为没成功, 然后再点一次, 于是同一批题入库两遍。
   */
  async function writeMeta(messageId: number, meta: MessageMeta): Promise<void> {
    set({ messages: get().messages.map((m) => (m.id === messageId ? { ...m, meta } : m)) })
    try {
      await updateMessageMeta(messageId, meta)
    } catch (e) {
      logError('assistant.writeMeta', e)
      set({ error: `卡片状态保存失败: ${userMessage(e)}` })
    }
  }

  /** 用户那条消息先上屏再落库: 等一次往返才显示自己发的话, 感觉像卡住了 */
  async function pushUserMessage(conversationId: string, value: string, serial: number): Promise<void> {
    const tempId = -Date.now()
    set({ messages: [...get().messages, emptyMessage(tempId, 'user', value)] })
    const { error } = await insertMessage({ conversationId, role: 'user', content: value })
    if (error && serial === sendSerial) set({ error: `消息保存失败: ${error}` })
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
      logError('assistant.runCommand', err)
      if (serial === sendSerial) {
        set({ sending: false, emotion: 'concerned', error: userMessage(err) })
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
          const { exportConversation } = await loadExport()
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

          // 先只解析需求、不出题: 出题要花几十秒和一次生成的钱, 而参数没对齐的话
          // 那几十秒和那笔钱都是白花的。用户在卡片上确认完再走 startCreateGeneration。
          const options = await loadCreateOptions()
          const { parseCreateRequest } = await loadCreate()
          const { spec, understanding } = await parseCreateRequest(args, options)
          await appendAssistant(conversationId, args.trim()
            ? '先跟你对一下参数，确认没问题我再出题。'
            : '要出什么题？把参数选好我再开始。', {
            meta: {
              kind: 'create-draft',
              spec,
              understanding,
              status: 'spec',
              questions: [],
              grounded: false,
              sources: [],
              materialNote: null,
            } satisfies CreateDraftMeta,
            tags: ['待确认参数'],
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
    pendingInput: '',
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
    questionScope: null,
    mainActiveId: null,

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
    setPendingInput: (text) => set({ pendingInput: text }),
    setView: (view) => set({ view }),
    setMode: (mode) => set({ mode }),
    clearError: () => set({ error: null }),

    loadConversations: async () => {
      const uid = useAuthStore.getState().user?.id ?? null
      let list: ConversationSummary[]
      try {
        // 题目专属会话不进这张列表(服务层按 question_id is null 过滤): 它属于某一道题, 在侧栏里只会变成一串认不出来的标题
        list = await fetchConversations()
      } catch (e) {
        logError('assistant.loadConversations', e)
        set({ error: `会话列表读取失败: ${userMessage(e)}`, conversationsLoaded: true, loadedForUserId: uid })
        return
      }
      // 上次记住的那条已经被删了(或换账号了) → 清掉, 否则会停在一个不存在的会话上。
      // 正在解释某道题时不清: 那个会话本来就不在这张列表里, 清了等于把用户踢出这道题。
      const activeId = get().activeId
      if (!get().questionScope && activeId && !list.some((c) => c.id === activeId)) {
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
      let messages: ChatMessage[]
      try {
        messages = await fetchMessages(id)
      } catch (e) {
        // 加载期间用户可能又点了别的会话, 这份结果就过期了
        if (get().activeId !== id) return
        logError('assistant.openConversation', e)
        set({ error: `会话内容读取失败: ${userMessage(e)}`, loadingMessages: false })
        return
      }
      if (get().activeId !== id) return
      set({ messages, loadingMessages: false, activeSkillId: activeSkillFrom(messages) })
    },

    startNewConversation: () => {
      sendSerial++
      writeActiveId(null)
      // 不马上建行: 用户可能点开又关掉, 那就会留下一堆空会话。等第一句话落库时一起建
      set({
        activeId: null, messages: [], view: 'chat', sending: false,
        error: null, emotion: 'happy', activeSkillId: null,
        // 点「新会话」就是要一条干净的: 正在解释某道题的会话不该接着算新会话
        questionScope: null, mainActiveId: null,
      })
    },

    openForQuestion: async (scope, ask) => {
      sendSerial++
      const prev = get()
      // 进题目会话之前停在哪儿: 只在"从主会话进来"那一次记下来, 一题接一题问时不覆盖
      const mainActiveId = prev.questionScope ? prev.mainActiveId : prev.activeId
      set({
        open: true, view: 'chat', questionScope: scope, mainActiveId,
        sending: false, error: null, emotion: 'thinking',
      })
      try {
        const id = await ensureQuestionConversation(scope.id, `题目解释 · ${scope.stem.slice(0, 24)}`)
        // 换题换得太快: 这一份结果已经过期, 后面那次调用会自己收拾
        if (get().questionScope?.id !== scope.id) return
        // 不写 ACTIVE_KEY: 题目会话不该在刷新之后被当成"上次聊到一半的主会话"接回来 ——
        // 那时 questionScope 已经丢了, 接回来的会是一条没有题干上下文的普通对话。
        // 想再看它就再点一次「问小Q解释本题」, 会话还在库里等着。
        set({ activeId: id, messages: [], loadingMessages: true })
        const messages = await fetchMessages(id)
        if (get().questionScope?.id !== scope.id) return
        set({ messages, loadingMessages: false, activeSkillId: activeSkillFrom(messages) })
        // 第一次打开这道题: 直接把这句问出去(用户点的是"解释本题", 不是"打开一个空对话框")。
        // 已经聊过就只把上次的内容接回来, 不再自动发一次 —— 那会变成每点一次花一次钱。
        if (ask && messages.length === 0) await get().send(ask)
      } catch (err) {
        logError('assistant.openForQuestion', err)
        set({ error: userMessage(err), loadingMessages: false })
      }
    },

    exitQuestionScope: async () => {
      const back = get().mainActiveId
      set({
        questionScope: null, mainActiveId: null, view: 'chat',
        activeId: back, messages: [], loadingMessages: false, error: null,
      })
      writeActiveId(back)
      if (back) await get().openConversation(back)
    },

    renameConversation: async (id, title) => {
      const next = title.trim() || '新会话'
      const prev = get().conversations
      set({ conversations: prev.map((c) => (c.id === id ? { ...c, title: next } : c)) })
      try {
        await renameConversation(id, next)
      } catch (e) {
        logError('assistant.renameConversation', e)
        set({ conversations: prev, error: `重命名失败: ${userMessage(e)}` })
      }
    },

    deleteConversation: async (id) => {
      const prev = get().conversations
      set({ conversations: prev.filter((c) => c.id !== id) })
      if (get().activeId === id) get().startNewConversation()
      // 消息靠外键 ON DELETE CASCADE 一起走, 不用前端再删一遍
      try {
        await deleteConversation(id)
      } catch (e) {
        logError('assistant.deleteConversation', e)
        set({ conversations: prev, error: `删除失败: ${userMessage(e)}` })
      }
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
          logError('assistant.unknownCommand', err)
          set({ error: userMessage(err) })
        } finally {
          if (serial === sendSerial) set({ sending: false, emotion: 'happy' })
        }
        return
      }

      const serial = ++sendSerial
      const { mode, activeSkillId, questionScope } = get()
      const history: AssistantTurn[] = get().messages.map((m) => ({ role: m.role, text: m.content }))
      set({ sending: true, emotion: 'thinking', error: null })

      let conversationId: string
      try {
        const { id, created } = await ensureConversationId(get().activeId, titleFrom(value), questionScope?.id ?? null)
        conversationId = id
        // 题目会话不进列表(它属于某道题), 只有主会话才往列表前面塞
        if (created && !questionScope) {
          writeActiveId(id)
          set({ activeId: id, conversations: [created, ...get().conversations] })
        }
        await pushUserMessage(conversationId, value, serial)
      } catch (err) {
        logError('assistant.send', err)
        if (serial === sendSerial) {
          set({ sending: false, emotion: 'concerned', error: userMessage(err) })
        }
        return
      }

      const skill = activeSkillId
        ? await loadSkillDoc(activeSkillId, 'zh').catch(() => null) ?? undefined
        : undefined

      // 会话 id 一起带下去: 服务端拿它把这次调用的 tokens/成本归到这个会话上(见 Section 76),
      // 于是管理页「按会话」那一栏里的数, 和这里每条回答下面显示的是同一笔账。
      const { produceReply } = await loadRuntime()
      const outcome = await produceReply(value, history, mode, {
        skill, conversationId, question: questionScope?.context,
      })
      const { reply, emotion, scripted, usage } = outcome
      const { error } = await insertMessage({
        conversationId,
        role: 'assistant',
        content: reply.text,
        sub: reply.sub ?? null,
        tags: reply.tags ?? null,
        sources: reply.sources ?? null,
        followups: reply.followups ?? null,
        emotion,
        usage,
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
          usage,
        }],
        conversations: bumped,
      })
    },

    startCreateGeneration: async (messageId, spec) => {
      const meta = get().messages.find((m) => m.id === messageId)?.meta
      if (!meta || meta.kind !== 'create-draft') return
      const { normalizeSpec, generateFromSpec } = await loadCreate()
      const saved = normalizeSpec(spec)

      // 用户改过的参数先落库: 出题要几十秒, 中途刷新不该把刚填好的参数弄丢
      await writeMeta(messageId, { ...meta, spec: saved })

      if (!saved.subject) {
        set({ error: '先选学科再出题' })
        return
      }
      if (!hasAiConfig()) {
        set({ error: '当前没有配置可用的模型，没法出题' })
        return
      }

      set({ sending: true, emotion: 'thinking', error: null })
      try {
        const result = await generateFromSpec(saved)
        if (result.questions.length === 0) {
          set({ error: '模型这次没有给出可用题目，换个说法或换个资料再试' })
          return
        }
        await writeMeta(messageId, {
          ...meta,
          spec: saved,
          status: 'review',
          questions: result.questions,
          grounded: result.grounded,
          sources: result.sources,
          materialNote: result.materialNote,
        })
      } catch (err) {
        set({ error: `出题失败：${err instanceof Error ? err.message : String(err)}` })
      } finally {
        set({ sending: false, emotion: 'happy' })
      }
    },

    reopenCreateSpec: async (messageId) => {
      const meta = get().messages.find((m) => m.id === messageId)?.meta
      if (!meta || meta.kind !== 'create-draft') return
      await writeMeta(messageId, { ...meta, status: 'spec', questions: [], sources: [], materialNote: null })
    },

    confirmCreateDraft: async (messageId, edited) => {
      const meta = get().messages.find((m) => m.id === messageId)?.meta
      if (!meta || meta.kind !== 'create-draft' || meta.status !== 'review') return 0
      const { spec } = meta
      // 用户在卡片上改过知识点就按改后的走, 并且把改后的写回 meta ——
      // 否则入库的是带改动的题, 卡片上显示的却还是出题时那份, 刷新后会对不上
      const questions = edited ?? meta.questions
      if (!spec.subject) {
        set({ error: '先选学科再入库' })
        return 0
      }
      if (questions.length === 0) {
        set({ error: '没有可入库的题目' })
        return 0
      }
      try {
        const { insertCreatedQuestions } = await loadCreate()
        const inserted = await insertCreatedQuestions(questions, {
          subject: spec.subject,
          categories: spec.categories,
          importMode: 'littleq',
          verified: spec.markVerified,
        })
        await writeMeta(messageId, { ...meta, questions, status: 'inserted', insertedCount: inserted })
        return inserted
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
        return 0
      }
    },

    discardCreateDraft: async (messageId) => {
      const meta = get().messages.find((m) => m.id === messageId)?.meta
      if (!meta || meta.kind !== 'create-draft') return
      await writeMeta(messageId, { ...meta, status: 'discarded' })
    },

    /**
     * 换账号时清空。loadedForUserId 归 null 会让下一个用户重新拉会话列表 ——
     * 这个字段本来就是为"别把上一个人的会话标题留在界面上"而加的，reset 必须跟着它走。
     * 面板开合状态（open / view）是用户此刻的界面状态，不属于账号数据，保留。
     */
    reset: () => {
      sendSerial += 1
      set({
        conversations: [],
        conversationsLoaded: false,
        loadedForUserId: null,
        activeId: null,
        messages: [],
        loadingMessages: false,
        sending: false,
        emotion: 'happy',
        error: null,
        activeSkillId: null,
        pendingInput: '',
        questionScope: null,
        mainActiveId: null,
      })
    },
  }
})

registerUserScopedStore(() => useAssistantStore.getState().reset())
