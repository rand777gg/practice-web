/**
 * 2026 年考研英语（一）真题入库。
 *
 * **一条记录 = 卷面的一大题**：完形整篇（20 空）、四篇阅读（每篇 5 问）、Part B 排序（5 空）、
 * 翻译（5 句）、两篇写作，共 9 条。小题挂在该记录的 `case_questions` 上，
 * **小题 id 就是卷面题号**——答题卡按题号涂格，拿题号当小题 id 就不用再维护一层对照表。
 *
 * 卷面素材（分区标题、Directions 原文、整篇正文、段落骨架、图表）写进记录的 `paper` 字段，
 * 题目记录自带卷面，所以不再需要 paper_layouts 快照表。
 *
 * 答案来源：用户提供的答案图（1–45）。逐格读出：
 *   1-5   A D B C B     6-10  C A D A D     11-15 D D C A B
 *   16-20 C C B B A     21-25 C D A B B     26-30 D A B C A
 *   31-35 A A C B D     36-40 D C B D C     41-45 B E A G D
 *
 * **Part B 的答案字母不能按字母表算下标**。该题选项是 A、B、D、E、G（C/F/H 已给定），
 * 答案 E 对应的是列表第 4 项（下标 3），按字母表算会得 4，全错位。
 *
 * 用法：
 *   node scripts/import-english-paper.mjs                # 打印 SQL 供审查
 *   node scripts/import-english-paper.mjs --out x.sql    # 写到文件
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdfPath = process.env.B4_PDF ?? join(homedir(), 'Desktop', '2026年考研英语一.pdf')
const SUBJECT = '英语一'
const CATEGORY = '2026年真题'
const SOURCE = '2026年考研英语一.pdf'
const IMPORT_MODE = 'english-paper'
const PAPER_TITLE = '2026 年全国硕士研究生招生考试英语（一）'

/** 1–45 标准答案（按题号），来源：用户提供的答案图 */
const ANSWERS = {
  ...'ADBCB'.split('').reduce((a, c, i) => ({ ...a, [i + 1]: c }), {}),
  ...'CADAD'.split('').reduce((a, c, i) => ({ ...a, [i + 6]: c }), {}),
  ...'DDCAB'.split('').reduce((a, c, i) => ({ ...a, [i + 11]: c }), {}),
  ...'CCBBA'.split('').reduce((a, c, i) => ({ ...a, [i + 16]: c }), {}),
  ...'CDABB'.split('').reduce((a, c, i) => ({ ...a, [i + 21]: c }), {}),
  ...'DABCA'.split('').reduce((a, c, i) => ({ ...a, [i + 26]: c }), {}),
  ...'AACBD'.split('').reduce((a, c, i) => ({ ...a, [i + 31]: c }), {}),
  ...'DCBDC'.split('').reduce((a, c, i) => ({ ...a, [i + 36]: c }), {}),
  ...'BEAGD'.split('').reduce((a, c, i) => ({ ...a, [i + 41]: c }), {}),
}

async function extractPagesText(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: false }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let out = '', prevEnd = null, prevSize = 10
    for (const it of tc.items) {
      const size = Math.abs(it.transform[3]) || prevSize
      const x = it.transform[4]
      if (prevEnd !== null && x - prevEnd > size * 0.22 && !out.endsWith(' ')) out += ' '
      out += it.str
      prevEnd = x + (it.width ?? 0)
      prevSize = size
      if (it.hasEOL) { out += '\n'; prevEnd = null }
    }
    pages.push(out)
  }
  return pages.join('\n').replace(/https?:\/\/zhenti\.burningvocabulary\.cn/g, '')
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const json = (v) => `$json$${JSON.stringify(v)}$json$::jsonb`

/** 答案字母 → 选项下标：按**选项列表**里的位置，不按字母表 */
function letterToIndex(letter, labels) {
  const i = labels.indexOf(letter)
  if (i < 0) throw new Error(`答案 ${letter} 不在选项 ${labels.join('')} 里`)
  return i
}

const text = await extractPagesText(pdfPath)

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })
try {
  const { parseEnglishQuestions } = await vite.ssrLoadModule('/src/lib/english-questions.ts')
  const { parseEnglishPaperLayout } = await vite.ssrLoadModule('/src/lib/english-paper-layout.ts')
  const { paperProse } = await vite.ssrLoadModule('/src/lib/exam-paper.ts')

  const parsed = parseEnglishQuestions(text)
  const layout = parseEnglishPaperLayout(text)
  const byNo = new Map(parsed.questions.map((x) => [x.no, x]))
  const warnings = [...parsed.warnings, ...layout.warnings]

  const head = (block) => ({ ordinal: block.ordinal, sectionTitle: block.title, directions: block.directions })

  /** 客观题小题：题干 + 选项 + 标准答案下标 */
  const choiceSub = (no, labels) => {
    const item = byNo.get(no)
    if (!item) throw new Error(`没解出第 ${no} 题`)
    return {
      id: String(no),
      type: 'single_choice',
      text: item.stem,
      options: item.options,
      answer: letterToIndex(ANSWERS[no], labels),
    }
  }

  const records = []

  // ── Section I 完形：整篇正文 + 20 空 ──
  const cloze = layout.sections.cloze
  if (cloze) {
    records.push({
      type: 'cloze',
      no: 1,
      kind: '完形填空',
      text: paperProse(cloze.passage),
      subs: Array.from({ length: 20 }, (_, i) => choiceSub(i + 1, ['A', 'B', 'C', 'D'])),
      paper: { paperTitle: PAPER_TITLE, ...head(cloze), passage: cloze.passage },
    })
  }

  // ── Section II Part A 阅读：一篇 Text 一条记录 ──
  for (const t of layout.sections.reading?.texts ?? []) {
    const from = 21 + (t.no - 1) * 5
    records.push({
      type: 'reading_set',
      no: from,
      kind: `阅读理解 Text ${t.no}`,
      text: t.passage,
      subs: Array.from({ length: 5 }, (_, i) => choiceSub(from + i, ['A', 'B', 'C', 'D'])),
      paper: {
        paperTitle: PAPER_TITLE,
        ...head(layout.sections.reading.head),
        heading: t.heading,
        passage: t.passage,
      },
    })
  }

  // ── Section II Part B 新题型：段落 + 骨架 + 5 空（选项是段落字母） ──
  const partB = layout.sections.partB
  if (partB) {
    const labels = byNo.get(41)?.optionLabels ?? ['A', 'B', 'D', 'E', 'G']
    records.push({
      type: 'sentence_order',
      no: 41,
      kind: '新题型',
      text: partB.paragraphs.map((p) => `${p.letter}. ${p.text}`).join('\n\n'),
      subs: Array.from({ length: 5 }, (_, i) => choiceSub(41 + i, labels)),
      paper: {
        paperTitle: PAPER_TITLE,
        ...head(partB),
        paragraphs: partB.paragraphs,
        placed: partB.placed,
        skeleton: partB.skeleton,
      },
    })
  }

  // ── Section II Part C 翻译：全文 + 5 句待译（无标准答案，走 AI 建议分） ──
  const partC = layout.sections.partC
  if (partC) {
    records.push({
      type: 'translation',
      no: 46,
      kind: '翻译',
      text: partC.passage,
      subs: partC.segments.map((s) => ({
        id: String(s.no),
        type: 'short_answer',
        text: s.sentence,
        options: [],
        answer: null,
      })),
      paper: { paperTitle: PAPER_TITLE, ...head(partC), passage: partC.passage },
    })
  }

  // ── Section III Writing：两篇写作，各一条记录（单条记录没有小题） ──
  const writings = [
    { block: layout.sections.writingA, no: 51, kind: '应用文写作' },
    { block: layout.sections.writingB, no: 52, kind: '短文写作' },
  ]
  for (const w of writings) {
    if (!w.block) continue
    const item = byNo.get(w.no)
    if (!item) throw new Error(`没解出第 ${w.no} 题`)
    records.push({
      type: 'writing',
      no: w.no,
      kind: w.kind,
      text: item.stem,
      subs: [],
      paper: {
        paperTitle: PAPER_TITLE,
        ...head(w.block),
        letterBox: w.block.letterBox,
        charts: w.block.charts,
        chartCaption: w.block.chartCaption,
      },
    })
  }

  const span = (r) => (r.subs.length > 1 ? `第 ${r.no}–${Number(r.subs[r.subs.length - 1].id)} 题` : `第 ${r.no} 题`)

  const rows = records.map((r) => [
    `  (${q(r.text)}, '[]'::jsonb, ${q(SUBJECT)}, ${q(`${CATEGORY} · ${r.kind}`)}, ` +
    `${json([CATEGORY, '英语一', r.kind])}, ${q(r.type)}, 'null'::jsonb, ${r.no}, ` +
    `${q(`${SOURCE}（${span(r)}）`)}, true, ${q(IMPORT_MODE)}, ` +
    `${r.subs.length ? json(r.subs) : 'null'}, ${json(r.paper)})`,
  ]).join(',\n')

  const sql = [
    `-- 2026 年考研英语（一）真题入库（9 条卷面记录：整篇/整篇 Text/Part B/翻译/两篇写作）`,
    `-- 幂等：先按 import_mode 清掉本批次，再整体重插`,
    `delete from questions where import_mode = '${IMPORT_MODE}';`,
    '',
    'insert into questions',
    '  (question_text, options, subject, category, categories, question_type, correct_answer,',
    '   seq_number, source_page, verified, import_mode, case_questions, paper)',
    'values',
    rows + ';',
    '',
    `select question_type, seq_number, jsonb_array_length(coalesce(case_questions, '[]'::jsonb)) as subs,`,
    `       paper->>'sectionTitle' as section, left(question_text, 24) as head`,
    `from questions where import_mode = '${IMPORT_MODE}' order by seq_number;`,
  ].join('\n')

  console.log(`共 ${records.length} 条记录，覆盖 ${records.reduce((n, r) => n + Math.max(1, r.subs.length), 0)} 个小题`)
  for (const r of records) {
    console.log(`  ${String(r.no).padStart(2)}  ${r.type.padEnd(15)} ${String(r.subs.length).padStart(2)} 小题  ${r.paper.sectionTitle}`)
  }
  console.log('\n=== 答案字母 → 选项下标（重点核对 Part B：ABDEG）===')
  for (const r of records) {
    if (r.type !== 'sentence_order') continue
    for (const s of r.subs) console.log(`  #${s.id} 答案 ${ANSWERS[s.id]} → 下标 ${s.answer}（选项 ${s.options.join('/')}）`)
  }
  if (warnings.length) {
    console.log('\n=== 解析告警 ===')
    for (const w of warnings) console.log('  ! ' + w)
  }

  const outIdx = process.argv.indexOf('--out')
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    writeFileSync(process.argv[outIdx + 1], sql, 'utf8')
    console.log(`\nSQL 已写入 ${process.argv[outIdx + 1]}`)
  } else {
    console.log('\n' + sql)
  }
} finally {
  await vite.close()
}
