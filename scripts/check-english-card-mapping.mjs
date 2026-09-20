/**
 * 校验：考试作答 → 英语（一）真实答题卡 的映射。
 *
 * 重点盯三件容易错的事：
 *   1. 题号不能按分区内顺序拍脑袋，要按卷面区间铺；且**一条记录占好几格**
 *      （完形整篇 20 空、阅读一篇 5 问），小题 id 就是卷面题号；
 *   2. Part B 的可选字母是 ABDEG，下标 2 必须落到字母 D、卡上第 4 列，不能落到第 3 列；
 *   3. 结构不符（分区数 / 小题数对不上）必须拒绝认卡，不能硬套一张错位卡。
 *
 * 用法：node scripts/check-english-card-mapping.mjs
 */
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })

let failed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

const ABCD = ['a', 'b', 'c', 'd']

/** 卷面一条记录 = 一大题；小题 id 就是卷面题号 */
const rec = (id, type, from, count, options) => ({
  id,
  question_type: type,
  options: [],
  case_questions: Array.from({ length: count }, (_, i) => ({
    id: String(from + i),
    type: options.length ? 'single_choice' : 'short_answer',
    text: `第 ${from + i} 题`,
    options,
    answer: 0,
  })),
})

/** 写作是单条记录，没有小题 */
const write = (id) => ({ id, question_type: 'writing', options: [], case_questions: [] })

/** 造一份英语（一）结构的卷子：1 / 4 / 1 / 1 / 1 / 1 条记录 = 20/20/5/5/1/1 格 */
const paper = [
  { name: '完形', scorePerQuestion: 0.5, questions: [rec('c', 'cloze', 1, 20, ABCD)] },
  { name: '阅读A', scorePerQuestion: 2, questions: [21, 26, 31, 36].map((from, i) => rec(`r${i + 1}`, 'reading_set', from, 5, ABCD)) },
  // Part B：选项文本自带字母前缀，随便顺序也必须按字母算列号
  { name: '阅读B', scorePerQuestion: 2, questions: [rec('b', 'sentence_order', 41, 5, ['E. 段E', 'G. 段G', 'A. 段A', 'B. 段B', 'D. 段D'])] },
  { name: '翻译', scorePerQuestion: 2, questions: [rec('t', 'translation', 46, 5, [])] },
  { name: '应用文', scorePerQuestion: 10, questions: [write('w1')] },
  { name: '短文', scorePerQuestion: 20, questions: [write('w2')] },
]

try {
  const { matchEnglishCard, buildNumberMap, answerColumns, buildCardAnswers, columnToAnswerIndex } = await vite.ssrLoadModule('/src/lib/exam-answer-sheet.ts')
  const { slotKey, withSlotValue } = await vite.ssrLoadModule('/src/lib/exam-paper.ts')

  const binding = matchEnglishCard(paper)
  check('认得英语（一）这张卡', !!binding, true)
  if (!binding) throw new Error('binding failed')

  check('分区题号区间', binding.sections.map((s) => s.range), [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]])
  check('卡上分区题数按小题算', binding.sections.map((s) => s.count), [20, 20, 5, 5, 1, 1])
  check('Part B 选项字母取自选项文本', binding.sections[2].optionLabels, ['E', 'G', 'A', 'B', 'D'])

  const map = buildNumberMap(paper, binding)
  const slotOf = (no) => { const s = map.slotByNo.get(no); return `${s.questionId}#${s.subId}` }
  check('第 1 / 20 格 → 完形同一条记录的第 1 / 20 小题', [slotOf(1), slotOf(20)], ['c#1', 'c#20'])
  check('第 21 格 → 阅读第一篇第 1 问', slotOf(21), 'r1#21')
  check('第 40 格 → 阅读第四篇第 5 问', slotOf(40), 'r4#40')
  check('第 41 / 45 格', [slotOf(41), slotOf(45)], ['b#41', 'b#45'])
  check('第 46 / 50 格', [slotOf(46), slotOf(50)], ['t#46', 't#50'])
  check('第 51 / 52 格是两条写作记录', [slotOf(51), slotOf(52)], ['w1#', 'w2#'])
  check('题号↔槽位互查自洽', map.noBySlot.get(slotKey('r4', '40')), 40)

  // 选项下标 → 列号
  check('完形选下标 0（A）→ 第 1 列', answerColumns(0, binding.sections[0]), [0])
  check('完形选下标 3（D）→ 第 4 列', answerColumns(3, binding.sections[0]), [3])
  check('Part B 下标 0（E）→ 第 5 列', answerColumns(0, binding.sections[2]), [4])
  check('Part B 下标 1（G）→ 第 7 列', answerColumns(1, binding.sections[2]), [6])
  check('Part B 下标 2（A）→ 第 1 列', answerColumns(2, binding.sections[2]), [0])
  check('Part B 下标 4（D）→ 第 4 列', answerColumns(4, binding.sections[2]), [3])
  check('没作答 → 不涂', answerColumns(null, binding.sections[0]), [])

  // 卡上点格子 → 选项下标（逆运算，Part B 的 C/F 不可选）
  check('卡上第 5 列（E）→ 下标 0', columnToAnswerIndex(4, binding.sections[2]), 0)
  check('卡上第 3 列（C，Part B 不可选）→ null', columnToAnswerIndex(2, binding.sections[2]), null)

  // 整卷作答（按「记录 + 小题」写回）
  let answers = new Map()
  const put = (no, value) => {
    const slot = map.slotByNo.get(no)
    answers.set(slot.questionId, withSlotValue(answers.get(slot.questionId), slot.subId, value))
  }
  put(1, 2)
  put(41, 2)
  put(42, 4)
  put(46, '随便一段译文')
  check('整卷作答 → 卡上涂格（主观题不出格）', buildCardAnswers(answers, map, binding), { 1: [2], 41: [0], 42: [3] })
  check('完形只答第 1 空时其余空不涂', Object.keys(buildCardAnswers(answers, map, binding)), ['1', '41', '42'])

  // 涂出来的格子必须真实存在于卡上，且列号就是答案字母在卡上的列序
  // （卡上 A–G 七列按 x 递增排，所以「先取字母、再按字母表算列号」= 涂到字母那一列）
  const { objectiveCells, officialCardById, questionRows } = await vite.ssrLoadModule('/src/lib/answer-sheet-official.ts')
  const cells = objectiveCells(officialCardById('official-english1'))
  const row45 = cells.filter((c) => c.q === 45)
  check('卡上第 45 题一行有 7 列且 x 递增', [row45.length, row45.every((c, i, arr) => i === 0 || c.x > arr[i - 1].x)], [7, true])

  let full = new Map()
  for (let i = 0; i < 5; i++) {
    const slot = map.slotByNo.get(41 + i)
    full.set(slot.questionId, withSlotValue(full.get(slot.questionId), slot.subId, i))
  }
  const partBDraft = buildCardAnswers(full, map, binding)
  const letters = binding.sections[2].optionLabels
  check('Part B 下标 0–4 → 答案字母所在列（ABDEG → 1/2/4/5/7 列）',
    [41, 42, 43, 44, 45].map((no) => partBDraft[no][0]),
    letters.map((l) => l.charCodeAt(0) - 65))
  check('涂的每一格在卡模型里都存在',
    [41, 42, 43, 44, 45].every((no) => cells.some((c) => c.q === no && c.option === partBDraft[no][0])),
    true)

  // ── 双向定位：卡上圈当前题的那一行 + 点题号区回跳 ──
  const rows = questionRows(officialCardById('official-english1'))
  check('卡上每题一行（45 道客观题）', rows.length, 45)
  const row41 = rows.find((r) => r.q === 41)
  const cells41 = cells.filter((c) => c.q === 41)
  check('行框包住第 41 题的 7 个圈',
    [row41.left < Math.min(...cells41.map((c) => c.x)) - 1, row41.width > Math.max(...cells41.map((c) => c.x)) - Math.min(...cells41.map((c) => c.x))],
    [true, true])
  check('点题号的热区在圆圈左边（不压住作答区）', row41.hitLeft < row41.left && row41.hitTop > row41.top, true)
  check('每行都有独立的热区（互不重叠到同一题）', new Set(rows.map((r) => r.q)).size, 45)

  // 结构不符时必须拒绝，不硬套
  check('分区数不对 → 不认', matchEnglishCard(paper.slice(0, 5)), null)
  const wrongCount = structuredClone(paper)
  wrongCount[0].questions[0].case_questions = wrongCount[0].questions[0].case_questions.slice(0, 19)
  check('完形小题数不对 → 不认', matchEnglishCard(wrongCount), null)
  const wrongType = structuredClone(paper)
  wrongType[1].questions[0].question_type = 'cloze'
  check('阅读分区的题型被换掉 → 不认', matchEnglishCard(wrongType), null)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
