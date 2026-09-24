/**
 * 知识点范围 —— 文献里的一段正文归属哪个知识点(纯逻辑这一半, 读写见 resource-kp-scopes-store)。
 *
 * 一句话: 「A14-医学教育教学概论与现代医学教育思想」= 《医学导论》第六章(第 74-90 页)。
 * 有了这条边, 知识点才知道自己的材料长在哪几篇哪几段; 阅读时看得出这一段属于哪个知识点,
 * 从知识点、专题、路线图都能一跳直达那一段。
 *
 * 权威值是**段落闭区间** [blockFrom, blockTo], 页码只是冗余:
 *   · 目录可以被换成人工版、重新解析后 block_index 会整体重排 —— 范围必须能在那一刻自己活下来,
 *     按目录项外键存的范围会静默指到别的段落上;
 *   · 纯分组项(「第一篇 总论」这种 MinerU 整个漏掉标题的层级)没有落点, 只能按页码算。
 *
 * 圈法两种(用户要的粒度): 从目录**一键圈一节**(到下一个目录项为止)或**圈整棵子树**
 * (到下一个同级或更高级目录项为止), 以及正文里**拖选任意区间**。
 */
import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'

export interface ResourceKpScope {
  id: string
  documentId: string
  /** 从知识点反查材料时要显示是哪一篇; 单篇列表里是空串 */
  documentTitle: string
  subject: string
  kp: string
  blockFrom: number
  blockTo: number
  pageFrom: number
  pageTo: number
  /** 圈的时候用的是哪条目录项(纯分组项/拖选区间时是空串) */
  tocTitle: string
  tocLevel: number
  note: string
  createdAt: string
}

/**
 * 待保存的一条: 还没落库, 所以没有 id 与时间。
 * 文献标题也不在这里 —— 它是读的时候按 document_id 补上的(decorate), 不是写进去的字段。
 */
export type ResourceKpScopeDraft = Omit<ResourceKpScope, 'id' | 'createdAt' | 'documentTitle'>

/** 圈一节(到下一个目录项) 还是连它下面的子节一起圈(到下一个同级/更高级目录项) */
export type ScopeSpan = 'section' | 'subtree'

/** 一段区间 —— 圈之前先算出来给用户看, 确认了才落库 */
export interface ScopeRange {
  blockFrom: number
  blockTo: number
  pageFrom: number
  pageTo: number
  tocTitle: string
  tocLevel: number
}

/**
 * 目录项 → 它管到哪一段正文。
 *
 * 起点: 目录项的落点; 纯分组项没有落点, 退化成"这一页的第一个块"。
 * 终点: 下一条目录项的落点前一块; 到最后一条就是全篇末尾。
 *   span='section' 用**下一条**(不论层级) —— 一节结束在下一节开始处, 那个"下一节"可能是
 *   兄弟小节, 也可能是下一章的标题;
 *   span='subtree' 用**下一个不深于它的** —— 这才是"整章", 中间的小节都还在里面。
 */
export function scopeRangeFromToc(
  toc: TocEntry[],
  index: number,
  blocks: ResourceBlock[],
  span: ScopeSpan = 'section',
): ScopeRange | null {
  const entry = toc[index]
  if (!entry || blocks.length === 0) return null

  const startIndex = firstBlockIndexAt(blocks, entry.blockIndex, entry.pageNo)
  const startPos = blocks.findIndex((b) => b.blockIndex === startIndex)
  if (startPos < 0) return null

  const boundary = boundaryEntry(toc, index, span)
  const boundaryPos = boundary
    ? blocks.findIndex((b) => b.blockIndex === firstBlockIndexAt(blocks, boundary.blockIndex, boundary.pageNo))
    : -1
  const endPos = Math.max(startPos, (boundaryPos < 0 ? blocks.length : boundaryPos) - 1)

  return {
    blockFrom: blocks[startPos].blockIndex,
    blockTo: blocks[endPos].blockIndex,
    pageFrom: blocks[startPos].pageNo,
    pageTo: blocks[endPos].pageNo,
    tocTitle: entry.title,
    tocLevel: entry.level,
  }
}

/** 正文里拖选出来的区间 → 一段范围(两端按数组位置夹回正文内, 前后拖反了也能用) */
export function scopeRangeFromBlocks(
  blocks: ResourceBlock[],
  fromBlockIndex: number,
  toBlockIndex: number,
): ScopeRange | null {
  const a = blocks.findIndex((b) => b.blockIndex === fromBlockIndex)
  const b = blocks.findIndex((x) => x.blockIndex === toBlockIndex)
  if (a < 0 || b < 0) return null
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return {
    blockFrom: blocks[lo].blockIndex,
    blockTo: blocks[hi].blockIndex,
    pageFrom: blocks[lo].pageNo,
    pageTo: blocks[hi].pageNo,
    tocTitle: '',
    tocLevel: 1,
  }
}

/** 区间里的第一块: 优先用落点, 落点没有或已失效(重新解析过)就退到那一页的第一块 */
function firstBlockIndexAt(blocks: ResourceBlock[], blockIndex: number | null, pageNo: number): number {
  if (blockIndex !== null && blocks.some((b) => b.blockIndex === blockIndex)) return blockIndex
  const onPage = blocks.find((b) => b.pageNo >= pageNo)
  return (onPage ?? blocks[0]).blockIndex
}

function boundaryEntry(toc: TocEntry[], index: number, span: ScopeSpan): TocEntry | null {
  const level = toc[index].level
  for (let i = index + 1; i < toc.length; i++) {
    if (span === 'section' || toc[i].level <= level) return toc[i]
  }
  return null
}

/**
 * 段落下标 → 覆盖它的范围。正文里的"这一段属于哪个知识点"标记就靠这张表。
 *
 * 一章几十上百块, 所以标记按区间展开而不是逐块查表 —— 阅读页一次只有一篇文献的范围。
 */
export function scopesByBlock(
  scopes: ResourceKpScope[],
  blocks: ResourceBlock[],
): Map<number, ResourceKpScope[]> {
  const out = new Map<number, ResourceKpScope[]>()
  for (const scope of scopes) {
    for (const block of blocks) {
      if (block.blockIndex < scope.blockFrom) continue
      if (block.blockIndex > scope.blockTo) break
      const list = out.get(block.blockIndex)
      if (list) list.push(scope)
      else out.set(block.blockIndex, [scope])
    }
  }
  return out
}

/**
 * 跳到这一段。
 * 和 RAG 引用、知识点依据用的是同一个地址(阅读页认得 ?block=), 所以从哪儿跳过来的体验一致。
 */
export function scopeAnchor(scope: Pick<ResourceKpScope, 'documentId' | 'blockFrom' | 'pageFrom'>): string {
  return `/resource-library/${scope.documentId}?block=${scope.blockFrom}`
}

/** 页码区间文案: "第 74-90 页" / "第 12 页" */
export function scopePages(scope: Pick<ResourceKpScope, 'pageFrom' | 'pageTo'>): string {
  return scope.pageTo > scope.pageFrom
    ? `第 ${scope.pageFrom}-${scope.pageTo} 页`
    : `第 ${scope.pageFrom} 页`
}

/** 清单里的一行: 页码 + 圈的时候用的那条目录项 */
export function scopeWhere(scope: Pick<ResourceKpScope, 'pageFrom' | 'pageTo' | 'tocTitle'>): string {
  return scope.tocTitle ? `${scopePages(scope)} · ${scope.tocTitle}` : scopePages(scope)
}

/** 知识点编码 → 检索/展示用: `A14-医学教育教学概论…` 太长, 清单里只留编码那段 */
export function kpCode(kp: string): string {
  const m = /^\s*([A-Za-z]{0,4}\d+)/.exec(kp)
  return m ? m[1] : kp.slice(0, 8)
}

/** 从知识点反查: 按文献分组, 每篇里的区间按位置排 —— "A14 的材料在《医学导论》第 74-90 页" */
export function groupScopesByDocument(
  scopes: ResourceKpScope[],
): { documentId: string; documentTitle: string; items: ResourceKpScope[] }[] {
  const byDoc = new Map<string, { documentId: string; documentTitle: string; items: ResourceKpScope[] }>()
  for (const scope of scopes) {
    const group = byDoc.get(scope.documentId)
    if (group) group.items.push(scope)
    else byDoc.set(scope.documentId, {
      documentId: scope.documentId,
      documentTitle: scope.documentTitle,
      items: [scope],
    })
  }
  return [...byDoc.values()].map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => a.blockFrom - b.blockFrom),
  }))
}

/** 同一段的同一个知识点只该有一条: 落库前的查重用(唯一索引也会挡, 但那时报的是 409) */
export function findDuplicate(
  scopes: ResourceKpScope[],
  draft: Pick<ResourceKpScopeDraft, 'subject' | 'kp' | 'blockFrom' | 'blockTo'>,
): ResourceKpScope | null {
  return scopes.find((s) =>
    s.subject === draft.subject && s.kp === draft.kp
    && s.blockFrom === draft.blockFrom && s.blockTo === draft.blockTo) ?? null
}

/** 新圈的范围和已有的重叠了多少 —— 提示"这一段已经挂在别的知识点上了", 不阻止(一章讲两三个知识点是常事) */
export function overlapping(scopes: ResourceKpScope[], range: Pick<ScopeRange, 'blockFrom' | 'blockTo'>): ResourceKpScope[] {
  return scopes.filter((s) => s.blockFrom <= range.blockTo && range.blockFrom <= s.blockTo)
}
