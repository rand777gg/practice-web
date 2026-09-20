/**
 * 校验：真题卷模板 → 分区切分 → 英语（一）答题卡绑定 → 卷面题号 ↔ 记录/小题映射。
 *
 * 这个脚本是照着一串真实故障写的，每一条 check 都对着踩过的坑：
 *   1. `buildPaperSections` 不按 count 截断 / 吞分区 → 工具栏上看不到「真实答题卡」按钮；
 *   2. 映射从「questionId → 题号」改成「记录 + 小题 → 题号」后，一条记录占好几格
 *      （完形 20 空、阅读一篇 5 问），错一格就整片涂错位；
 *   3. Part B 的可选字母是 A、B、D、E、G（C/F/H 被卷面给定）：**先由下标取字母、再按字母表算列号**，
 *      拿下标当列号会整列错（答案 E 会涂到 D 格上）——这个坑已经踩过两次。
 *
 * 所以这里按**线上真实数据的形状**造 9 条记录（完形整篇 / 四篇阅读 / Part B / 翻译 / 两篇写作，
 * 小题 id 就是卷面题号），只要切分、绑定或映射退回老样子，这个脚本就会红。
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

const ABCD = ['选项 A', '选项 B', '选项 C', '选项 D']
const PART_B_LETTERS = ['A', 'B', 'D', 'E', 'G']

try {
  const { buildPaperSections } = await vite.ssrLoadModule('/src/lib/exam-compose.ts')
  const { matchEnglishCard, buildNumberMap, buildCardAnswers } = await vite.ssrLoadModule('/src/lib/exam-answer-sheet.ts')
  const { buildPaperLayout, recordSlotIds, slotKey, withSlotValue, slotValue } = await vite.ssrLoadModule('/src/lib/exam-paper.ts')
  const { BUILTIN_EXAM_TEMPLATES, totalQuestions, totalScore } = await vite.ssrLoadModule('/src/lib/exam-presets.ts')

  const template = BUILTIN_EXAM_TEMPLATES.find((t) => t.id.includes('english1'))
  check('模板总题数按小题算（52）', totalQuestions(template.sections), 52)
  check('模板总分（100）', totalScore(template.sections), 100)

  // 造 9 条记录，形态与库里一致：一条记录 = 卷面的一大题，小题 id 就是卷面题号
  const rec = (id, type, from, count, options, paper) => ({
    id,
    question_type: type,
    question_text: paper.passage ?? paper.directions ?? '',
    options: [],
    correct_answer: null,
    category: `2026年真题 · ${paper.sectionTitle}`,
    categories: ['2026年真题', '英语一'],
    subject: '英语一',
    analysis: null,
    key_points: null,
    answer_explanation: null,
    seq_number: from,
    created_at: '',
    created_by: null,
    verified: true,
    import_mode: 'english-paper',
    allow_unordered: false,
    unordered_blanks: null,
    source_page: null,
    case_questions: Array.from({ length: count }, (_, i) => ({
      id: String(from + i),
      type: options.length ? 'single_choice' : 'short_answer',
      text: `第 ${from + i} 题`,
      options,
      answer: options.length ? 0 : null,
    })),
    paper,
  })

  const base = { paperTitle: '2026 年全国硕士研究生招生考试英语（一）', ordinal: 'Section II Part A', sectionTitle: 'Reading Comprehension', directions: 'Directions…' }
  const questions = [
    rec('cloze', 'cloze', 1, 20, ABCD, { ...base, ordinal: 'Section I', sectionTitle: 'Use of English', passage: 'Text [[1]] … [[20]]' }),
    ...[21, 26, 31, 36].map((from, i) => rec(`read${i + 1}`, 'reading_set', from, 5, ABCD, { ...base, heading: `Text ${i + 1}`, passage: `Text ${i + 1} body` })),
    rec('order', 'sentence_order', 41, 5, PART_B_LETTERS.map((l) => `段落 ${l}`), {
      ...base, ordinal: 'Section II Part B', sectionTitle: 'Reading Comprehension Part B',
      paragraphs: PART_B_LETTERS.map((l) => ({ letter: l, text: `段落 ${l}` })),
      placed: ['C', 'F', 'H'], skeleton: ['F', 41, 42, 'H', 43, 'C', 44, 45],
    }),
    rec('trans', 'translation', 46, 5, [], { ...base, ordinal: 'Section II Part C', sectionTitle: 'Reading Comprehension Part C', passage: '全文' }),
    rec('writingA', 'writing', 51, 0, [], { ...base, ordinal: 'Section III Part A', sectionTitle: 'Writing Part A', directions: 'Read the following email' }),
    rec('writingB', 'writing', 52, 0, [], {
      ...base, ordinal: 'Section III Part B', sectionTitle: 'Writing Part B', directions: 'Write an essay',
      charts: [{ kind: 'pie', items: [{ label: '完全接受', value: 39.3 }] }],
    }),
  ]

  const sections = buildPaperSections(questions, template)
  check('切出 6 个分区', sections.length, 6)
  check('每个分区的记录数与小题数',
    sections.map((s) => [s.questions.length, s.questions.reduce((n, x) => n + Math.max(1, x.case_questions?.length ?? 0), 0)]),
    [[1, 20], [4, 20], [1, 5], [1, 5], [1, 1], [1, 1]])
  check('分区名不再靠 categories', sections.map((s) => s.name).slice(0, 3), ['完形填空', '阅读理解', '新题型（排序）'])
  check('记录不会跨分区重复', new Set(sections.flatMap((s) => s.questions.map((q) => q.id))).size, 9)

  const binding = matchEnglishCard(sections)
  check('绑得上英语（一）答题卡', !!binding, true)
  if (!binding) throw new Error('绑定失败')
  check('卡上分区题号区间', binding.sections.map((s) => s.range), [[1, 20], [21, 40], [41, 45], [46, 50], [51, 51], [52, 52]])
  check('卡上分区题数', binding.sections.map((s) => s.count), [20, 20, 5, 5, 1, 1])
  check('Part B 可选字母', binding.sections[2].optionLabels, ['A', 'B', 'D', 'E', 'G'])

  const map = buildNumberMap(sections, binding)
  check('一卷 52 格全部映射到', map.slotByNo.size, 52)
  check('题号不重复铺（槽位也不重复）', map.noBySlot.size, 52)
  check('完形第 1 / 20 格 → 同一条记录的 1 / 20 小题',
    [1, 20].map((no) => { const s = map.slotByNo.get(no); return [s.questionId, s.subId] }),
    [['cloze', '1'], ['cloze', '20']])
  check('阅读第 21 / 40 格分属第一篇与第四篇',
    [21, 40].map((no) => { const s = map.slotByNo.get(no); return [s.questionId, s.subId] }),
    [['read1', '21'], ['read4', '40']])
  check('Part B / 翻译 / 写作的格位',
    [41, 45, 46, 50, 51, 52].map((no) => { const s = map.slotByNo.get(no); return [s.questionId, s.subId] }),
    [['order', '41'], ['order', '45'], ['trans', '46'], ['trans', '50'], ['writingA', ''], ['writingB', '']])
  check('每一格都落在自己分区的题号区间内',
    sections.every((s, si) => {
      const [from, to] = binding.sections[si].range
      return s.questions
        .flatMap((q) => recordSlotIds(q).map((subId) => map.noBySlot.get(slotKey(q.id, subId))))
        .every((no) => no >= from && no <= to)
    }),
    true)

  // ── 作答 → 卡上要涂的列号 ──
  const answers = new Map()
  const put = (no, value) => {
    const slot = map.slotByNo.get(no)
    answers.set(slot.questionId, withSlotValue(answers.get(slot.questionId), slot.subId, value))
  }
  for (let no = 1; no <= 40; no++) put(no, (no - 1) % 4)
  // Part B：#41–45 依次选 A、B、D、E、G 的下标 0–4
  for (let i = 0; i < 5; i++) put(41 + i, i)
  put(46, '这是一句译文。')
  put(52, 'essay')

  const draft = buildCardAnswers(answers, map, binding)
  check('完形 + 阅读涂了 40 格', Object.keys(draft).filter((n) => Number(n) <= 40).length, 40)
  check('第 1 格涂 A、第 4 格涂 D（下标 0/3 → 第 1/4 列）', [draft[1], draft[4]], [[0], [3]])
  check('Part B 下标 0–4 → 卡上第 1/2/4/5/7 列（ABDEG 不连续）',
    [41, 42, 43, 44, 45].map((no) => draft[no]), [[0], [1], [3], [4], [6]])
  check('主观题不出格子', [draft[46], draft[51], draft[52]], [undefined, undefined, undefined])

  // ── 一格一格写回：改一空不能碰同一记录的其他空 ──
  const after = withSlotValue(answers.get('cloze'), '7', 2)
  check('改完形第 7 空，第 1 空的作答还在', [slotValue(after, '1'), slotValue(after, '7')], [0, 2])
  check('写作是单条记录，整条替换', slotValue(withSlotValue('old', '', 'new'), ''), 'new')
  check('槽位键与映射键一致', slotKey('cloze', '7'), 'cloze#7')

  // ── 卷面：从记录拼出渲染器要的结构 ──
  const layout = buildPaperLayout(questions)
  check('拼出卷面', !!layout, true)
  check('卷面标题', layout.title, '2026 年全国硕士研究生招生考试英语（一）')
  check('完形 20 空 + 挖空标记在正文里', [layout.sections.cloze.blanks.length, layout.sections.cloze.passage.includes('[[1]]')], [20, true])
  check('阅读四篇，每篇 5 问', layout.sections.reading.texts.map((t) => [t.heading, t.questions.length]), [['Text 1', 5], ['Text 2', 5], ['Text 3', 5], ['Text 4', 5]])
  check('Part B 骨架与待选段落', [layout.sections.partB.skeleton.slice(0, 3), layout.sections.partB.questions.length], [['F', 41, 42], 5])
  check('翻译 5 句待译', layout.sections.partC.segments.map((s) => s.no), [46, 47, 48, 49, 50])
  check('两篇写作各就各位', [layout.sections.writingA.ordinal, layout.sections.writingB.charts.length], ['Section III Part A', 1])

  // 普通记录（非卷面）拼不出卷面 → 走通用渲染
  check('没有卷面素材就返回 null', buildPaperLayout([{ ...questions[0], paper: null }]), null)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
