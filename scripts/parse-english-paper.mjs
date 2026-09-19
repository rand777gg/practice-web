/**
 * 验证/调试：把考研英语（一）试题 PDF 跑一遍分区与题号解析。
 *
 * 用 Vite 的 ssrLoadModule 直接加载 TS 模块，不用先编译（这样规则只写一份，不跟 src 重复）。
 *
 * 用法：
 *   node scripts/parse-english-paper.mjs ["<试卷 PDF 路径>"]
 * 默认读桌面的「2026年考研英语一.pdf」。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const pdfPath = process.argv[2] ?? join(homedir(), 'Desktop', '2026年考研英语一.pdf')

/**
 * PDF → 逐页文本。
 * 文字层是 OCR 出来的，单词会粘成 alsohas，所以按 x 间距补空格；
 * 不补的话后面所有正则都会被粘字毁掉。
 */
async function extractPagesText(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: false }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let out = ''
    let prevEnd = null
    let prevSize = 10
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
  return pages
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })
try {
  const { parseEnglishPaper } = await vite.ssrLoadModule('/src/lib/english-paper.ts')
  const { parseEnglishQuestions } = await vite.ssrLoadModule('/src/lib/english-questions.ts')
  const pages = await extractPagesText(pdfPath)
  const all = pages.join('\n')
  const parsed = parseEnglishPaper(all)

  console.log(`试卷：${pdfPath}`)
  console.log(`页数：${pages.length}`)
  console.log(`标题：${parsed.title}`)
  console.log(`页眉水印剥离：${parsed.watermarkHits} 处\n`)

  console.log('题号  分区                    题型          范围     题数  分值  选项')
  console.log('----  ----------------------  ------------  --------  ----  ----  ----')
  for (const s of parsed.sections) {
    console.log(
      `${s.ordinal.padEnd(4)}  ${s.name.padEnd(22)}  ${s.type.padEnd(12)}  ` +
      `${`${s.range[0]}-${s.range[1]}`.padEnd(8)}  ${String(s.count).padEnd(4)}  ${String(s.score).padEnd(4)}  ` +
      `${s.options || '—'}${s.optionLabels ? ` (${s.optionLabels.join('')})` : ''}`,
    )
  }

  const covered = parsed.sections.flatMap((s) => s.range)
  console.log(`\n题号覆盖：${covered.join(',')}`)
  console.log(`总分：${parsed.sections.reduce((a, s) => a + s.score, 0)}`)

  if (parsed.warnings.length) {
    console.log('\n分区提示 / 警告：')
    for (const w of parsed.warnings) console.log('  - ' + w)
  } else {
    console.log('\n分区无警告。')
  }

  // 题目抽取
  const q = parseEnglishQuestions(all)
  console.log(`\n=== 题目抽取 ===\n解出 ${q.questions.length} 题`)
  const byType = q.questions.reduce((acc, x) => { acc[x.type] = (acc[x.type] ?? 0) + 1; return acc }, {})
  console.log('题型分布:', JSON.stringify(byType))
  const sample = process.env.B4_SAMPLE ? Number(process.env.B4_SAMPLE) : 0
  for (const item of q.questions) {
    if (sample && ![1, 11, 21, 41, 46, 51, 52].includes(item.no)) continue
    console.log(`\n#${item.no} [${item.type}] ${item.stem.slice(0, 110)}`)
    item.options.forEach((o, i) => console.log(`   ${item.optionLabels?.[i] ?? String.fromCharCode(65 + i)}. ${o.slice(0, 70)}`))
  }
  if (q.warnings.length) {
    console.log('\n题目提示 / 警告：')
    for (const w of q.warnings) console.log('  - ' + w)
  } else {
    console.log('\n题目无警告。')
  }
} finally {
  await vite.close()
}
