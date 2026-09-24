#!/usr/bin/env node
/**
 * 人工目录编辑运算的行为验证。
 *
 * 这几条都是"静默错"的类型: 层级夹错会让阅读页的目录树和编辑器里看到的缩进不一致,
 * 删父节点时子节点没上提会让整节从目录里消失, 映射失效不检查会让出题范围切到别的页 ——
 * 三种都不报错, 只能靠断言挡。Node 22+ 直接跑 .ts(原生类型擦除), 不需要测试框架。
 *
 * Usage: node scripts/resource-toc-smoke.mjs
 */
import {
  addChild, addRoot, addSibling, canSaveToc, draftFromToc, hasChildren, indentEntry, moveBlockTo,
  moveEntry, moveSubtreeTo, nextTempId, normalizeLevels, outdentEntry, removeEntry, selectionBlock,
  shiftRangeLevel, shiftSubtreeLevel, staleEntryIds, subtreeRange, tocFromDraft, updateEntry, TOC_LEVEL_MAX,
} from '../src/lib/resource-toc.ts'
import { sectionsFromToc } from '../src/lib/resource-blocks.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`)
}

/** 只关心 id/level/title/pageNo/blockIndex 这几列, 比较时压成同样形状 */
const shape = (entries) => entries.map((e) => [e.id, e.level, e.title, e.pageNo, e.blockIndex])

const lv = (entries) => entries.map((e) => e.level)
const ids = (entries) => entries.map((e) => e.id)

const draft = (rows) => rows.map(([id, level, title, pageNo = 1, blockIndex = null]) => ({
  id, level, title, pageNo, blockIndex,
}))

// ── TocEntry ↔ TocDraftEntry 往返 ──
const tocEntries = [
  { key: 0, level: 1, title: '第一章', pageNo: 3, blockIndex: 0 },
  { key: 7, level: 2, title: '1.1 节', pageNo: 5, blockIndex: 7 },
  { key: 9, level: 1, title: '纯分组', pageNo: 8, blockIndex: null },
]
check('TocEntry → draft', shape(draftFromToc(tocEntries)), [[0, 1, '第一章', 3, 0], [7, 2, '1.1 节', 5, 7], [9, 1, '纯分组', 8, null]])
check('draft → TocEntry 往返一致', tocFromDraft(draftFromToc(tocEntries)), tocEntries)
check('往返带上 key=id(纯分组项也没丢)', tocFromDraft(draftFromToc(tocEntries)).map((t) => t.key), [0, 7, 9])

// ── 层级规范化 ──
check('首条被夹到 1 级', lv(normalizeLevels(draft([[1, 3, 'a'], [2, 3, 'b']]))), [1, 2])
check('最多比前一条深一级', lv(normalizeLevels(draft([[1, 1, 'a'], [2, 4, 'b']]))), [1, 2])
check('合法层级原样不动', lv(normalizeLevels(draft([[1, 1, 'a'], [2, 2, 'b'], [3, 3, 'c']]))), [1, 2, 3])
check('封顶 6', lv(normalizeLevels(draft([[1, 1, 'a'], [2, 9, 'b']]))), [1, 2])
check('TOC_LEVEL_MAX 就是 6', TOC_LEVEL_MAX, 6)

// ── 缩进 / 取消缩进 ──
const three = draft([[1, 1, '甲'], [2, 1, '乙'], [3, 1, '丙']])
check('降一级', lv(indentEntry(three, 1)), [1, 2, 1])
check('升一级', lv(outdentEntry(three, 1)), [1, 1, 1])
check('第一条降一级会被夹回 1', lv(indentEntry(three, 0)), [1, 1, 1])
check('越界的下标原样返回', indentEntry(three, 9), three)

// 取消缩进不能把中间一条按到 1 级而让后面那条"凭空"成为它的子节点
const nested = draft([[1, 1, '甲'], [2, 2, '乙'], [3, 3, '丙']])
check('升一级之后整棵序列仍然合法', lv(outdentEntry(nested, 2)), [1, 2, 2])

// ── 增删 ──
check('空表加顶级条目', lv(addRoot([])), [1])
check('加顶级条目落在末尾', ids(addRoot(three)), [1, 2, 3, -1])
check('加顶级条目页码沿用上一条', addRoot(draft([[1, 1, '甲', 12]])).at(-1).pageNo, 12)
check('空表加顶级条目页码从 1 起', addRoot([])[0].pageNo, 1)
check('新条目 id 是负数(不会撞数据库行 id)', nextTempId(three), -1)
check('已有负数临时 id 时继续往回取', nextTempId(draft([[-1, 1, '甲'], [-2, 1, '乙']])), -3)

check('添加子级层级 +1', lv(addChild(three, 0)), [1, 2, 1, 1])
check('添加子级紧跟父条目', ids(addChild(three, 0)), [1, -1, 2, 3])
check('添加子级页码跟父条目', addChild(three, 0)[1].pageNo, 1)
check('添加同级层级不变', lv(addSibling(three, 1)), [1, 1, 1, 1])
check('添加同级紧跟本条', ids(addSibling(three, 1)), [1, 2, -1, 3])
check('新条目没有落点', addChild(three, 0)[1].blockIndex, null)

check('删掉一条', ids(removeEntry(three, 1)), [1, 3])
check('删除父条目时子条目上提', lv(removeEntry([...nested], 0)), [1, 2])
check('上提的是子树的层级, 不是首条被夹', shape(removeEntry([...nested], 0)).map((s) => s[1]), [1, 2])
check('删中间一条时它下面那层上提',
  lv(removeEntry(draft([[1, 1, '甲'], [2, 2, '乙'], [3, 3, '丙'], [4, 1, '丁']]), 1)), [1, 2, 1])
check('删除不影响后面的兄弟',
  ids(removeEntry(draft([[1, 1, '甲'], [2, 2, '乙'], [3, 1, '丙']]), 1)), [1, 3])
check('越界的下标删除原样返回', removeEntry(three, -1), three)

// ── 移动: 整棵子树一起搬 ──
check('上移', ids(moveEntry(three, 1, -1)), [2, 1, 3])
check('下移', ids(moveEntry(three, 1, 1)), [1, 3, 2])
check('首条上移不动', moveEntry(three, 0, -1), three)
check('末条下移不动', moveEntry(three, 2, 1), three)
check('delta 0 不动', moveEntry(three, 1, 0), three)

// 第二章 带 2.1/2.2 下移一位: 三段整体搬到第三章后面, 而不是只挪第二章那一行
const withKids = draft([[1, 1, '第一章'], [2, 1, '第二章'], [3, 2, '2.1'], [4, 2, '2.2'], [5, 1, '第三章']])
check('下移带走整棵子树', ids(moveEntry(withKids, 1, 1)), [1, 5, 2, 3, 4])
check('下移不改任何层级(层级多重集不变)',
  [...lv(moveEntry(withKids, 1, 1))].sort(), [...lv(withKids)].sort())
check('下移之后 2.1/2.2 仍挂在第二章下', lv(moveEntry(withKids, 1, 1)), [1, 1, 1, 2, 2])
check('上移带走整棵子树', ids(moveEntry(withKids, 1, -1)), [2, 3, 4, 1, 5])
check('移动子树后序列仍然合法', lv(moveEntry(withKids, 1, -1)), [1, 2, 2, 1, 1])
check('末尾的子树不能再下移', ids(moveEntry(withKids, 4, 1)), [1, 2, 3, 4, 5])
check('子条目不能越过父条目上移', moveEntry(nested, 1, -1), nested)
check('子条目不能越过父条目下移', moveEntry(nested, 2, 1), nested)
check('同级子条目之间可以换位', ids(moveEntry(withKids, 3, -1)), [1, 2, 4, 3, 5])

// ── 改内容 / 改映射 ──
check('改标题', updateEntry(three, 1, { title: '乙改' })[1].title, '乙改')
check('改页码', updateEntry(three, 1, { pageNo: 42 })[1].pageNo, 42)
const mapped = updateEntry(three, 1, { blockIndex: 88, pageNo: 9 })
check('建立映射同时带出页码', [mapped[1].blockIndex, mapped[1].pageNo], [88, 9])
check('改映射不动别人', ids(mapped), [1, 2, 3])
check('改标题不会顺手夹层级', lv(updateEntry(nested, 2, { title: '丙改' })), [1, 2, 3])

// ── 映射失效 ──
const haveIndexes = new Set([0, 7, 20])
const withMappings = draft([[1, 1, '甲', 3, 0], [2, 2, '乙', 5, 7], [3, 1, '丙', 8, 99], [4, 1, '丁', 9, null]])
check('失效的只有指空那一条', [...staleEntryIds(withMappings, haveIndexes)], [3])
check('没有落点的分组项不算失效', staleEntryIds(withMappings, haveIndexes).has(4), false)
check('全部指空时全部失效', [...staleEntryIds(withMappings, new Set())], [1, 2, 3])
check('区块都在时没有失效', staleEntryIds(withMappings, new Set([0, 7, 99])).size, 0)

// ── 可保存性 ──
check('有标题就能存', canSaveToc(three), true)
check('空目录不能存', canSaveToc([]), false)
check('标题为空不能存', canSaveToc(draft([[1, 1, '甲'], [2, 1, '']])), false)
check('只有空白的标题也不能存', canSaveToc(draft([[1, 1, '   ']])), false)

// ── 目录 → 出题用的章节范围 ──
// /create 的「限定章节出题」拿的就是这个: 区间按页码切, 标识必须用 key 而不是 blockIndex ——
// 人工目录允许两条指同一段, 用 blockIndex 当标识会让它们在下拉框里互相顶掉。
const secToc = [
  { key: 101, level: 1, title: '第一章', pageNo: 3, blockIndex: 0 },
  { key: 102, level: 2, title: '1.1', pageNo: 5, blockIndex: 7 },
  { key: 103, level: 1, title: '纯分组项', pageNo: 8, blockIndex: null },
  { key: 104, level: 1, title: '第二章', pageNo: 10, blockIndex: 40 },
]
const sections = sectionsFromToc(secToc, 12)
check('区间标识用 key', sections.map((s) => s.key), [101, 102, 103, 104])
check('区间到下一节前一页', sections.map((s) => [s.pageFrom, s.pageTo]), [[3, 4], [5, 7], [8, 9], [10, 12]])
check('最后一节到全书末页', sections[3].pageTo, 12)
check('纯分组项的落点原样是 null', sections[2].blockIndex, null)
check('有落点的照旧带出', sections.map((s) => s.blockIndex), [0, 7, null, 40])
// 三个标题挤在同一页时会切出零宽区间, 夹成单页而不是丢掉
const samePage = sectionsFromToc([
  { key: 1, level: 1, title: '甲', pageNo: 4, blockIndex: 0 },
  { key: 2, level: 1, title: '乙', pageNo: 4, blockIndex: 1 },
], 9)
check('同页连续标题夹成单页而不是零宽', samePage.map((s) => [s.pageFrom, s.pageTo]), [[4, 4], [4, 9]])
check('零宽区间不会丢掉', samePage.length, 2)

// ── 子树区间 / 整棵搬移 / 整体升降级 (拖动落点用的就是这三个) ──
const tree = draft([[1, 1, '第一章'], [2, 1, '第二章'], [3, 2, '2.1'], [4, 3, '2.1.1'], [5, 2, '2.2'], [6, 1, '第三章']])

check('子树区间: 带孙辈的父条目', subtreeRange(tree, 1), { start: 1, end: 5 })
check('子树区间: 叶子就是自己一格', subtreeRange(tree, 3), { start: 3, end: 4 })
check('子树区间: 末条到结尾', subtreeRange(tree, 5), { start: 5, end: 6 })
check('子树区间: 越界返回空区间', subtreeRange(tree, 9), { start: 9, end: 9 })
check('hasChildren: 有后代为真', hasChildren(tree, 1), true)
check('hasChildren: 叶子为假', hasChildren(tree, 3), false)

// 把第二章(带 2.1/2.1.1/2.2)拖到第三章后面
check('搬整棵子树到末尾', ids(moveSubtreeTo(tree, 1, 6)), [1, 6, 2, 3, 4, 5])
check('搬到末尾后层级不变', lv(moveSubtreeTo(tree, 1, 6)), [1, 1, 1, 2, 3, 2])
// 第一章拖到第二章前面 = 没动; 落在自己子树里也是没动
check('搬到自己位置上不动', moveSubtreeTo(tree, 1, 1), tree)
check('搬进自己子树里不动', moveSubtreeTo(tree, 1, 3), tree)
check('搬到自己紧后面不动', moveSubtreeTo(tree, 1, 5), tree)
// 把 2.2 拖到第二章最前面: 它是 2.1 的兄弟, 排在 2.1 之前
check('子条目在兄弟之间换位', ids(moveSubtreeTo(tree, 4, 2)), [1, 2, 5, 3, 4, 6])
check('换位后层级有序', lv(moveSubtreeTo(tree, 4, 2)), [1, 1, 2, 2, 3, 1])
check('搬移目标越界会夹到边界', ids(moveSubtreeTo(tree, 5, 99)), [1, 2, 3, 4, 5, 6])
check('搬到最前面', ids(moveSubtreeTo(tree, 5, 0)), [6, 1, 2, 3, 4, 5])

// 升降级: 整棵子树一起平移, 相对深度不变
// 合法的降级: 乙(1级)下面挂着丙(2级)/丁(3级), 整棵降一级后相对深度必须保持 1/2/3
const deep = draft([[1, 1, '甲'], [2, 1, '乙'], [3, 2, '丙'], [4, 3, '丁']])
check('整棵子树降级', lv(shiftSubtreeLevel(deep, 1, 1)), [1, 2, 3, 4])
check('降级后相对深度不变',
  (() => { const a = lv(deep).slice(1); const b = lv(shiftSubtreeLevel(deep, 1, 1)).slice(1); return b.map((v, i) => v - a[i]) })(),
  [1, 1, 1])
// 层级序列不允许跳级: 乙是 1 级, 它的孩子最多 2 级, 所以"降一级"在这里被夹回 2 级而不是 3 级
check('降级幅度受"最多深一级"限制', lv(shiftSubtreeLevel(tree, 2, 1)), [1, 1, 2, 3, 2, 1])
// 升级是合法的, 整棵一起升
check('整棵子树升级', lv(shiftSubtreeLevel(tree, 2, -1)), [1, 1, 1, 2, 2, 1])
check('升级后相对深度不变',
  (() => { const a = lv(tree).slice(2, 4); const b = lv(shiftSubtreeLevel(tree, 2, -1)).slice(2, 4); return b.map((v, i) => v - a[i]) })(),
  [-1, -1])
check('叶子升降级', lv(shiftSubtreeLevel(tree, 5, 1)), [1, 1, 2, 3, 2, 2])
check('delta 0 不动', shiftSubtreeLevel(tree, 1, 0), tree)
check('降级封顶 6', lv(shiftSubtreeLevel(draft([[1, 1, 'a'], [2, 2, 'b'], [3, 3, 'c'], [4, 4, 'd'], [5, 5, 'e'], [6, 6, 'f']]), 5, 9)), [1, 2, 3, 4, 5, 6])
check('升到顶之后的层级仍是 1',
  lv(shiftSubtreeLevel(draft([[1, 1, 'a'], [2, 2, 'b'], [3, 3, 'c']]), 2, -9)), [1, 2, 1])

// ── 多选联合拖动: 一整块搬运 + 整块调层级 ──
// 选中"第二章 + 2.1/2.1.1/2.2"(一个根 + 它的后代)时, 块就是这一整棵子树
check('选中一个根时块=整棵子树', selectionBlock(tree, new Set([2]), 1), { start: 1, end: 5 })
// 选 2.1 和 2.2 两个同级兄弟(2.1 带一个孙辈) → 块要一直连到 2.2 的末尾
check('同级两兄弟连成一块', selectionBlock(tree, new Set([3, 5]), 2), { start: 2, end: 5 })
check('从块内任意一行起拖都认同一块', selectionBlock(tree, new Set([3, 5]), 4), { start: 2, end: 5 })
// 选中的后代不算一个根: 选中第二章和它的孙子, 块还是整棵第二章
check('选中的后代不额外扩块', selectionBlock(tree, new Set([2, 4]), 1), { start: 1, end: 5 })
// 跨度里夹着没选中的行 → 不成块(一起搬会把人家也带走), 由调用方退回单行拖动
const gap = draft([[1, 1, '第一章'], [2, 1, '第二章'], [3, 2, '2.1'], [4, 1, '第三章']])
check('跨度里夹着未选中行时不成块', selectionBlock(gap, new Set([1, 4]), 0), null)
check('相邻两条选中时成块', selectionBlock(gap, new Set([1, 2]), 0), { start: 0, end: 3 })
check('没选中的行起拖不成块', selectionBlock(tree, new Set([2]), 5), null)
check('空选区不成块', selectionBlock(tree, new Set(), 1), null)

check('整块搬到末尾', ids(moveBlockTo(tree, 1, 5, 6)), [1, 6, 2, 3, 4, 5])
check('整块搬到最后面前面', ids(moveBlockTo(tree, 1, 5, 0)), [2, 3, 4, 5, 1, 6])
check('搬到自己范围内不动', moveBlockTo(tree, 1, 5, 3), tree)
check('搬到自己紧后面不动', moveBlockTo(tree, 1, 5, 5), tree)
check('整块搬运不改层级', lv(moveBlockTo(tree, 1, 5, 6)), [1, 1, 1, 2, 3, 2])
check('块下标越界会夹到边界', ids(moveBlockTo(tree, -5, 99, 99)), [1, 2, 3, 4, 5, 6])
check('空块不动', moveBlockTo(tree, 2, 2, 5), tree)
// moveSubtreeTo 就是"块=自己的子树"那一种, 两者必须永远一致
check('moveSubtreeTo 与 moveBlockTo 同源',
  ids(moveSubtreeTo(tree, 1, 6)), ids(moveBlockTo(tree, ...Object.values(subtreeRange(tree, 1)), 6)))

// 整块调层级: 与整棵子树升降级不同, 它不看父子关系, 块里每一行平移同样的量
const flat = draft([[1, 1, '甲'], [2, 1, '乙'], [3, 2, '乙-1'], [4, 1, '丙']])
check('整块降级(含未选中的后代一起走)', lv(shiftRangeLevel(flat, 1, 3, 1)), [1, 2, 3, 1])
check('整块升级', lv(shiftRangeLevel(flat, 1, 3, -1)), [1, 1, 1, 1])
// 相对深度原样保留: 用一段本来就够深的行来量, 否则首行"已经在 1 级"会被夹住, 量出来是 0
const nestedRange = draft([[1, 1, '甲'], [2, 2, '乙'], [3, 3, '丙'], [4, 1, '丁']])
check('整块升级后相对深度不变',
  (() => { const a = lv(nestedRange).slice(1, 3); const b = lv(shiftRangeLevel(nestedRange, 1, 3, -1)).slice(1, 3); return b.map((v, i) => v - a[i]) })(),
  [-1, -1])
check('整块降级后相对深度不变',
  (() => {
    const base = draft([[1, 1, '甲'], [2, 1, '乙'], [3, 2, '丙'], [4, 1, '丁']])
    const a = lv(base).slice(1, 3)
    const b = lv(shiftRangeLevel(base, 1, 3, 1)).slice(1, 3)
    return b.map((v, i) => v - a[i])
  })(),
  [1, 1])
check('块外的行一动不动', lv(shiftRangeLevel(flat, 1, 3, 1)).at(-1), 1)
check('delta 0 不动', shiftRangeLevel(flat, 1, 3, 0), flat)
check('越界区间夹到边界', lv(shiftRangeLevel(flat, -3, 99, -1)), [1, 1, 1, 1])
check('空区间不动', shiftRangeLevel(flat, 2, 2, 1), flat)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
