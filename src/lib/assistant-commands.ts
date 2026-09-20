/**
 * 小Q 的斜杠指令。
 *
 * 指令是**在本地拦下来**的, 不发给模型 —— 用户打 /export 是想导出, 不是想让模型写一篇关于
 * 导出的散文。所以 send() 里先解析, 认出来就走对应分支, 认不出来就当普通消息。
 *
 * 指令结果不是一段文本, 而是一张卡片(见 MessageMeta): /create 要能改学科分类再确认入库,
 * /export 要能点下载。卡片数据跟着消息一起存库(chat_messages.meta), 所以刷新之后
 * "还没确认的草稿"仍然在那儿等着确认。
 */
import type { ParsedQuestion } from '@/lib/ai/types'
import type { SkillId } from '@/lib/skills-catalog'

export type CommandId = 'create' | 'skill' | 'export' | 'help'

export interface CommandSpec {
  id: CommandId
  /** 不含斜杠, 也是用户要打的那个词 */
  name: string
  usage: string
  summary: string
  /** 只有管理员能用: 出题要往 questions 表写东西 */
  adminOnly?: boolean
  placeholder?: string
}

export const ASSISTANT_COMMANDS: CommandSpec[] = [
  {
    id: 'create',
    name: 'create',
    usage: '/create <要考的知识点或题干要求>',
    summary: '让 AI 出题，预览、改学科分类、确认后才进题库',
    adminOnly: true,
    placeholder: '例如：死锁产生的四个必要条件',
  },
  {
    id: 'skill',
    name: 'skill',
    usage: '/skill <技能名>',
    summary: '让 小Q 按平台技能文档带你做；不带参数列出全部技能',
    placeholder: '例如：local-judge0-setup',
  },
  {
    id: 'export',
    name: 'export',
    usage: '/export',
    summary: '把当前会话导出成 zip：会话.md + 会话.json + 引用原文.md',
  },
  {
    id: 'help',
    name: 'help',
    usage: '/help',
    summary: '列出全部指令',
  },
]

export function findCommand(name: string): CommandSpec | undefined {
  const key = name.trim().toLowerCase()
  return ASSISTANT_COMMANDS.find((c) => c.name === key)
}

export type CommandParse =
  | { kind: 'command'; spec: CommandSpec; args: string; raw: string }
  | { kind: 'unknown'; name: string; raw: string }

export function parseCommand(text: string): CommandParse | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const [head, ...rest] = trimmed.slice(1).split(/\s+/)
  const spec = findCommand(head)
  if (!spec) return { kind: 'unknown', name: head, raw: trimmed }
  return { kind: 'command', spec, args: rest.join(' ').trim(), raw: trimmed }
}

/**
 * 输入框里正在打指令名时的候选前缀。
 * 只在"/"后面还没有空格时给候选 —— 一旦开始写参数(比如 /create 死锁), 再弹菜单就是干扰。
 * 用 trimStart 而不是 trim: 补全后输入框里是 "/create "(带一个空格方便接着写参数),
 * 这个尾巴上的空格必须让菜单收起来, 否则补全完菜单还杵在那儿。
 */
export function commandPrefix(text: string): string | null {
  const match = /^\/([a-z]*)$/i.exec(text.trimStart())
  return match ? match[1].toLowerCase() : null
}

export function matchCommands(prefix: string): CommandSpec[] {
  return ASSISTANT_COMMANDS.filter((c) => c.name.startsWith(prefix))
}

// ── 消息卡片 ──

export interface QuestionDraftMeta {
  kind: 'question-draft'
  questions: ParsedQuestion[]
  /** 入库前必须确认的元信息, 出题人自己最清楚该归到哪个学科 */
  subject: string | null
  categories: string[]
  status: 'pending' | 'inserted' | 'discarded'
  insertedCount?: number
  /** 出题时用的原始要求, 便于回头核对 AI 有没有跑偏 */
  prompt: string
  /** true = 材料来自平台检索结果; false = 模型凭自身知识出的, 卡片要提示逐条核对 */
  grounded: boolean
}

export interface SkillMeta {
  kind: 'skill'
  /** set = 已切到这个技能; clear = 关掉了; list = 只是列了一下, 不影响当前生效的技能 */
  action: 'set' | 'clear' | 'list'
  /** null = 当前没有技能 */
  skillId: SkillId | null
  skillTitle: string
}

export interface ExportMeta {
  kind: 'export'
  filename: string
  bytes: number
  turns: number
}

export interface HelpMeta {
  kind: 'help'
}

export type MessageMeta = QuestionDraftMeta | SkillMeta | ExportMeta | HelpMeta

export function isQuestionDraft(meta: MessageMeta | null | undefined): meta is QuestionDraftMeta {
  return meta?.kind === 'question-draft'
}

/**
 * 当前会话生效的技能 —— 从消息里推出来, 而不是单独存一个字段。
 * 这样它就跟着会话一起被持久化和回溯, 不需要再加一列; /skill off 也只是多一条消息。
 */
export function activeSkillFrom(messages: { meta?: MessageMeta | null }[]): SkillId | null {
  let active: SkillId | null = null
  for (const message of messages) {
    const meta = message.meta
    if (meta?.kind === 'skill' && meta.action !== 'list') active = meta.skillId
  }
  return active
}

/**
 * 取技能文档。动态 import: 这两份 SKILL.md 加起来十几 KB, 只有真的打 /skill 才需要,
 * 不该让它跟着小Q 面板进首屏包。
 */
export async function loadSkillDoc(id: SkillId, lang: 'zh' | 'en'): Promise<{ title: string; markdown: string } | null> {
  const catalog = await import('@/lib/skills-catalog')
  const doc = catalog.SKILL_DOCS.find((s) => s.id === id)
  if (!doc) return null
  return lang === 'zh'
    ? { title: doc.titleZh, markdown: doc.markdownZh }
    : { title: doc.titleEn, markdown: doc.markdownEn }
}

export async function listSkills(lang: 'zh' | 'en'): Promise<{ id: SkillId; title: string; summary: string }[]> {
  const catalog = await import('@/lib/skills-catalog')
  return catalog.SKILL_DOCS.map((s) => ({
    id: s.id,
    title: lang === 'zh' ? s.titleZh : s.titleEn,
    summary: lang === 'zh' ? s.summaryZh : s.summaryEn,
  }))
}
