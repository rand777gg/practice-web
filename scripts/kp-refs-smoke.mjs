#!/usr/bin/env node
/**
 * 知识点解读「依据原文」的映射运算验证。
 *
 * 这几条都是"静默错"的类型: 段落映射失效时不该把标记落到别的段上, 整节依据(页码区间)漏标会
 * 让读者以为这一段没有依据, 已删文献的依据还得留着快照可读 —— 四种都不报错, 只能靠断言挡。
 * Node 22+ 直接跑 .ts(原生类型擦除), 不需要测试框架。
 *
 * Usage: node scripts/kp-refs-smoke.mjs
 */
import {
  draftFromRef, draftFromSelection, fallbackTermForKp, refAnchor, refWhere, refsByBlock, searchTermForKp,
} from '../src/lib/kp-resource-refs.ts'
import {
  answerText, correctOptionIndexes, explanationOf, questionFromRow, questionStem, realYearOf, realYearsFrom, yearBadge,
} from '../src/lib/kp-question-refs.ts'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`)
}

/** 阅读页那边块就是这几个字段, text 只有"空块会不会被标"这种用例才关心 */
const blk = (blockIndex, pageNo, extra = {}) => ({
  blockIndex, pageNo, bbox: null, blockType: 'text', headingLevel: 0, text: `段${blockIndex}`, ...extra,
})

const ref = (over = {}) => ({
  id: 'r1', subject: '计算机', kp: '死锁', documentId: 'doc-1', blockIndex: null,
  pageFrom: 1, pageTo: 1, blocks: [], docTitle: '操作系统概念', label: '', snippet: '', note: '', sortOrder: 0,
  ...over,
})

/** Map → [[段号, [依据 id...]]], 只比较关心的形状 */
const marks = (map) => [...map.entries()].sort((a, b) => a[0] - b[0]).map(([i, list]) => [i, list.map((r) => r.id)])

// ── 段落标记: 精确到段 ──
const page1 = [blk(0, 1), blk(1, 1), blk(2, 2), blk(3, 2), blk(4, 3)]

check('精确定段的依据只标那几段',
  marks(refsByBlock([ref({ id: 'a', blocks: [1, 3], blockIndex: 1, pageFrom: 2, pageTo: 2 })], page1)),
  [[1, ['a']], [3, ['a']]])
check('没有依据就没有标记', [...refsByBlock([], page1).keys()], [])
check('空文献不会崩', [...refsByBlock([ref({ blocks: [1] })], []).keys()], [])

// 重新解析后 block_index 整体重排: 指空的段落必须一个标记都不落, 而不是顺手标到别的段上
check('映射失效(指空的段)一个都不标',
  [...refsByBlock([ref({ id: 'gone', blocks: [99], blockIndex: 99 })], page1).keys()], [])
check('同一依据里失效的段被剔掉、有效的留下',
  marks(refsByBlock([ref({ id: 'mix', blocks: [0, 99] })], page1)),
  [[0, ['mix']]])

// ── 段落标记: 整节(页码区间) ──
check('整节依据落到区间里的每一块',
  marks(refsByBlock([ref({ id: 'sec', pageFrom: 1, pageTo: 2 })], page1)),
  [[0, ['sec']], [1, ['sec']], [2, ['sec']], [3, ['sec']]])
check('整节依据不越过区间',
  [...refsByBlock([ref({ id: 'sec', pageFrom: 2, pageTo: 2 })], page1).keys()], [2, 3])
// 重新解析换过分卷、页码整体后移时会出现这种"区间已经落在文献之外"的依据: 一个标记都不该落
check('区间落在文献之外时一个都不标',
  [...refsByBlock([ref({ id: 'out', pageFrom: 900, pageTo: 901 })], page1).keys()], [])

// ── 多个知识点引用同一段 ──
const two = [ref({ id: 'a', blocks: [1] }), ref({ id: 'b', blocks: [1], kp: '并发' })]
check('同一段被两个知识点引用时都列出来', marks(refsByBlock(two, page1)), [[1, ['a', 'b']]])
check('同一依据不会因为段落重复而列两遍',
  marks(refsByBlock([ref({ id: 'a', blocks: [1, 1, 1] })], page1)), [[1, ['a']]])
check('精确段与整节同时命中同一段时两条都在',
  marks(refsByBlock([ref({ id: 'a', blocks: [1] }), ref({ id: 'sec', pageFrom: 1, pageTo: 1 })], page1)),
  [[0, ['sec']], [1, ['a', 'sec']]])

// ── 跳转地址 ──
check('精确到段跳段落锚点', refAnchor(ref({ blockIndex: 7, blocks: [7] })), '/resource-library/doc-1?block=7')
check('整节退化成页码', refAnchor(ref({ blockIndex: null, pageFrom: 5 })), '/resource-library/doc-1?page=5')
check('原文已删除时没有可跳的地方', refAnchor(ref({ documentId: null, blockIndex: 7 })), null)

// ── 展示用的位置说明 ──
check('单页', refWhere({ pageFrom: 3, pageTo: 3, blocks: [] }), '第 3 页')
check('跨页', refWhere({ pageFrom: 3, pageTo: 7, blocks: [] }), '第 3-7 页')
check('精确到段时带上段数', refWhere({ pageFrom: 3, pageTo: 3, blocks: [9, 10] }), '第 3 页 · 2 段')

// ── 选择结果 ↔ 草稿依据 ──
const selection = {
  documentId: 'doc-1', documentTitle: '操作系统概念', label: '第五章 死锁',
  from: 128, to: 135, blocks: [220, 221],
}
check('选择器结果 → 草稿依据', draftFromSelection(selection), {
  documentId: 'doc-1', docTitle: '操作系统概念', label: '第五章 死锁',
  pageFrom: 128, pageTo: 135, blocks: [220, 221], note: '',
})
check('落库后的依据 → 可编辑草稿',
  draftFromRef(ref({ documentId: 'doc-1', blockIndex: 220, pageFrom: 128, pageTo: 135, blocks: [220], label: '第五章', note: '定义' })),
  { documentId: 'doc-1', docTitle: '操作系统概念', label: '第五章', pageFrom: 128, pageTo: 135, blocks: [220], note: '定义' })
check('原文已删除的依据不可再编辑(只剩快照)',
  draftFromRef(ref({ documentId: null, blockIndex: 220 })), null)

// ── 检索关键词 ──
check('剥掉编码前缀', searchTermForKp('A01-医学的演变、传播与交融'), '医学的演变、传播与交融')
check('纯名字原样用', searchTermForKp('死锁'), '死锁')
check('带空格的编码也剥得掉', searchTermForKp('B12 - 进程调度'), '进程调度')
// 年份/页码这种"数字打头但没有编码分隔符"的名字不能被啃掉一截
check('数字打头但没有分隔符时不动它', searchTermForKp('2024年真题解析'), '2024年真题解析')
check('空字符串不炸', searchTermForKp(''), '')

check('太长时退到最长的一段', fallbackTermForKp('医学的演变、传播与交融'), '医学的演变')
check('只有一段时没有可退的备选', fallbackTermForKp('死锁'), null)
check('单字片段不算备选', fallbackTermForKp('甲、乙'), null)

// ── 相关真题: 年份/题型/答案的展示口径 ──
const q = (over = {}) => ({
  id: 'q1', questionType: 'single_choice', questionText: '死锁的四个必要条件不包括( )。',
  options: ['互斥', '请求与保持', '不可剥夺', '优先级反转'], correctAnswer: 3,
  subject: '操作系统', category: '2024年真题', categories: ['2024年真题'],
  analysis: '标准解析', answerExplanation: 'AI 题解', ...over,
})

check('分类就是年份真题时认出来', realYearOf(q()), '2024年真题')
// 一道题可能出现在多个年份(合并重复题时收集来的), 徽章取**最新**那一年
check('挂了好几年时取最新那一年',
  realYearOf(q({ category: '章节练习', categories: ['章节练习', '2020年真题', '2023年真题'] })), '2023年真题')
check('只有 category、没有 categories 也算',
  realYearOf(q({ category: '2021年真题', categories: [] })), '2021年真题')
check('不是真题就没有年份', realYearOf(q({ category: '章节练习', categories: ['章节练习'] })), null)
check('年份列表倒序', realYearsFrom(['章节练习', '2020年真题', '2024年真题', '2023年真题']),
  ['2024年真题', '2023年真题', '2020年真题'])
check('年份列表里没有真题就是空', realYearsFrom(['章节练习', '模拟卷']), [])

check('题干压掉换行', questionStem('第一行\n第二行   第三行'), '第一行 第二行 第三行')
check('题干超长截断', questionStem('甲'.repeat(20), 10), `${'甲'.repeat(10)}…`)
check('题干不超长原样', questionStem('短题干', 10), '短题干')

check('单选题的答案是一个下标', correctOptionIndexes(q()), [3])
check('多选题的答案是多个下标', correctOptionIndexes(q({ questionType: 'multi_select', correctAnswer: [0, 2] })), [0, 2])
check('判断题不按选项标答案', correctOptionIndexes(q({ questionType: 'true_false', correctAnswer: true })), null)
check('填空题不按选项标答案', correctOptionIndexes(q({ questionType: 'fill_blank', correctAnswer: ['A', 'B'] })), null)

check('单选题答案写成「字母. 选项」', answerText(q()), 'D. 优先级反转')
check('多选题答案写成字母串', answerText(q({ questionType: 'multi_select', correctAnswer: [0, 2] })), 'A、C')
check('判断题答案是中文', answerText(q({ questionType: 'true_false', correctAnswer: false })), '错误')
check('多选题答案下标越界也不会崩',
  answerText(q({ questionType: 'multi_select', correctAnswer: [0, 9] })), 'A、9')
check('填空答案是分号串', answerText(q({ questionType: 'fill_blank', correctAnswer: ['互斥', '循环等待'] })), '互斥；循环等待')
check('简答答案是原文', answerText(q({ questionType: 'short_answer', correctAnswer: '先破坏循环等待' })), '先破坏循环等待')
check('认不出的答案形状说"见解析"', answerText(q({ questionType: 'case_analysis', correctAnswer: { subs: [] } })), '见解析')
check('没有答案就是空串', answerText(q({ questionType: 'short_answer', correctAnswer: null })), '')

check('解析优先用标准解析', explanationOf(q()), '标准解析')
check('没标准解析时用题解', explanationOf(q({ analysis: null })), 'AI 题解')
check('两个都没有就是空', explanationOf(q({ analysis: '  ', answerExplanation: null })), '')

const row = questionFromRow({
  id: 'x1', question_type: 'multi_select', question_text: 't', options: ['a', 'b'],
  correct_answer: [0], subject: '计算机', category: '2024年真题', categories: ['2024年真题'],
  analysis: null, answer_explanation: null,
})
check('题库行 → 题目对象', [row.id, row.questionType, row.options, row.correctAnswer], ['x1', 'multi_select', ['a', 'b'], [0]])
check('options 不是数组时退回空数组', questionFromRow({
  id: 'x2', question_type: 'single_choice', question_text: 't', options: null,
  correct_answer: 0, subject: null, category: null, categories: null,
  analysis: null, answer_explanation: null,
}).options, [])
check('categories 不是数组时退回空数组', questionFromRow({
  id: 'x3', question_type: 'single_choice', question_text: 't', options: [],
  correct_answer: 0, subject: null, category: '2024年真题', categories: '2024年真题',
  analysis: null, answer_explanation: null,
}).categories, [])
check('年份只挂在 category 上时徽章仍然出得来', yearBadge({
  category: '2022年真题', categories: [],
}), '2022年真题')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
