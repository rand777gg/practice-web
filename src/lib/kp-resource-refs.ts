/**
 * 知识点解读的「依据原文」—— 解读 ↔ 资料库段落的那条边(纯逻辑这一半)。
 *
 * 一条依据的形状就是 /create 的 CreateSelection (文献 + 页码区间 + 精确段落) 再加一句备注,
 * 所以"挑依据"能直接复用 ContentPickerDialog 那套 文献→章节→段落 的选择器, 展示也能复用
 * selectionSummary 的说法。落库时页码、文献标题、摘录由服务端补齐(见 Section 63)。
 *
 * 读写拆在 kp-resource-refs-store.ts: 和 resource-toc / resource-toc-store 同一个分法,
 * 为的是这一半能被 Node 直接跑了验证(见 scripts/kp-refs-smoke.mjs)。
 *
 * 三个使用方:
 *   编写端 KpExplanationManagerDialog —— 增删排序, 落库走 store 里的 saveKpRefs
 *   解读端 KpExplanationContent      —— 列依据 + 跳原文, 地址就是 RAG 引用用的那个 /resource-library/x?block=n
 *   阅读端 ResourceReader            —— 反查"这一块被哪些知识点引用", 靠 refsByBlock
 */
import type { CreateSelection } from '@/lib/create-spec'
import type { ResourceBlock } from '@/lib/resource-blocks'

export interface KpResourceRef {
  id: string
  subject: string
  kp: string
  /** 原文献被删时会变成 null, 这时只剩快照(标题/摘录)可看 */
  documentId: string | null
  blockIndex: number | null
  pageFrom: number
  pageTo: number
  /** 精确勾中的段落下标; 空数组 = 整个 [pageFrom, pageTo] 区间 */
  blocks: number[]
  docTitle: string
  label: string
  snippet: string
  note: string
  sortOrder: number
}

/** 编辑期的一条依据: 还没落库, 所以没有 id, 也就没有快照(摘录/标题由服务端补) */
export interface KpRefDraft {
  documentId: string
  docTitle: string
  label: string
  pageFrom: number
  pageTo: number
  blocks: number[]
  note: string
}

/** 选择器的结果 → 一条草稿依据。备注留空, 由编写者在列表里补 */
export function draftFromSelection(selection: CreateSelection): KpRefDraft {
  return {
    documentId: selection.documentId,
    docTitle: selection.documentTitle,
    label: selection.label,
    pageFrom: selection.from,
    pageTo: selection.to,
    blocks: selection.blocks,
    note: '',
  }
}

export function draftFromRef(ref: KpResourceRef): KpRefDraft | null {
  // 原文献已删的依据只剩快照, 没法再当"选择结果"编辑
  if (!ref.documentId) return null
  return {
    documentId: ref.documentId,
    docTitle: ref.docTitle,
    label: ref.label,
    pageFrom: ref.pageFrom,
    pageTo: ref.pageTo,
    blocks: ref.blocks,
    note: ref.note,
  }
}

/** "第 3 页" / "第 3-7 页"; 精确到段时把段数也带上, 因为那才是这条依据真正的落点 */
export function refWhere(ref: { pageFrom: number; pageTo: number; blocks: number[] }): string {
  const pages = ref.pageTo > ref.pageFrom ? `第 ${ref.pageFrom}-${ref.pageTo} 页` : `第 ${ref.pageFrom} 页`
  return ref.blocks.length > 0 ? `${pages} · ${ref.blocks.length} 段` : pages
}

/**
 * 跳转地址 —— 和 RAG 引用用的是同一个(阅读页认得 ?block=)。
 * 精确到段就用段落锚点; 整节(或重解析后映射失效)退化成页码, 至少能翻到那一页。
 */
export function refAnchor(ref: Pick<KpResourceRef, 'documentId' | 'blockIndex' | 'pageFrom'>): string | null {
  if (!ref.documentId) return null
  return ref.blockIndex !== null
    ? `/resource-library/${ref.documentId}?block=${ref.blockIndex}`
    : `/resource-library/${ref.documentId}?page=${ref.pageFrom}`
}

/**
 * 段落下标 → 引用它的依据。阅读页的标记就靠这张表。
 *
 * 整节的依据(blocks 为空)落到它的页码区间上: 一段都没勾时"这一节都是依据"才是本意,
 * 而区间里的每一块都可能正是用户读到的那一块。
 */
export function refsByBlock(
  refs: KpResourceRef[],
  blocks: ResourceBlock[],
): Map<number, KpResourceRef[]> {
  const known = new Set(blocks.map((b) => b.blockIndex))
  const out = new Map<number, KpResourceRef[]>()

  const add = (index: number, ref: KpResourceRef) => {
    const list = out.get(index)
    if (list) {
      if (!list.includes(ref)) list.push(ref)
    } else {
      out.set(index, [ref])
    }
  }

  for (const ref of refs) {
    if (ref.blocks.length > 0) {
      for (const i of ref.blocks) if (known.has(i)) add(i, ref)
      continue
    }
    for (const b of blocks) {
      if (b.pageNo >= ref.pageFrom && b.pageNo <= ref.pageTo) add(b.blockIndex, ref)
    }
  }
  return out
}

/**
 * 知识点编码 → 检索关键词。
 *
 * 编码形如 `A01-医学的演变、传播与交融`, 整串拿去搜正文必然一个字都不命中(正文里不会有编码),
 * 所以先剥掉开头的编码前缀。剥完还是空(编码就是名字)就用原串。
 */
export function searchTermForKp(kp: string): string {
  const stripped = kp.replace(/^[A-Za-z]{0,4}\d+\s*[-—–.、:：]\s*/, '').trim()
  return stripped || kp.trim()
}

/**
 * 关键词太长时的备选: 编码里那种「甲、乙、丙」式的长名字, 挑最长的一段单独搜。
 * 返回 null 表示没有可退的备选(本来就是一句话/一个词)。
 */
export function fallbackTermForKp(term: string): string | null {
  const parts = term.split(/[、，,；;]/).map((s) => s.trim()).filter((s) => s.length >= 2)
  if (parts.length < 2) return null
  return parts.reduce((a, b) => (b.length > a.length ? b : a))
}
