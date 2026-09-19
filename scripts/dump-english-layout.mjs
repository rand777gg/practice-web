/**
 * 校验/调试：英语（一）真题「卷面结构」提取。
 * 渲染器要的每一块都在这里 dump 出来，肉眼看一遍再谈排版。
 *
 * 用法：node scripts/dump-english-layout.mjs ["试卷 PDF 路径"]
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdfPath = process.argv[2] ?? join(homedir(), 'Desktop', '2026年考研英语一.pdf')

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
  return pages.join('\n')
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })
try {
  const { parseEnglishPaperLayout } = await vite.ssrLoadModule('/src/lib/english-paper-layout.ts')
  const L = parseEnglishPaperLayout(await extractPagesText(pdfPath))
  const cut = (s, n = 220) => (s.length > n ? s.slice(0, n) + `…[${s.length}字]` : s)

  console.log(`标题: ${L.title}`)

  const c = L.sections.cloze
  console.log(`\n=== Section I ${c ? c.title : '未解出'} ===`)
  if (c) {
    console.log(`Directions: ${cut(c.directions, 160)}`)
    console.log(`空数 ${c.blanks.length}；正文挖空标记 ${(c.passage.match(/\[\[\d+\]\]/g) ?? []).join(' ')}`)
    console.log(`正文: ${cut(c.passage)}`)
    console.log(`第 1 空选项: ${JSON.stringify(c.blanks[0]?.options)}`)
    console.log(`第 20 空选项: ${JSON.stringify(c.blanks[19]?.options)}`)
  }

  const r = L.sections.reading
  console.log(`\n=== Section II Part A ===`)
  if (r) {
    console.log(`Directions: ${cut(r.head.directions, 160)}`)
    for (const t of r.texts) {
      console.log(`\n  ${t.heading}｜正文 ${t.passage.length} 字｜${t.questions.length} 题`)
      console.log(`    正文: ${cut(t.passage, 120)}`)
      for (const q of t.questions) console.log(`    ${q.no}. ${cut(q.stem, 70)} → ${q.options.map((o, i) => `${'ABCD'[i]}.${cut(o, 26)}`).join(' ')}`)
    }
  }

  const b = L.sections.partB
  console.log(`\n=== Section II Part B ===`)
  if (b) {
    console.log(`Directions: ${cut(b.directions, 200)}`)
    console.log(`段落 ${b.paragraphs.length} 个: ${b.paragraphs.map((p) => p.letter).join('')}｜已给定: ${b.placed.join('')}`)
    console.log(`顺序骨架: ${b.skeleton.join(' → ')}`)
    console.log(`段落 A 前 100 字: ${cut(b.paragraphs[0]?.text ?? '', 100)}`)
  }

  const p = L.sections.partC
  console.log(`\n=== Section II Part C ===`)
  if (p) {
    console.log(`Directions: ${cut(p.directions, 160)}`)
    console.log(`全文 ${p.passage.length} 字: ${cut(p.passage, 160)}`)
    for (const s of p.segments) console.log(`  (${s.no}) ${cut(s.sentence, 100)}`)
  }

  const wa = L.sections.writingA; const wb = L.sections.writingB
  console.log(`\n=== Section III Writing ===`)
  if (wa) {
    console.log(`Part A Directions: ${cut(wa.directions, 200)}`)
    console.log(`来信方框: ${cut(wa.letterBox ?? '(未解出)', 160)}`)
  }
  if (wb) {
    console.log(`Part B Directions: ${cut(wb.directions, 200)}`)
    console.log(`图表: ${JSON.stringify(wb.charts)}`)
    console.log(`图表题注: ${wb.chartCaption ?? '(未解出)'}`)
  }

  console.log(L.warnings.length ? `\n警告:\n  - ${L.warnings.join('\n  - ')}` : '\n无警告')
} finally {
  await vite.close()
}
