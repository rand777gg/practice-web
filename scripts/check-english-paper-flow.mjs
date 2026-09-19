/**
 * 校验：真题卷模板 → 分区切分 → 英语（一）答题卡绑定。
 *
 * 这个脚本是照着一个真实故障写的：工具栏上看不到「真实答题卡」按钮。
 * 根因是 `buildPaperSections` 不按 `count` 截断、也忽略 `categories`，
 * 于是第一个 single_choice 分区把 45 道单选全吞了（45≠20），绑定失败。
 *
 * 所以这里**按线上真实数据的形状**造题：52 题、题号 1–52、
 * categories 带分区标签、前三个分区同为 single_choice —— 只要切分或绑定退回老样子，
 * 这个脚本就会红。
 *
 * 用法：node scripts/check-english-paper-flow.mjs
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
  const { buildPaperSections } = await vite.ssrLoadModule('/src/lib/exam-compose.ts')
  const { matchEnglishCard, buildNumberMap } = await vite.ssrLoadModule('/src/lib/exam-answer-sheet.ts')
  const { BUILTIN_EXAM_TEMPLATES } = await vite.ssrLoadModule('/src/lib/exam-presets.ts')

  const template = BUILTIN_EXAM_TEMPLATES.find((t) => t.id.includes('english1'))
  const kindOf = (no) => no <= 20 ? '完形填空'
    : no <= 40 ? `阅读理解 Text ${Math.ceil((no - 20) / 5)}`
      : no <= 45 ? '新题型' : no <= 50 ? '翻译' : no === 51 ? '应用文写作' : '短文写作'

  // 造 52 道题，形态与库里一致
  const questions = Array.from({ length: 52 }, (_, i) => {
    const no = i + 1
    const subjective = no > 45
    const labels = no >= 41 && no <= 45 ? ['A', 'B', 'D', 'E', 'G'] : ['A', 'B', 'C', 'D']
    return {
      id: `q${no}`,
      question_type: subjective ? 'analysis' : 'single_choice',
      question_text: `第 ${no} 题题干`,
      options: subjective ? [] : (no >= 41 ? labels.map((l) => `段落 ${l}`) : labels.map((l) => `选项 ${l}`)),
      correct_answer: subjective ? null : 0,
      category: `2026年真题 · ${kindOf(no)}`,
      categories: ['2026年真题', '英语一', subjective ? '主观题' : '客观题', kindOf(no)],
      subject: '英语一',
      analysis: null,
      key_points: null,
      seq_number: no,
    }
  })

  const sections = buildPaperSections(questions, template)
  check('切出 6 个分区', sections.length, 6)
  check('每个分区的题数', sections.map((s) => s.questions.length), [20, 20, 5, 5, 1, 1])
  check('分区名取自 categories', sections.map((s) => s.name)[0], '完形填空')
  check('题不会跨分区重复', new Set(sections.flatMap((s) => s.questions.map((q) => q.id))).size, 52)

  const binding = matchEnglishCard(sections)
  check('绑得上英语（一）答题卡', !!binding, true)
  if (!binding) throw new Error('绑定失败')
  check('卡上分区题号区间', binding.sections.map((s) => s.range), [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]])
  check('Part B 可选字母', binding.sections[2].optionLabels, ['A', 'B', 'D', 'E', 'G'])

  const map = buildNumberMap(sections, binding)
  check('题号映射：第 1 / 20 / 21 / 41 / 45 / 46 / 52 题',
    [1, 20, 21, 41, 45, 46, 52].map((no) => map.noByQuestionId.get(`q${no}`)),
    [1, 20, 21, 41, 45, 46, 52])
  check('题号不被分区顺序打乱（每题都在自己的区间内）',
    sections.every((s, si) => s.questions.every((q) => {
      const [from, to] = binding.sections[si].range
      return map.noByQuestionId.get(q.id) >= from && map.noByQuestionId.get(q.id) <= to
    })), true)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
