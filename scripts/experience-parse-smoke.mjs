#!/usr/bin/env node
/**
 * 经验解析「归属判定」的运算验证。
 *
 * 这一层全是"静默错"的类型: 归属算偏了不会报错, 只会把真题标到别的章上, 而且标错了
 * 跟标对了在界面上长得一模一样。所以每条都要断言到底:
 *   - 命中落在哪一节 —— 页码区间、同页多节(最深优先)、标题之前的块(未归属)
 *   - 只统计主材料 —— 佐证材料的命中不能混进投票
 *   - 粒度切换 —— 第 1 级取章, 第 2 级取节, 链上没有该级时退到最上面那节
 *   - 只写该写的 —— categories 追加在末尾(触发器把 [0] 同步成 category), key_points 走受控词表
 *
 * Node 22+ 直接跑 .ts(原生类型擦除), 不需要测试框架。
 *
 * Usage: node scripts/experience-parse-smoke.mjs
 */
import {
  EMPTY_ATTRIBUTION, attributeHits, confidenceTier, defaultLevel, evidenceSnippet, levelsOf,
  matchKeyPoints, mergeKeyPoints, needsTriage, retrievalQuery, sectionNodes, triageFromRow,
  withChapterTag,
} from '../src/lib/experience-parse.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`)
}

/** 目录条目: 只要 key/level/title/pageNo, sectionsFromToc 会补齐页码区间 */
const toc = (key, level, title, pageNo) => ({ key, level, title, pageNo, blockIndex: key })

const TOC = [
  toc(1, 1, '第一章 基础理论', 1),
  toc(2, 2, '1.1 集合与映射', 3),
  toc(3, 2, '1.2 极限', 12),
  toc(4, 1, '第二章 微积分', 30),
  toc(5, 3, '2.1.1 导数', 33),
  toc(6, 2, '2.2 积分', 50),
]

// ── 目录 ──

const nodes = sectionNodes(TOC, 80)
check('目录节点数', nodes.length, 6)
check('祖先链', nodes[1].chain.map((c) => c.title), ['第一章 基础理论', '1.1 集合与映射'])
check('深层节点带完整链', nodes[4].chain.map((c) => c.title), ['第二章 微积分', '2.1.1 导数'])
check('页码区间到下一条之前', [nodes[1].pageFrom, nodes[1].pageTo], [3, 11])
check('最后一节到全书末尾', [nodes[5].pageFrom, nodes[5].pageTo], [50, 80])
check('层级清单', levelsOf(nodes), [1, 2, 3])
check('默认粒度取第 2 级', defaultLevel(nodes), 2)
check('只有一级标题时退化成第 1 级', defaultLevel([toc(1, 1, '上篇', 1)]), 1)
check('没有标题时也不报错', defaultLevel([]), 1)

/** 一条命中: 归属只看 sourceId/pageNo/score, content 只用于展示 */
const hit = (pageNo, score, sourceId = 'main') => ({ sourceId, pageNo, score, content: `第${pageNo}页的正文` })

// ── 归属 ──

const vote = (hits, level = 2, mainSourceId = 'main') => attributeHits(hits, nodes, level, mainSourceId)

const a1 = vote([hit(5, 0.05), hit(6, 0.04), hit(40, 0.01)])
check('得票最多的一节当选', a1.best.title, '1.1 集合与映射')
check('当选那一节的命中数', a1.best.hits, 2)
check('完整路径', a1.best.path, ['第一章 基础理论', '1.1 集合与映射'])
check('置信度 = 当选得分 / 全部得分', Math.round(a1.confidence * 100), 90)
check('候选按得分降序', a1.candidates.map((c) => c.title), ['1.1 集合与映射', '第二章 微积分'])
check('分档: 多条命中且集中 -> 高', confidenceTier(a1), 'high')

const a2 = vote([hit(5, 0.05), hit(40, 0.04)])
check('命中数相同时按得分定归属', a2.best.title, '1.1 集合与映射')
check('两边都只有一条命中 -> 低', confidenceTier(a2), 'low')

const a3 = vote([hit(5, 0.05), hit(5, 0.04)])
check('同一节连着命中 -> 高', confidenceTier(a3), 'high')

const a4 = vote([hit(5, 0.05)])
check('只有一条命中一律算低', confidenceTier(a4), 'low')

const a5 = vote([hit(5, 0.04), hit(6, 0.03), hit(40, 0.05), hit(50, 0.04)])
check('票分散但当选那节仍有两条命中 -> 中', confidenceTier(a5), 'medium')

const a6 = vote([hit(0, 0.05)])
check('第一个标题之前的块记成未归属', a6.best, null)
check('未归属计数', a6.unattributed, 1)
check('没有页码的命中同样算未归属', vote([hit(null, 0.05)]).unattributed, 1)
check('没有命中时连未归属都不虚报', vote([]).best, null)
check('空归属的默认置信度', EMPTY_ATTRIBUTION.confidence, 0)

const a7 = vote([hit(5, 0.05), hit(5, 0.04), { ...hit(21, 0.9, 'aside'), sourceId: 'aside' }])
check('佐证材料的命中不参与投票', a7.best.title, '1.1 集合与映射')
check('佐证材料的得分也不算进分母', Math.round(a7.confidence * 100), 100)

const a8 = vote([hit(35, 0.05), hit(36, 0.04), hit(33, 0.03)], 3)
check('第 3 级粒度下命中落在 2.1.1', a8.best.title, '2.1.1 导数')

const a9 = vote([hit(35, 0.05), hit(36, 0.04)], 1)
check('第 1 级粒度下归到章', [a9.best.title, a9.best.level], ['第二章 微积分', 1])

const a10 = vote([hit(51, 0.05), hit(52, 0.04)], 3)
check('链上没有第 3 级时退到最上面那节', a10.best.title, '2.2 积分')

const a11 = attributeHits([hit(3, 0.05), hit(3, 0.04)], nodes, 2, 'other')
check('主材料不匹配时全部落空', [a11.best, a11.unattributed], [null, 0])

// ── 题目 ──

const row = {
  id: 'q1', subject: '高等数学', question_type: 'single_choice', question_text: '下列哪一项是死锁的必要条件？',
  options: ['互斥', '可抢占'], correct_answer: 0, analysis: '死锁的四个必要条件。', answer_explanation: null,
  key_points: null, categories: ['2023年真题', '2024年真题'], category: '2023年真题', source_page: '3-2', seq_number: 12,
}
const q = triageFromRow(row)
check('年份取最新那一条', q.year, 2024)
check('除年份以外的才是章节', q.chapterTags, [])
check('结果标签保留原样', q.categories, ['2023年真题', '2024年真题'])
check('知识点按受控分隔符拆开', triageFromRow({ ...row, key_points: 'A01-甲, B02-乙' }).keyPoints, ['A01-甲', 'B02-乙'])

const legacy = triageFromRow({ ...row, categories: [], category: '第三章 循环系统' })
check('老数据只有 category 时兜底成数组', legacy.categories, ['第三章 循环系统'])
check('老数据的章节标签', legacy.chapterTags, ['第三章 循环系统'])
check('老数据没有年份', legacy.year, null)
check('未知形状的 options 不报错', triageFromRow({ ...row, options: null }).options, [])

check('缺章节才列入', needsTriage(q, 'chapter'), true)
check('有年份但没知识点也算缺知识点', needsTriage(q, 'key_points'), true)
check('任一缺失就列入', needsTriage(q, 'either'), true)
check('章节有了就不算缺章节', needsTriage({ ...q, chapterTags: ['第三章'] }, 'chapter'), false)
check('章节有了仍算缺知识点', needsTriage({ ...q, chapterTags: ['第三章'] }, 'key_points'), true)
check('有两样都不缺', needsTriage({ ...q, chapterTags: ['第三章'], keyPoints: ['A01-甲'] }, 'either'), false)

// ── 检索问句与展示 ──

check('问句带题干与选项', retrievalQuery(q), '下列哪一项是死锁的必要条件？ A. 互斥 B. 可抢占 死锁的四个必要条件。')
check('问句截到上限', retrievalQuery(q, 10).length, 10)
check('没有长尾巴时也不截', retrievalQuery({ ...q, options: [], analysis: null }, 100), '下列哪一项是死锁的必要条件？')
check('证据片段剥掉材料前缀', evidenceSnippet('【材料 › 1.1 集合】映射是两个集合之间的对应关系'), '映射是两个集合之间的对应关系')
check('证据片段超长掐断', evidenceSnippet('x'.repeat(300), 10), 'xxxxxxxxxx…')

// ── 写入 ──

check('章节标签追加到末尾', withChapterTag(['2024年真题'], '第三章 循环系统'), ['2024年真题', '第三章 循环系统'])
check('重复的章节标签不重复追加', withChapterTag(['2024年真题', '第三章'], '第三章'), ['2024年真题', '第三章'])
check('空标签不动原数组', withChapterTag(['2024年真题'], '  '), ['2024年真题'])
check('标签两侧空白不影响去重', withChapterTag(['第三章'], ' 第三章 '), ['第三章'])

const vocab = ['A01-医学的演变、传播与交融', 'A02-死锁的必要条件', 'A03-这个知识点材料里没有']
check('词表按名字命中', matchKeyPoints(vocab, ['这道题考的是死锁的必要条件: 互斥、不可剥夺…']), ['A02-死锁的必要条件'])
check('命中章节标题也算', matchKeyPoints(vocab, ['第一章 医学的演变、传播与交融']), ['A01-医学的演变、传播与交融'])
check('对不上就不预选', matchKeyPoints(['A03-这个知识点材料里没有'], ['完全无关的一段话']), [])
check('编码不参与匹配(名字太短就跳过)', matchKeyPoints(['A1-甲'], ['甲']), [])

check('知识点按平台分隔符合并', mergeKeyPoints(['A01-甲'], ['B02-乙']), 'A01-甲, B02-乙')
check('同一个知识点不写两遍', mergeKeyPoints(['A01-甲'], ['A01-甲']), 'A01-甲')
check('没有知识点时返回 null', mergeKeyPoints([], []), null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
