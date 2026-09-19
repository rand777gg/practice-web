/**
 * 2026 年考研英语（一）真题入库。
 *
 * 答案来源：用户提供的答案图（1–45）。逐格读出：
 *   1-5   A D B C B     6-10  C A D A D     11-15 D D C A B
 *   16-20 C C B B A     21-25 C D A B B     26-30 D A B C A
 *   31-35 A A C B D     36-40 D C B D C     41-45 B E A G D
 *
 * 两个关键处理：
 *   1. **材料要一并放进 question_text**。项目约定如此（见 prompt-catalog 的抽取 prompt），
 *      而且"According to Paragraph 1…"这类题干离了原文就是废题。
 *   2. **Part B 的答案字母不能按字母表算下标**。该题选项是 A、B、D、E、G（F/H/C 已给定），
 *      答案 E 对应的是列表第 4 项（下标 3），按字母表算会得 4，全错位。
 *
 * 用法：
 *   node scripts/import-english-paper.mjs                # 打印 SQL 供审查
 *   node scripts/import-english-paper.mjs --out x.sql    # 写到文件
 */
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdfPath = process.env.B4_PDF ?? join(homedir(), 'Desktop', '2026年考研英语一.pdf')
const SUBJECT = '英语一'
const CATEGORY = '2026年真题'
const SOURCE = '2026年考研英语一.pdf'
const IMPORT_MODE = 'english-paper'

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

const flat = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** 答案字母 → 选项下标：按**选项列表**里的位置，不按字母表 */
function letterToIndex(letter, labels) {
  const i = labels.indexOf(letter)
  if (i < 0) throw new Error(`答案 ${letter} 不在选项 ${labels.join('')} 里`)
  return i
}

const text = await extractPagesText(pdfPath)

// 各区块
const sectionI = text.slice(text.search(/Section\s+I\s+Use\s+of\s+English/i), text.search(/Section\s+II\s+Reading/))
const readA = text.slice(text.search(/Part\s+A(?=[\s\S]{0,200}Text\s*1)/), text.search(/Part\s+B/))
const partB = text.slice(text.search(/Part\s+B/), text.search(/Part\s+C/))
const partC = text.slice(text.search(/Part\s+C/), text.search(/Section\s+III/))
const writing = text.slice(text.search(/Section\s+III\s+Writing/))

// 材料
const clozeOptStart = sectionI.search(/(?:^|\n)\s*1\.\s*A\.\s/)
const clozePassage = flat(sectionI.slice(sectionI.search(/\(10 points?\)/i) + 12, clozeOptStart))
const texts = [...readA.matchAll(/Text\s*(\d)/g)].map((m, i, arr) => ({
  no: Number(m[1]),
  from: m.index,
  to: i + 1 < arr.length ? arr[i + 1].index : readA.length,
}))
const passageFor = (no) => {
  const t = texts.find((x) => x.no === Math.ceil((no - 20) / 5))
  if (!t) return ''
  const body = readA.slice(t.from, t.to)
  // 文章正文到该组第一题为止
  const firstQ = body.search(/(?:^|\n)\s*\d{1,2}\.\s/)
  return flat(body.slice(0, firstQ > 0 ? firstQ : body.length))
}
const partBMaterial = (() => {
  const from = partB.search(/(?:^|\n)\s*A\.\s/)
  return from >= 0 ? flat(partB.slice(from)) : ''
})()

// 复用解析器拿题干/选项
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })
try {
  const { parseEnglishQuestions } = await vite.ssrLoadModule('/src/lib/english-questions.ts')
  const parsed = parseEnglishQuestions(text)

  const rows = []
  const review = []
  for (const item of parsed.questions) {
    const isObjective = item.no <= 45
    let questionText = item.stem
    if (isObjective) {
      const material = item.no <= 20 ? clozePassage : item.no <= 40 ? passageFor(item.no) : partBMaterial
      questionText = material ? `${material}\n\n${item.stem}` : item.stem
    }

    let options = item.options
    let labels = item.optionLabels
    let correct
    if (isObjective) {
      // Part B 的选项换成段落字母形式并保留字母，供映射下标
      if (item.no >= 41) {
        labels = item.optionLabels
        options = labels.map((l) => `段落 ${l}`)
      } else {
        labels = ['A', 'B', 'C', 'D']
      }
      const letter = ANSWERS[item.no]
      correct = letterToIndex(letter, labels)
      review.push(`#${item.no} 答案 ${letter} → 下标 ${correct}（选项 ${labels.join('')}）`)
    } else {
      options = []
      correct = null
    }

    const kind = item.no <= 20 ? '完形填空' : item.no <= 40 ? `阅读理解 Text ${Math.ceil((item.no - 20) / 5)}`
      : item.no <= 45 ? '新题型' : item.no <= 50 ? '翻译' : item.no === 51 ? '应用文写作' : '短文写作'

    rows.push(`  (${q(questionText)}, ${q(JSON.stringify(options))}::jsonb, ${q(SUBJECT)}, ` +
      // categories 里必须带分区标签：compose_exam 的分区过滤是 `q.categories ?| 分区categories`，
      // 完形/阅读/新题型都是 single_choice，只靠题型分不开，得靠这个标签
      `${q(`${CATEGORY} · ${kind}`)}, ${q(JSON.stringify([CATEGORY, '英语一', isObjective ? '客观题' : '主观题', kind]))}::jsonb, ` +
      `${q(isObjective ? 'single_choice' : 'analysis')}, ${q(JSON.stringify(correct))}::jsonb, ` +
      `${item.no}, ${q(`${SOURCE}（第 ${item.no} 题）`)}, true, ${q(IMPORT_MODE)})`)
  }

  const sql = [
    `-- 2026 年考研英语（一）真题入库（1–52）`,
    `-- 幂等：先按 import_mode 清掉本批次，再整体重插`,
    `delete from questions where import_mode = '${IMPORT_MODE}';`,
    '',
    'insert into questions',
    '  (question_text, options, subject, category, categories, question_type, correct_answer,',
    '   seq_number, source_page, verified, import_mode)',
    'values',
    rows.join(',\n') + ';',
    '',
    `select seq_number, question_type, correct_answer, subject, left(question_text, 30) as head`,
    `from questions where import_mode = '${IMPORT_MODE}' order by seq_number;`,
  ].join('\n')

  console.log(`共 ${parsed.questions.length} 题；客观题 ${parsed.questions.filter((x) => x.no <= 45).length} 题带答案，主观题 ${parsed.questions.filter((x) => x.no > 45).length} 题无标准答案`)
  console.log(`材料长度：完形 ${clozePassage.length}、阅读 ${texts.map((t) => passageFor(t.no * 5 + 20).length).join('/')}、Part B ${partBMaterial.length}`)
  console.log('\n=== 答案字母 → 选项下标（重点核对 Part B）===')
  for (const r of review) if (/^#(1|20|21|25|26|40|41|42|43|44|45) /.test(r)) console.log('  ' + r)

  const outIdx = process.argv.indexOf('--out')
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    writeFileSync(process.argv[outIdx + 1], sql, 'utf8')
    console.log(`\nSQL 已写入 ${process.argv[outIdx + 1]}`)
  } else {
    console.log('\n' + sql)
  }
  void partC; void writing
} finally {
  await vite.close()
}
