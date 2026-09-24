#!/usr/bin/env node
/**
 * 知识点范围(文献的一段正文归属哪个知识点)的纯逻辑验证。
 *
 * 这里的错都是"静默错"的类型: 区间少算一块会让"《医学导论》第六章"少了最后一页, 多算一块会
 * 吃掉第七章的标题; 纯分组项没有落点时退化成"整篇第一块"更是离谱 —— 都不报错, 只能靠断言挡。
 * Node 22+ 直接跑 .ts(原生类型擦除), 不需要测试框架。
 *
 * Usage: node scripts/resource-kp-scopes-smoke.mjs
 */
import {
  findDuplicate, groupScopesByDocument, kpCode, overlapping, scopeAnchor, scopePages,
  scopeRangeFromBlocks, scopeRangeFromToc, scopeWhere, scopesByBlock,
} from '../src/lib/resource-kp-scopes.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`)
}

/** 一块正文(只需要这几个字段, bbox/类型与范围计算无关) */
const block = (blockIndex, pageNo, headingLevel = 0) => ({
  blockIndex, pageNo, headingLevel, bbox: null, blockType: 'text', text: `段 ${blockIndex}`,
})

/**
 * 造一篇"两章 + 一节"的文献:
 *   p1      第一章(块 0, 标题)
 *   p2-3    第一章正文(块 1..3)
 *   p4      第二章 标题(块 4) + 纯分组项(无落点, 落在 p4)
 *   p5-6    第二章正文(块 5..6)
 *   p7      2.1 节(块 7)
 *   p8-9    2.1 正文(块 8..9)
 *   p10     第三章(块 10)
 *   p11     第三章正文(块 11)
 */
const blocks = [
  block(0, 1, 1), block(1, 2), block(2, 2), block(3, 3),
  block(4, 4, 1), block(5, 5), block(6, 6),
  block(7, 7, 2), block(8, 8), block(9, 9),
  block(10, 10, 1), block(11, 11),
]
const toc = [
  { key: 0, level: 1, title: '第一章', pageNo: 1, blockIndex: 0 },
  { key: 4, level: 1, title: '第二章', pageNo: 4, blockIndex: 4 },
  { key: 7, level: 2, title: '2.1 节', pageNo: 7, blockIndex: 7 },
  { key: 10, level: 1, title: '第三章', pageNo: 10, blockIndex: 10 },
]

// ── 一键圈一节: 到下一条目录项为止 ──
check('圈 2.1 节(到下一条为止)', scopeRangeFromToc(toc, 2, blocks, 'section'),
  { blockFrom: 7, blockTo: 9, pageFrom: 7, pageTo: 9, tocTitle: '2.1 节', tocLevel: 2 })
check('圈第二章(下一节是它的子节, 所以只切到子节前)', scopeRangeFromToc(toc, 1, blocks, 'section'),
  { blockFrom: 4, blockTo: 6, pageFrom: 4, pageTo: 6, tocTitle: '第二章', tocLevel: 1 })
check('圈最后一节到全篇末尾', scopeRangeFromToc(toc, 3, blocks, 'section'),
  { blockFrom: 10, blockTo: 11, pageFrom: 10, pageTo: 11, tocTitle: '第三章', tocLevel: 1 })

// ── 圈整棵子树(整章含子节): 到下一个同级或更高级目录项为止 ──
check('圈整章(含 2.1 子节)', scopeRangeFromToc(toc, 1, blocks, 'subtree'),
  { blockFrom: 4, blockTo: 9, pageFrom: 4, pageTo: 9, tocTitle: '第二章', tocLevel: 1 })
check('子节没有子节时两种圈法一致',
  scopeRangeFromToc(toc, 2, blocks, 'subtree'), scopeRangeFromToc(toc, 2, blocks, 'section'))
check('整章圈到全篇末尾', scopeRangeFromToc(toc, 3, blocks, 'subtree').blockTo, 11)

// ── 纯分组项(没有落点): 退化成"这一页的第一块", 不能变成整篇第一块 ──
const grouped = [
  { key: 0, level: 1, title: '第一篇 总论', pageNo: 4, blockIndex: null },
  { key: 4, level: 2, title: '第一章', pageNo: 4, blockIndex: 4 },
  { key: 10, level: 1, title: '第三章', pageNo: 10, blockIndex: 10 },
]
check('纯分组项按下拉页的第一块起算', scopeRangeFromToc(grouped, 0, blocks, 'section'),
  { blockFrom: 4, blockTo: 4, pageFrom: 4, pageTo: 4, tocTitle: '第一篇 总论', tocLevel: 1 })

// 重新解析后落点指空了: 不能算成整篇, 退回按页码找
const staleToc = [{ key: 999, level: 1, title: '第二章', pageNo: 5, blockIndex: 999 }]
check('落点失效时按页码兜底', scopeRangeFromToc(staleToc, 0, blocks, 'section').blockFrom, 5)

check('目录下标越界返回 null', scopeRangeFromToc(toc, 9, blocks, 'section'), null)
check('没有正文时返回 null', scopeRangeFromToc(toc, 0, [], 'section'), null)

// ── 正文拖选: 前后拖反了、拖出边界都要能用 ──
check('拖选区间', scopeRangeFromBlocks(blocks, 5, 8),
  { blockFrom: 5, blockTo: 8, pageFrom: 5, pageTo: 8, tocTitle: '', tocLevel: 1 })
check('从下往上拖也能用', scopeRangeFromBlocks(blocks, 8, 5),
  { blockFrom: 5, blockTo: 8, pageFrom: 5, pageTo: 8, tocTitle: '', tocLevel: 1 })
check('单块拖选', scopeRangeFromBlocks(blocks, 3, 3),
  { blockFrom: 3, blockTo: 3, pageFrom: 3, pageTo: 3, tocTitle: '', tocLevel: 1 })
check('拖到不存在的块返回 null', scopeRangeFromBlocks(blocks, 3, 99), null)

// ── 记录 ──
const scope = (over = {}) => ({
  id: 's1', documentId: 'doc-1', documentTitle: '医学导论', subject: '医学史',
  kp: 'A14-医学教育教学概论与现代医学教育思想',
  blockFrom: 4, blockTo: 9, pageFrom: 4, pageTo: 9,
  tocTitle: '第六章 医学教育教学概论与现代医学教育思想', tocLevel: 1, note: '', createdAt: '', ...over,
})

check('页码区间文案', scopePages(scope()), '第 4-9 页')
check('单页文案', scopePages(scope({ pageFrom: 7, pageTo: 7 })), '第 7 页')
check('清单里带上是哪条目录项', scopeWhere(scope()).startsWith('第 4-9 页 · 第六章'), true)
check('拖选出来的范围没有目录项就只说页', scopeWhere(scope({ tocTitle: '' })), '第 4-9 页')
check('跳转地址落到区间首块', scopeAnchor(scope()), '/resource-library/doc-1?block=4')
check('知识点只留编码', kpCode('A14-医学教育教学概论与现代医学教育思想'), 'A14')
check('没有编码前缀时截断显示', kpCode('医学教育教学概论'), '医学教育教学概论')

// 段落下标 → 覆盖它的范围: 区间两端都算在内, 区间外不许出现
const byBlock = scopesByBlock([scope()], blocks)
check('区间内的每一块都标上', [4, 5, 6, 7, 8, 9].every((i) => byBlock.get(i)?.length === 1), true)
check('区间外不标', [3, 10, 11].some((i) => byBlock.has(i)), false)
check('同一段挂两个知识点时两条都在',
  scopesByBlock([scope(), scope({ id: 's2', kp: 'A15-别的' })], blocks).get(6).map((s) => s.kp),
  ['A14-医学教育教学概论与现代医学教育思想', 'A15-别的'])

// ── 从知识点反查: 按文献分组、按位置排序 ──
const grouped2 = groupScopesByDocument([
  scope({ id: 'b', blockFrom: 40, pageFrom: 20, documentId: 'doc-1' }),
  scope({ id: 'a', blockFrom: 4, pageFrom: 4, documentId: 'doc-1' }),
  scope({ id: 'c', blockFrom: 100, pageFrom: 30, documentId: 'doc-2', documentTitle: '现代医学导论-基础医学' }),
])
check('按文献分组', grouped2.map((g) => [g.documentId, g.items.length]), [['doc-1', 2], ['doc-2', 1]])
check('组内按正文位置排序', grouped2[0].items.map((s) => s.id), ['a', 'b'])
check('带上文献标题', grouped2[1].documentTitle, '现代医学导论-基础医学')

// ── 重复 / 重叠 ──
check('完全相同的范围算重复', findDuplicate([scope()], { subject: '医学史', kp: scope().kp, blockFrom: 4, blockTo: 9 })?.id, 's1')
check('端点不同的不算重复', findDuplicate([scope()], { subject: '医学史', kp: scope().kp, blockFrom: 4, blockTo: 8 }), null)
check('别的知识点不算重复', findDuplicate([scope()], { subject: '医学史', kp: 'A15', blockFrom: 4, blockTo: 9 }), null)
check('重叠要提示(同一章讲两个知识点是常事, 但得说一声)',
  overlapping([scope()], { blockFrom: 9, blockTo: 20 }), [scope()])
check('不挨着就不提示', overlapping([scope()], { blockFrom: 10, blockTo: 20 }), [])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
