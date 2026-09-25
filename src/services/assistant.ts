/**
 * 小Q 对话的持久化层（chat_conversations / chat_messages）。
 *
 * 会话记录带的是引用出处(文献名 + 页码 + 段落跳转地址)：换设备或清缓存就找不回来，
 * 所以这里的写操作一律把失败抛成 AppError —— 以前失败只往 store.error 塞一行字、
 * 写没写成在别处就成了没人管的事。
 *
 * AI 运行时(produceReply / lib/ai)不在这里：那层只管生成，跟存哪儿无关。
 */
import type { Json } from '@/types/database'
import type { AssistantSource, LittleQEmotion } from '@/lib/assistant-demo'
import { normalizeMeta, type MessageMeta } from '@/lib/assistant-commands'
import { normalizeRoundUsage, type AiRoundUsage } from '@/lib/ai-usage'
import { db, run, runList, toJson, type Insert, type QueryOptions } from './db'
import { AppError } from './errors'
import { assertColumns } from './columns'

/** chat_messages 里本服务读的字段集 */
export type MessageSource = {
  id: number
  role: string
  content: string
  sub: string | null
  tags: string[] | null
  sources: Json | null
  followups: string[] | null
  meta: Json | null
  usage: Json | null
  created_at: string
}

export const MESSAGE_COLUMNS = assertColumns<MessageSource>()(
  'id, role, content, sub, tags, sources, followups, meta, usage, created_at',
)

/** 插入后只要回执 id：这两处调用(用户消息、小Q 回答)都靠它给屏幕上的那条消息定身份 */
const MESSAGE_ID_COLUMNS = assertColumns<Pick<MessageSource, 'id'>>()('id')

/** chat_conversations 里本服务读的字段集：列表、新建回执、题目会话查找都只要这三列 */
export type ConversationSource = {
  id: string
  title: string
  updated_at: string
}

export const CONVERSATION_LIST_COLUMNS = assertColumns<ConversationSource>()('id, title, updated_at')

const CONVERSATION_ID_COLUMNS = assertColumns<Pick<ConversationSource, 'id'>>()('id')

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: number
  role: ChatRole
  content: string
  sub: string | null
  tags: string[] | null
  sources: AssistantSource[] | null
  followups: string[] | null
  /** 指令卡片的结构化数据; 普通对话是 null */
  meta: MessageMeta | null
  /** 这一轮花掉的 tokens(用户消息是 null; 内置剧本答的也是 null —— 它没调模型) */
  usage: AiRoundUsage | null
  createdAt: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  updated_at: string
}

const SOURCE_TYPES = ['题库', '专题', '文献', '真题', '笔记'] as const
const RAG_SOURCES = ['resource', 'question', 'kp', 'subject', 'note'] as const

function toChatRole(value: string): ChatRole {
  return value === 'user' ? 'user' : 'assistant'
}

function asString(value: Json | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: Json | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** 一条引用。没有名字的丢掉 —— 清单上出现一条没法核对的东西，整张清单就都不值得信了 */
function toSource(raw: Json): AssistantSource | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const label = asString(raw.label)
  if (!label) return null
  return {
    label,
    // 认不出的类型退回"专题"：type 只是条目标题旁边那个小标签，不值得为它丢掉整条依据
    type: SOURCE_TYPES.find((t) => t === raw.type) ?? '专题',
    // index / anchor / source 这些是后加的列，老消息没有 —— 全部保持可选，页面按缺省渲染
    index: asNumber(raw.index),
    anchor: asString(raw.anchor) || undefined,
    snippet: asString(raw.snippet) || undefined,
    pageNo: asNumber(raw.pageNo),
    source: RAG_SOURCES.find((s) => s === raw.source),
    sourceId: asString(raw.sourceId) || undefined,
    blockIndex: asNumber(raw.blockIndex) ?? null,
  }
}

/** JSONB 的读边界：每条引用都过一遍形状，一条坏数据不该让整个会话读不出来 */
function toSources(raw: Json | null): AssistantSource[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.map(toSource).filter((item): item is AssistantSource => item !== null)
  return out.length > 0 ? out : null
}

/** DB 行 → 领域对象。JSONB 与 role 的窄化都在这里收口，UI 层不再各写一遍 parse。 */
export function toChatMessage(row: MessageSource): ChatMessage {
  return {
    id: row.id,
    role: toChatRole(row.role),
    content: row.content,
    sub: row.sub,
    tags: row.tags,
    sources: toSources(row.sources),
    followups: row.followups,
    meta: normalizeMeta(row.meta),
    usage: normalizeRoundUsage(row.usage),
    createdAt: row.created_at,
  }
}

export interface NewMessage {
  conversationId: string
  role: ChatRole
  content: string
  sub?: string | null
  tags?: string[] | null
  sources?: AssistantSource[] | null
  followups?: string[] | null
  meta?: MessageMeta | null
  /** 目前只写不读：状态行用的是 store 里那份"当前情绪"，不跟历史消息走 */
  emotion?: LittleQEmotion | null
  usage?: AiRoundUsage | null
}

/** 会话列表：题目专属会话不进这张列表(它属于某一道题)，只列主会话 */
export async function fetchConversations(options: QueryOptions = {}): Promise<ConversationSummary[]> {
  const base = db
    .from('chat_conversations')
    .select(CONVERSATION_LIST_COLUMNS)
    .is('question_id', null)
    .order('updated_at', { ascending: false })
    .limit(100)
  return runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'assistant.fetchConversations' },
  )
}

/** 第一句话落库时才建会话行：用户点开又关掉不该在列表里留下一堆空会话 */
export async function createConversation(
  userId: string,
  input: { title: string; questionId?: string | null },
  options: QueryOptions = {},
): Promise<ConversationSummary> {
  const row: Insert<'chat_conversations'> = {
    user_id: userId,
    title: input.title,
    question_id: input.questionId ?? null,
  }
  const base = db.from('chat_conversations').insert(row).select(CONVERSATION_LIST_COLUMNS)
  const created = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'assistant.createConversation' },
  )
  // single() 的结果类型带 null；真的没回执时 PostgREST 已经报了 PGRST116，这一行只是把类型收干净
  if (!created) throw new AppError({ kind: 'not_found', message: 'assistant.createConversation: 会话没建起来' })
  return { id: created.id, title: created.title, updated_at: created.updated_at }
}

/** 一道题只该有一个会话(库里有唯一索引兜着)，所以这里可以按 question_id 取唯一那一条 */
export async function findConversationIdByQuestion(
  questionId: string,
  options: QueryOptions = {},
): Promise<string | null> {
  const base = db.from('chat_conversations').select(CONVERSATION_ID_COLUMNS).eq('question_id', questionId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'assistant.findConversationIdByQuestion' },
  )
  return row?.id ?? null
}

export async function renameConversation(id: string, title: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('chat_conversations').update({ title }).eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'assistant.renameConversation' },
  )
}

/** 消息靠外键 ON DELETE CASCADE 一起走，不用前端再删一遍 */
export async function deleteConversation(id: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('chat_conversations').delete().eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'assistant.deleteConversation' },
  )
}

export async function fetchMessages(conversationId: string, options: QueryOptions = {}): Promise<ChatMessage[]> {
  const base = db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('id', { ascending: true })
    .limit(500)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'assistant.fetchMessages' },
  )
  return rows.map(toChatMessage)
}

/**
 * 落一条消息，返回它的 id。
 *
 * 失败抛出去而不是返回出来：调用方要据此决定"这条没存上"要不要告诉用户(消息已经显示在屏幕上了)，
 * 把错误当返回值随手丢掉，等于把"没存上"当成"存上了"。
 */
export async function appendMessage(input: NewMessage, options: QueryOptions = {}): Promise<number> {
  const row: Insert<'chat_messages'> = {
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
    sub: input.sub ?? null,
    tags: input.tags ?? null,
    sources: input.sources ? toJson(input.sources) : null,
    followups: input.followups ?? null,
    meta: input.meta ? toJson(input.meta) : null,
    emotion: input.emotion ?? null,
    usage: input.usage ? toJson(input.usage) : null,
  }
  const base = db.from('chat_messages').insert(row).select(MESSAGE_ID_COLUMNS)
  const created = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'assistant.appendMessage' },
  )
  if (!created) throw new AppError({ kind: 'not_found', message: 'assistant.appendMessage: 消息没落库' })
  return created.id
}

/**
 * 卡片状态改了就立刻落库。
 * 不落库的话刷新之后卡片会退回上一步 —— 用户明明确认过，回来却又是"待确认"，
 * 会以为没成功，然后再点一次，于是同一批题入库两遍。
 */
export async function updateMessageMeta(
  messageId: number,
  meta: MessageMeta,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('chat_messages').update({ meta: toJson(meta) }).eq('id', messageId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'assistant.updateMessageMeta' },
  )
}
