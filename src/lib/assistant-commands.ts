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
import type { RagSource } from '@/lib/rag'
import type { SkillId } from '@/lib/skills-catalog'
import type { CreateSpec } from '@/lib/assistant-create'
// 相对路径带扩展名: 这个模块要能被 Node 直接跑单元测试(见 scripts/assistant-commands-smoke.mjs)
import { asQuestionType, normalizeSpec } from './create-spec.ts'

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
    usage: '/create <要考的知识点，或者从哪篇文献出>',
    summary: '先跟你确认资料库、数量、题型、学科分类，出题后再确认一遍才入库',
    adminOnly: true,
    placeholder: '例如：从医学史里出几道古罗马医学流派的题',
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

const TITLE_MAX = 24

/**
 * 会话标题。直接取用户第一句话 —— 让模型起标题要多花一次调用, 而用户自己写的那句往往更准。
 *
 * 指令名本身对列表标题没有信息量: 一屏 "/create …" 什么都看不出来, 所以把开头的 "/xxx"
 * 摘掉; 万一整句就只有指令名, 那就留着(否则标题会是空的)。
 */
export function conversationTitleFrom(text: string): string {
  const withoutCommand = text.replace(/^\/\w+\s*/, '')
  const flat = (withoutCommand || text).replace(/\s+/g, ' ').trim()
  if (!flat) return '新会话'
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat
}

// ── 消息卡片 ──

/**
 * /create 的卡片状态。
 *
 * 'spec' 是"先对齐需求"那一步: 参数还没定, 题也还没出; 用户在卡片上确认/修改之后才走到
 * 'review'。分两阶段而不是一次到底, 是因为跑偏的代价不对称 —— 出 3 道题几毛钱, 但在两千道
 * 题的题库里收拾跑偏的题, 花的是人的时间。
 */
export interface CreateDraftMeta {
  kind: 'create-draft'
  spec: CreateSpec
  /** 模型对用户那句话的复述, 让用户一眼看出有没有理解偏 */
  understanding: string
  status: 'spec' | 'review' | 'inserted' | 'discarded'
  questions: ParsedQuestion[]
  /** 题目材料是否来自平台资料 */
  grounded: boolean
  /** 出题依据了哪几处(来源类型 + 文献名 + 页码 + 跳转地址) */
  sources: { type: RagSource; label: string; pageNo: number | null; anchor: string | null }[]
  /** 用户填的范围一条都没匹配上 —— 要如实说, 不能假装限定住了 */
  scopeMissed: boolean
  insertedCount?: number
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

export type MessageMeta = CreateDraftMeta | SkillMeta | ExportMeta | HelpMeta

export function isCreateDraft(meta: MessageMeta | null | undefined): meta is CreateDraftMeta {
  return meta?.kind === 'create-draft'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asParsedQuestion(raw: unknown): ParsedQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  const text = asString(q.question_text)
  if (!text.trim()) return null
  return {
    // 题型必须落在平台支持的那几种里: 落不进去的退回单选, 否则入库时会被 CHECK 挡下来,
    // 而那时候题已经生成完, 白花钱
    question_type: asQuestionType(q.question_type) ?? 'single_choice',
    question_text: text,
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct_answer: (q.correct_answer ?? '') as ParsedQuestion['correct_answer'],
    analysis: asString(q.analysis) || undefined,
    answer_explanation: asString(q.answer_explanation) || undefined,
    key_points: asString(q.key_points) || undefined,
    source_page: asString(q.source_page) || undefined,
    allow_unordered: q.allow_unordered === true,
  }
}

/**
 * 从库里读出来的 meta 一律先过这里。
 *
 * 为什么必须有这一层: 卡片的形状会随版本变(加 sources、scope 从字符串变成页码区间…),
 * 而库里躺着的是旧版本写下的 meta。直接当新形状用就会像这样炸在渲染里 ——
 * 用户看到的是整页 "Unexpected Application Error", 而不是一句"这张卡片是旧版本存的"。
 * 认不出来的 kind 直接丢弃: 正文还在, 只是不再有那张卡片。
 */
export function normalizeMeta(raw: unknown): MessageMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>

  switch (m.kind) {
    case 'create-draft': {
      const status = m.status
      const citation = Array.isArray(m.sources) ? m.sources : []
      return {
        kind: 'create-draft',
        spec: normalizeSpec((m.spec ?? {}) as Partial<CreateSpec>),
        understanding: asString(m.understanding),
        status: status === 'review' || status === 'inserted' || status === 'discarded' ? status : 'spec',
        questions: (Array.isArray(m.questions) ? m.questions : [])
          .map(asParsedQuestion)
          .filter((q): q is ParsedQuestion => q !== null),
        grounded: m.grounded === true,
        sources: citation
          .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
          .map((s) => ({
            type: (ALL_RAG_SOURCES as readonly string[]).includes(asString(s.type))
              ? (asString(s.type) as RagSource)
              : 'resource' as RagSource,
            label: asString(s.label),
            pageNo: typeof s.pageNo === 'number' ? s.pageNo : null,
            anchor: asString(s.anchor) || null,
          })),
        scopeMissed: m.scopeMissed === true,
        insertedCount: typeof m.insertedCount === 'number' ? m.insertedCount : undefined,
      }
    }

    case 'skill': {
      const action = m.action
      const id = asString(m.skillId)
      return {
        kind: 'skill',
        action: action === 'set' || action === 'clear' ? action : 'list',
        // 技能 id 也过一遍白名单: 旧版/手改的 meta 里可能是个已经不存在的技能
        skillId: (SKILL_IDS as readonly string[]).includes(id) ? (id as SkillId) : null,
        skillTitle: asString(m.skillTitle),
      }
    }

    case 'export':
      return {
        kind: 'export',
        filename: asString(m.filename) || '会话.zip',
        bytes: typeof m.bytes === 'number' ? m.bytes : 0,
        turns: typeof m.turns === 'number' ? m.turns : 0,
      }

    case 'help':
      return { kind: 'help' }

    default:
      return null
  }
}

const ALL_RAG_SOURCES = ['resource', 'question', 'kp', 'subject', 'note'] as const
const SKILL_IDS = ['local-supabase-docker', 'local-judge0-setup'] as const

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
