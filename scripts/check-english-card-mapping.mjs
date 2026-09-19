/**
 * 校验：考试作答 → 英语（一）真实答题卡 的映射。
 *
 * 重点盯两件容易错的事：
 *   1. 题号不能按分区内顺序拍脑袋，要按卷面区间铺；
 *   2. Part B 的可选字母是 ABDEG，下标 2 必须落到字母 D、卡上第 4 列，不能落到第 3 列。
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

try {
  const { matchEnglishCard, buildNumberMap, answerColumns, buildCardAnswers } = await vite.ssrLoadModule('/src/lib/exam-answer-sheet.ts')

  /** 造一份英语（一）结构的卷子：20/20/5/5/1/1 */
  const mk = (n, prefix, options) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i + 1}`,
      question_type: 'single_choice',
      options,
    }))
  const paper = [
    { name: '完形', scorePerQuestion: 0.5, questions: mk(20, 'c', ['a', 'b', 'c', 'd']) },
    { name: '阅读A', scorePerQuestion: 2, questions: mk(20, 'r', ['a', 'b', 'c', 'd']) },
    // Part B：选项文本自带字母前缀，随便顺序也必须按字母算列号
    { name: '阅读B', scorePerQuestion: 2, questions: mk(5, 'b', ['E. 段E', 'G. 段G', 'A. 段A', 'B. 段B', 'D. 段D']) },
    { name: '翻译', scorePerQuestion: 2, questions: Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, question_type: 'short_answer', options: [] })) },
    { name: '应用文', scorePerQuestion: 10, questions: [{ id: 'w1', question_type: 'short_answer', options: [] }] },
    { name: '短文', scorePerQuestion: 20, questions: [{ id: 'w2', question_type: 'short_answer', options: [] }] },
  ]

  const binding = matchEnglishCard(paper)
  check('认得英语（一）这张卡', !!binding, true)
  if (!binding) throw new Error('binding failed')

  check('分区题号区间', binding.sections.map((s) => s.range), [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]])
  check('Part B 选项字母取自选项文本', binding.sections[2].optionLabels, ['E', 'G', 'A', 'B', 'D'])

  const map = buildNumberMap(paper, binding)
  check('第 1 题 → 完形第 1 题', map.noByQuestionId.get('c1'), 1)
  check('第 20 题 → 完形第 20 题', map.noByQuestionId.get('c20'), 20)
  check('第 21 题 → 阅读 A 第 1 题', map.noByQuestionId.get('r1'), 21)
  check('第 41 题 → Part B 第 1 题', map.noByQuestionId.get('b1'), 41)
  check('第 45 题 → Part B 第 5 题', map.noByQuestionId.get('b5'), 45)
  check('第 46 题 → 翻译第 1 题', map.noByQuestionId.get('t1'), 46)
  check('第 51 / 52 题', [map.noByQuestionId.get('w1'), map.noByQuestionId.get('w2')], [51, 52])
  check('题号↔题号互查自洽', map.questionIdByNo.get(45), 'b5')

  // 选项下标 → 列号
  check('完形选下标 0（A）→ 第 1 列', answerColumns(0, binding.sections[0]), [0])
  check('完形选下标 3（D）→ 第 4 列', answerColumns(3, binding.sections[0]), [3])
  check('Part B 下标 0（E）→ 第 5 列', answerColumns(0, binding.sections[2]), [4])
  check('Part B 下标 1（G）→ 第 7 列', answerColumns(1, binding.sections[2]), [6])
  check('Part B 下标 2（A）→ 第 1 列', answerColumns(2, binding.sections[2]), [0])
  check('Part B 下标 4（D）→ 第 4 列', answerColumns(4, binding.sections[2]), [3])
  check('没作答 → 不涂', answerColumns(null, binding.sections[0]), [])

  const answers = new Map([['c1', 2], ['b1', 2], ['b2', 4], ['t1', '随便一段译文']])
  check('整卷作答 → 卡上涂格（主观题不出格）', buildCardAnswers(answers, map, binding), { 1: [2], 41: [0], 42: [3] })

  // 结构不符时必须拒绝，不硬套
  check('分区数不对 → 不认', matchEnglishCard(paper.slice(0, 5)), null)
  const wrong = structuredClone(paper)
  wrong[0].questions = wrong[0].questions.slice(0, 19)
  check('完形题数不对 → 不认', matchEnglishCard(wrong), null)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
