/**
 * 校验英语（一）真题卷模板预设。
 *
 * 重点盯两件容易错的事：
 *   1. `sample_mode` 必须是 `seq` —— 分区内随机抽题会让卷面题号跟题库对不上，
 *      自动涂卡直接涂错位（答题卡的格位是卷面题号，不是抽题顺序）；
 *   2. 分区必须带 `categories` —— 完形/阅读/新题型都是 `single_choice`，
 *      只靠题型切不开，得靠 compose_exam 那个 `q.categories ?| 分区categories` 的标签。
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

  // 分区结构：必须跟卷面六段一一对应
  check('分区数 6', t.sections.length, 6)
  check('分区 (题型, 题数, 分值, 分类标签)', t.sections.map((s) => [s.type, s.count, s.score, s.categories]), [
    ['single_choice', 20, 0.5, ['完形填空']],
    ['single_choice', 20, 2, ['阅读理解 Text 1', '阅读理解 Text 2', '阅读理解 Text 3', '阅读理解 Text 4']],
    ['single_choice', 5, 2, ['新题型']],
    ['analysis', 5, 2, ['翻译']],
    ['analysis', 1, 10, ['应用文写作']],
    ['analysis', 1, 20, ['短文写作']],
  ])

  // 每个分区都得有分类标签，否则跟别的 single_choice 混在一起
  check('每个分区都带分类标签', t.sections.every((s) => s.categories.length > 0), true)
  check('分区 id 互不重复', new Set(t.sections.map((s) => s.id)).size, 6)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
