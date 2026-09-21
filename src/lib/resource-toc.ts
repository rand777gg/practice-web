/**
 * 人工目录 —— MinerU 解析错的目录由管理员手工修正。
 *
 * 目录本身不落库, 是读的时候从 resource_blocks 的 heading_level 现推的(buildToc)。
 * 人一旦改过, 就把整份目录存进 resource_toc_entries 并以它为准
 * (resource_documents.toc_source = 'manual'), 没改过就还是现推。
 * 所以这个文件只管"人工那一份"的编辑运算, 读写在同目录的 resource-toc-store.ts。
 *
 * 编辑全在 TocDraftEntry[] 上做: 它是 TocEntry 的编辑态, 多带一个稳定 id。
 * 必须有这个 id —— 拖动和右键都按 id 认目标: 按下标认的话, 插一行/挪一行之后下标就变了,
 * 正在编辑的那一行会串到别的条目上; level 也不行, 改层级本身就是编辑动作之一。
 *
 * 拆成两个文件是为了这一半能被 Node 直接跑单元测试(scripts/resource-toc-smoke.mjs):
 * 带 supabase 的那一半一 import 就要解析 '@/' 别名和 Vite 环境变量, 跑不起来。
 * 和 create-spec.ts(纯) / assistant-create.ts(IO) 是同一个分法。
 *
 * 贯穿全文件的不变式: 序列[0] 是 1 级, 之后每条最多比前一条深一级。所有会动到 level 的
 * 操作都过 normalizeLevels 收口, 因为下游 ResourceToc 是按 level 用栈还原树的 —— 序列一非法,
 * 还原出来的树和编辑器里看到的缩进就不是一回事了, 而且两边都不报错。
 *
 * 另一个贯穿的不变式: **动一条就是动它整棵子树**。目录里的父子只是缩进, 单独挪走一条
 * 父条目、把子条目留在原地, 会让层级序列变得非法, 再被规范化一夹, 那些子条目就认了别的
 * 条目当爹 —— 整棵树悄悄挪窝, 且全程不报错。所以搬移/升降级都按子树整体进行。
 */

import type { ResourceBlock, TocEntry } from '@/lib/resource-blocks'

export const TOC_LEVEL_MAX = 6

export interface TocDraftEntry {
  /** 数据库行 id; 还没保存的新条目用负数临时 id */
  id: number
  level: number
  title: string
  blockIndex: number | null
  pageNo: number
}

export function draftFromToc(entries: TocEntry[]): TocDraftEntry[] {
  return entries.map((e) => ({
    id: e.key,
    level: e.level,
    title: e.title,
    blockIndex: e.blockIndex,
    pageNo: e.pageNo,
  }))
}

export function tocFromDraft(entries: TocDraftEntry[]): TocEntry[] {
  return entries.map((e) => ({
    key: e.id,
    level: e.level,
    title: e.title,
    pageNo: e.pageNo,
    blockIndex: e.blockIndex,
  }))
}

/**
 * 把层级夹回一棵合法的树: 第一条必须是 1 级, 之后每条最多比前一条深一级。
 *
 * 没有这条约束, 「取消缩进」能把第 3 条按到 1 级而第 2 条还停在 3 级 —— 下游
 * (ResourceToc.buildTree)是按 level 用栈还原层级的, 这种序列会还原出一棵和编辑器里
 * 看到的缩进完全不一样的树, 而两边都不报错。
 */
export function normalizeLevels(entries: TocDraftEntry[]): TocDraftEntry[] {
  let prev = 0
  return entries.map((e) => {
    const level = Math.max(1, Math.min(e.level, prev + 1, TOC_LEVEL_MAX))
    prev = level
    return level === e.level ? e : { ...e, level }
  })
}

/** 新条目的临时 id: 取比现有最小 id 还小 —— 负数, 不会和数据库行 id 撞 */
export function nextTempId(entries: TocDraftEntry[]): number {
  const min = entries.reduce((m, e) => Math.min(m, e.id), 0)
  return min <= 0 ? min - 1 : -1
}

/**
 * 一条的子树半开区间 [start, end): 序列合法时正好是"它自己 + 它所有的后代"。
 * 从 i+1 往后找第一个层级不深于它的位置 —— 那些不深于它的条目是它后面的兄弟或更上层的。
 */
export function subtreeRange(entries: TocDraftEntry[], index: number): { start: number; end: number } {
  if (index < 0 || index >= entries.length) return { start: index, end: index }
  let end = index + 1
  while (end < entries.length && entries[end].level > entries[index].level) end++
  return { start: index, end }
}

/** 有没有子条目 —— 右键菜单里"删除"要据此改说法(子条目会上提, 不会被一起删) */
export function hasChildren(entries: TocDraftEntry[], index: number): boolean {
  const { start, end } = subtreeRange(entries, index)
  return end > start + 1
}

/**
 * 同级的上一条起始位置; 没有同级(它是父条目的第一个孩子)时返回 -1。
 *
 * 往回走过所有比它深的条目 —— 那些是上一个同级子树里的后代, 不是它的同级。
 * 停下来的那条如果和它同层, 那就是上一条同级(中间那些都比它深, 所以上一条的子树
 * 正好结束在它这里); 如果比它浅, 说明它是那条的第一个子节点, 上面已经没有同级了。
 */
function previousSiblingStart(entries: TocDraftEntry[], index: number): number {
  let k = index - 1
  while (k >= 0 && entries[k].level > entries[index].level) k--
  if (k < 0 || entries[k].level !== entries[index].level) return -1
  return k
}

/**
 * 把整棵子树搬到"原序列里第 to 条现在所在的位置", to 可以是 entries.length(搬到末尾)。
 *
 * 拖动落点、上移下移都走它一个入口 —— 两套换位逻辑迟早会在边界上不一致。
 * 落在自己子树范围内(含紧贴前后的两个位置)就是没动, 直接原样返回,
 * 否则一次拖拽会先把子树挪走再把它的副本插回来。
 */
export function moveSubtreeTo(entries: TocDraftEntry[], index: number, to: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length) return entries
  const { start, end } = subtreeRange(entries, index)
  const target = Math.max(0, Math.min(entries.length, to))
  if (target >= start && target <= end) return entries

  const block = entries.slice(start, end)
  const rest = [...entries.slice(0, start), ...entries.slice(end)]
  // 目标在块之前时下标不变; 在块之后时要减掉被抽走的这一段长度
  const at = target <= start ? target : target - block.length
  return normalizeLevels([...rest.slice(0, at), ...block, ...rest.slice(at)])
}

/**
 * 整棵子树一起升降级: 根和它所有后代平移同样的量, 相对深度不变。
 *
 * 只改根不改后代的话, 一条 1 级升到 2 级、它的 2 级子条目就变成了同级 ——
 * 那不是"把这一节往下挪一层", 而是把整棵子树拆平了。
 */
export function shiftSubtreeLevel(entries: TocDraftEntry[], index: number, delta: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length || delta === 0) return entries
  const { start, end } = subtreeRange(entries, index)
  return normalizeLevels(entries.map((e, i) => {
    if (i < start || i >= end) return e
    return { ...e, level: Math.max(1, Math.min(e.level + delta, TOC_LEVEL_MAX)) }
  }))
}

export function updateEntry(
  entries: TocDraftEntry[],
  index: number,
  patch: Partial<Omit<TocDraftEntry, 'id'>>,
): TocDraftEntry[] {
  if (index < 0 || index >= entries.length) return entries
  return normalizeLevels(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)))
}

export function indentEntry(entries: TocDraftEntry[], index: number): TocDraftEntry[] {
  return shiftSubtreeLevel(entries, index, 1)
}

export function outdentEntry(entries: TocDraftEntry[], index: number): TocDraftEntry[] {
  return shiftSubtreeLevel(entries, index, -1)
}

/**
 * 上移/下移一位(与同级换位), 整棵子树一起走。
 *
 * 子条目不能越过父条目: 越过去它就不再是那条的子节点了, 那等于"改层级",
 * 有专门的升降级按钮, 不该由上下移顺手做掉, 所以那种情况直接不动。
 */
export function moveEntry(entries: TocDraftEntry[], index: number, delta: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length || delta === 0) return entries
  const { end } = subtreeRange(entries, index)

  if (delta < 0) {
    const prev = previousSiblingStart(entries, index)
    return prev < 0 ? entries : moveSubtreeTo(entries, index, prev)
  }

  // 下一条同级子树之前: 它的起点就是本条子树结束的位置
  if (end >= entries.length || entries[end].level !== entries[index].level) return entries
  return moveSubtreeTo(entries, index, subtreeRange(entries, end).end)
}

/**
 * 删掉一条。子条目**上提**而不是跟着删: 目录里的父子只是缩进, 删掉「第二章」不等于
 * 要把 2.1~2.5 这些节一起删掉 —— 它们的内容还在正文里, 跟着删会让它们从目录里消失,
 * 而且没有撤销。
 *
 * 上提必须显式按"被删那条的子树"做, 不能丢给 normalizeLevels 去夹:
 * [A1, B2, C2] 删掉 A 之后, 夹的办法会把 B 夹成 1 级, 而 C 因为"最多比前一条深一级"
 * 留在 2 级 —— 于是 C 变成了 B 的子节点, 平白多出一层, 而且看不出是错的。
 */
export function removeEntry(entries: TocDraftEntry[], index: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length) return entries
  const removedLevel = entries[index].level
  const out: TocDraftEntry[] = []
  entries.forEach((e, i) => {
    if (i === index) return
    // 它之后的兄弟层级不高于它, 所以"更深"就等价于"在它的子树里"
    const inSubtree = i > index && e.level > removedLevel
    out.push(inSubtree ? { ...e, level: e.level - 1 } : e)
  })
  return normalizeLevels(out)
}

/** 在 index 之后插一条; afterIndex 传 -1 表示插到最前面 */
function insertAt(
  entries: TocDraftEntry[],
  afterIndex: number,
  level: number,
  pageNo: number,
): TocDraftEntry[] {
  const entry: TocDraftEntry = {
    id: nextTempId(entries),
    level,
    title: '',
    blockIndex: null,
    pageNo,
  }
  const next = entries.slice()
  next.splice(afterIndex + 1, 0, entry)
  return normalizeLevels(next)
}

/** 添加同级 —— 页码沿用同级那条, 因为新条目通常就是要建在它旁边 */
export function addSibling(entries: TocDraftEntry[], index: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length) return insertAt(entries, entries.length - 1, 1, lastPage(entries))
  return insertAt(entries, index, entries[index].level, entries[index].pageNo)
}

/** 添加子级 —— 紧跟在父条目后面, 于是它就是父条目的第一个孩子 */
export function addChild(entries: TocDraftEntry[], index: number): TocDraftEntry[] {
  if (index < 0 || index >= entries.length) return insertAt(entries, entries.length - 1, 1, lastPage(entries))
  return insertAt(entries, index, entries[index].level + 1, entries[index].pageNo)
}

/** 添加一条顶级条目(MinerU 整个漏掉整篇/整章时用) */
export function addRoot(entries: TocDraftEntry[]): TocDraftEntry[] {
  return insertAt(entries, entries.length - 1, 1, lastPage(entries))
}

function lastPage(entries: TocDraftEntry[]): number {
  return entries.length > 0 ? entries[entries.length - 1].pageNo : 1
}

/**
 * 映射到已经不存在的区块的条目 id。
 *
 * 重新解析会把区块整批删掉重建, block_index 整体重排, 旧映射就指空了 ——
 * 不检查的话阅读页点它没反应、出题范围切到别的页, 而两边都不报错。
 */
export function staleEntryIds(
  entries: TocDraftEntry[],
  blockIndexes: ReadonlySet<number>,
): Set<number> {
  const out = new Set<number>()
  for (const e of entries) {
    if (e.blockIndex === null) continue
    if (!blockIndexes.has(e.blockIndex)) out.add(e.id)
  }
  return out
}

/** 目录标题不能为空, 否则阅读页那一栏会出现一条点不动的空行 */
export function canSaveToc(entries: TocDraftEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => e.title.trim().length > 0)
}

/** 供编辑器做映射校验用: 这篇文献现在到底有哪些区块 */
export function blockIndexSet(blocks: ResourceBlock[]): Set<number> {
  return new Set(blocks.map((b) => b.blockIndex))
}
