/**
 * 题目 ↔ 信源的软链接 —— 纯逻辑这一半(读写见 question-links-store.ts)。
 *
 * 信源就是 RAG 索引里那五类 (文献 / 题库 / 知识点解读 / 学科解读 / 公开笔记), source_id
 * 沿用 rag_chunks 那一套口径(见 supabase/functions/rag-index): 文献和题目是 uuid, 公开笔记是
 * user_answers.id, 知识点解读是 `${subject}::${kp}`, 学科解读就是学科名。前端认同一套编码,
 * 挂上去的链接才能被信源那一侧反查回来。
 *
 * 三个使用方:
 *   练习页 QuestionSources   —— 题面下方那张清单(增删) + 挑信源的检索
 *   小Q 回答 AssistantChat   —— 引用条目上的「挂到本题」
 *   信源侧 LinkedQuestions   —— 反查"这条信源上挂了哪些题"(见 question-links-store)
 */
import { RAG_SOURCE_LABEL, type RagHit, type RagSource } from '@/lib/rag'
import type { AssistantSource } from '@/lib/assistant-demo'

/**
 * 清单里每种信源叫什么。
 * 不复用 RAG_SOURCE_LABEL: 那边叫「题库」, 而这里的右端是一道具体的题, 说「相关题」才像人话。
 */
export const LINK_SOURCE_LABEL: Record<RagSource, string> = {
  resource: '文献',
  question: '相关题',
  kp: '知识点解读',
  subject: '学科解读',
  note: '公开笔记',
}

/** 记不住就不显示: 反查要拿它拼 source_id, 所以宁可空着也不要猜 */
export const LINK_SOURCE_ORDER: RagSource[] = ['resource', 'kp', 'subject', 'note', 'question']

/**
 * "整篇/整条, 不是某一段"。
 * 用 -1 而不是 NULL: 唯一键(user_id, question_id, source, source_id, block_index)里的 NULL
 * 互不相等, 同一段会被挂进去两次(见迁移 Section 79)。
 */
export const WHOLE_SOURCE = -1

export interface QuestionSourceLink {
  id: string
  source: RagSource
  sourceId: string
  /** 段落下标; WHOLE_SOURCE = 整篇/整条 */
  blockIndex: number
  pageNo: number | null
  label: string
  subLabel: string | null
  anchor: string | null
  snippet: string
  note: string
  /** littleq = 从小Q 这轮回答的引用里挂的; manual = 自己搜出来挑的 */
  origin: 'manual' | 'littleq'
  createdAt: string
}

/** 待挂的一条: 还没落库, 所以没有 id 与时间 */
export type QuestionLinkDraft = Omit<QuestionSourceLink, 'id' | 'createdAt'>

/** 知识点解读在 rag_chunks 里的 source_id */
export function kpSourceId(subject: string, kp: string): string {
  return `${subject}::${kp}`
}

/** 反过来拆开; 拆不出两边就返回 null(旧数据里可能只有 kp 名) */
export function parseKpSourceId(sourceId: string): { subject: string; kp: string } | null {
  const at = sourceId.indexOf('::')
  if (at <= 0 || at === sourceId.length - 2) return null
  return { subject: sourceId.slice(0, at), kp: sourceId.slice(at + 2) }
}

/**
 * 这条链接往哪跳。
 *
 * 文献走检索时算好的段落锚点(和 RAG 引用、知识点依据用的是同一个地址)。题目给一条练习页的
 * 深链 —— 「从信源链回具体某一题」正是这个功能存在的理由(见 lib/rag 的 anchor 约定:
 * question/note 那条路是空锚点, 所以这里自己补)。
 */
export function linkAnchor(source: RagSource, sourceId: string, anchor?: string | null): string | null {
  if (anchor) return anchor
  if (source === 'question') return `/practice?q=${sourceId}`
  if (source === 'note') return '/notes'
  return null
}

/** 清单里的一行标题: 文献名 · 小节 · 页码 / 解读名 / 题干预览 */
export function linkTitle(link: Pick<QuestionSourceLink, 'label' | 'subLabel' | 'pageNo'>): string {
  const where = link.pageNo !== null ? ` · 第 ${link.pageNo} 页` : ''
  const sub = link.subLabel && link.subLabel !== link.label ? ` · ${link.subLabel}` : ''
  return `${link.label || '（无标题）'}${sub}${where}`
}

/** 内容压成一行, 供清单里的摘录用 */
export function flattenSnippet(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** 一次检索的结果 → 一条待挂的链接 */
export function draftFromHit(hit: RagHit, origin: QuestionLinkDraft['origin'] = 'manual'): QuestionLinkDraft {
  return {
    source: hit.source,
    sourceId: hit.sourceId,
    blockIndex: hit.blockIndex ?? WHOLE_SOURCE,
    pageNo: hit.pageNo,
    label: hit.label,
    subLabel: hit.subLabel,
    anchor: linkAnchor(hit.source, hit.sourceId, hit.anchor),
    snippet: flattenSnippet(hit.content),
    note: '',
    origin,
  }
}

/**
 * 小Q 回答里的一条引用 → 一条待挂的链接。
 * 老消息的引用没有 source/sourceId(那几列当时还没写), 那种情况返回 null —— 挂上去也没法反查。
 */
export function draftFromAssistantSource(
  source: AssistantSource,
  origin: QuestionLinkDraft['origin'] = 'littleq',
): QuestionLinkDraft | null {
  if (!source.source || !source.sourceId) return null
  return {
    source: source.source,
    sourceId: source.sourceId,
    blockIndex: source.blockIndex ?? WHOLE_SOURCE,
    pageNo: source.pageNo ?? null,
    label: source.label,
    subLabel: null,
    anchor: linkAnchor(source.source, source.sourceId, source.anchor),
    snippet: flattenSnippet(source.snippet ?? ''),
    note: '',
    origin,
  }
}

/** 同一条信源(同一段)在待挂清单里只留一份 —— 唯一键挡得住写库, 但用户会看到两次点击都没反应 */
export function dedupeDrafts(drafts: QuestionLinkDraft[]): QuestionLinkDraft[] {
  const seen = new Set<string>()
  const out: QuestionLinkDraft[] = []
  for (const draft of drafts) {
    const key = draftKey(draft)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(draft)
  }
  return out
}

export function draftKey(draft: Pick<QuestionLinkDraft, 'source' | 'sourceId' | 'blockIndex'>): string {
  return `${draft.source}\u0000${draft.sourceId}\u0000${draft.blockIndex}`
}

/** 已经挂上的那些 key —— 挑信源时用来把已挂的勾掉 */
export function linkedKeys(links: QuestionSourceLink[]): Set<string> {
  return new Set(links.map(draftKey))
}

/** 按信源分组(清单的展示顺序): 文献 → 解读 → 学科 → 笔记 → 相关题 */
export function groupBySource(links: QuestionSourceLink[]): { source: RagSource; items: QuestionSourceLink[] }[] {
  return LINK_SOURCE_ORDER
    .map((source) => ({ source, items: links.filter((l) => l.source === source) }))
    .filter((g) => g.items.length > 0)
}

/** 信源类型的中文名(清单徽章; 与 rag 那边的叫法统一到这一处) */
export function sourceLabel(source: RagSource): string {
  return LINK_SOURCE_LABEL[source] ?? RAG_SOURCE_LABEL[source] ?? source
}
