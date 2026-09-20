/**
 * 校验英语（一）真题卷模板预设。
 *
 * 重点盯三件容易错的事：
 *   1. `sample_mode` 必须是 `seq` —— 分区内随机抽题会让卷面题号跟题库对不上，
 *      自动涂卡直接涂错位（答题卡的格位是卷面题号，不是抽题顺序）；
 *   2. `count` 是**记录数**（一条记录 = 卷面的一大题），小题数靠题型本身区分
 *      （cloze / reading_set / sentence_order / translation / writing），
 *      所以分区**不再需要** `categories` 标签去切同一个 single_choice；
 *   3. 总题数 / 总分按小题算（52 题 100 分）。
 *
 * 用法：node scripts/check-exam-presets.mjs
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
  const { BUILTIN_EXAM_TEMPLATES, totalQuestions, totalScore } = await vite.ssrLoadModule('/src/lib/exam-presets.ts')
  const t = BUILTIN_EXAM_TEMPLATES.find((x) => x.id.includes('english1'))
  check('存在英语（一）真题卷预设', !!t, true)
  if (!t) throw new Error('预设缺失')

  check('学科限定为英语一', t.subject, ['英语一'])
  check('题序锁真题原序（否则题号对不上答题卡）', t.sample_mode, 'seq')
  check('整卷顺序按分区', t.order_mode, 'section')
  check('总题数 52', totalQuestions(t.sections), 52)
  check('总分 100', totalScore(t.sections), 100)

  // 分区结构：必须跟卷面六段一一对应（题型互不相同，写作两篇靠 seq 顺序分）
  check('分区数 6', t.sections.length, 6)
  check('分区 (题型, 记录数, 每题分值)', t.sections.map((s) => [s.type, s.count, s.score]), [
    ['cloze', 1, 0.5],
    ['reading_set', 4, 2],
    ['sentence_order', 1, 2],
    ['translation', 1, 2],
    ['writing', 1, 10],
    ['writing', 1, 20],
  ])

  // 题型已经能分开六段了，不该再靠 categories 标签切
  check('分区不再靠 categories hack', t.sections.every((s) => s.categories.length === 0), true)
  check('分区 id 互不重复', new Set(t.sections.map((s) => s.id)).size, 6)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
