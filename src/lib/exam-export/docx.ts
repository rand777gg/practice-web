/**
 * DOCX 导出(docx.ts)
 * 用 docx 库把 PaperDoc 生成真正的 .docx。题干 markdown 走 md.ts 的块模型,
 * 转成 TextRun 段落——保证目录结构/编号/选项/留白在 Word 里排版整洁。
 */

import { Document, Packer, Paragraph, TextRun, AlignmentType, type IRunOptions } from 'docx'
import { mdToBlocks, type Block, type Span } from './md'
import type { PaperDoc, RenderedQuestion } from './paper'

function spansToRuns(spans: Span[], bold = false, italics = false): TextRun[] {
  return spans.map((s) => {
    const o: IRunOptions = { text: s.t }
    if (bold || s.b) Object.assign(o, { bold: true })
    if (italics || s.i) Object.assign(o, { italics: true })
    if (s.s) Object.assign(o, { strike: true })
    if (s.c) Object.assign(o, { font: 'Consolas' })
    return new TextRun(o)
  })
}

/** 转义/清理 Word 内的非法控制字符(某些题库文本含换页符等) */
function cleanText(s: string): string {
  let out = ''
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0) ?? 0
    const keep =
      c === 0x09 || c === 0x0a || c === 0x0d || c >= 0x20
    if (keep) out += ch
  }
  return out
}

/** 各 markdown 块 → 段落 */
function blockParas(block: Block): Paragraph[] {
  switch (block.k) {
    case 'p':
      return [new Paragraph({ children: spansToRuns(block.spans), spacing: { after: 80 } })]
    case 'h':
      return [
        new Paragraph({
          children: spansToRuns(block.spans, true),
          spacing: { before: 120, after: 60 },
        }),
      ]
    case 'ul':
    case 'ol': {
      const ordered = block.k === 'ol'
      return block.items.map((item, i) => {
        const prefix = ordered ? `${i + 1}. ` : '· '
        return new Paragraph({
          children: [new TextRun({ text: prefix }), ...spansToRuns(item)],
          indent: { left: 560, hanging: 280 },
          spacing: { after: 40 },
        })
      })
    }
    case 'code':
      return block.lines.map(
        (ln) =>
          new Paragraph({
            children: [new TextRun({ text: cleanText(ln), font: 'Consolas', size: 18 })],
            spacing: { after: 0 },
          }),
      )
    case 'quote':
      return [
        new Paragraph({
          children: spansToRuns(block.spans, false, true),
          indent: { left: 360 },
          spacing: { after: 60 },
        }),
      ]
    case 'hr':
      return [new Paragraph({ text: '', spacing: { after: 0 } })]
  }
}

function mdParas(md: string): Paragraph[] {
  const out: Paragraph[] = []
  for (const b of mdToBlocks(md)) out.push(...blockParas(b))
  return out
}

function questionParas(q: RenderedQuestion): Paragraph[] {
  const paras: Paragraph[] = []
  const blocks = mdToBlocks(q.md)
  const noPrefix = `${q.number}. `
  const first = blocks[0]
  const firstIsInline = first && (first.k === 'p' || first.k === 'h' || first.k === 'quote')

  if (firstIsInline) {
    // 把题号并入首段(客观题再拼分值提示)
    const prefixRuns: TextRun[] = [new TextRun({ text: noPrefix, bold: true })]
    if (first.k === 'p') {
      const combined = spansToRuns(first.spans)
      if (combined.length) prefixRuns.push(...combined)
      paras.push(new Paragraph({ children: prefixRuns, spacing: { before: 160, after: 40 }, indent: { left: 360, hanging: 360 } }))
    } else if (first.k === 'quote') {
      paras.push(new Paragraph({ text: noPrefix, spacing: { before: 160, after: 40 }, indent: { left: 360, hanging: 360 } }))
      paras.push(...blockParas(first))
    } else {
      paras.push(new Paragraph({ children: prefixRuns, spacing: { before: 160, after: 40 } }))
      paras.push(...blockParas(first))
    }
    for (const b of blocks.slice(1)) paras.push(...blockParas(b))
  } else {
    paras.push(new Paragraph({ children: [new TextRun({ text: noPrefix, bold: true })], spacing: { before: 160, after: 40 }, indent: { left: 360, hanging: 360 } }))
    for (const b of blocks) paras.push(...blockParas(b))
  }

  // 客观题选项(换行分列)
  for (const o of q.options) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: `${o.key}. ` }), new TextRun({ text: cleanText(o.text) })],
        indent: { left: 720 },
        spacing: { after: 30 },
      }),
    )
  }

  // 案例小题
  for (const sub of q.caseSubs) {
    const head = `${sub.number}${sub.scoreText ? `（${sub.scoreText}）` : ''} `
    const subParas = mdParas(sub.md)
    if (subParas.length) {
      const subHead = new Paragraph({ children: [new TextRun({ text: head, bold: true })], spacing: { before: 120, after: 30 } })
      paras.push(subHead)
      paras.push(...subParas)
    } else {
      paras.push(new Paragraph({ text: head, spacing: { before: 120 } }))
    }
    for (const o of sub.options) {
      paras.push(
        new Paragraph({
          children: [new TextRun({ text: `${o.key}. ` }), new TextRun({ text: cleanText(o.text) })],
          indent: { left: 900 },
          spacing: { after: 20 },
        }),
      )
    }
  }

  // 主观题作答留白
  if (q.answerLines > 0) {
    for (let i = 0; i < q.answerLines; i++) paras.push(new Paragraph({ text: '', spacing: { before: 160 } }))
  }
  return paras
}

export async function buildDocxBlob(doc: PaperDoc): Promise<Blob> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      children: [new TextRun({ text: cleanText(doc.title), bold: true, size: 30 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
  )
  if (doc.meta.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.meta.join('　｜　') })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
    )
  }
  // 卷首: 全卷共 n 题(上细下粗双线近似真卷的 double border 抬头)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 160 },
      border: { top: { style: 'double', size: 12, color: '333333' } },
      children: [new TextRun({ text: `全卷共 ${doc.questionTotal} 题`, size: 21 })],
    }),
  )

  for (const sec of doc.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${sec.orderText}、${sec.name}`, bold: true, size: 24 })],
        spacing: { before: 200, after: 100 },
      }),
    )
    for (const q of sec.questions) children.push(...questionParas(q))
  }

  const myDoc = new Document({
    creator: 'Practice',
    title: doc.title,
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Times New Roman', eastAsia: '宋体', hAnsi: 'Times New Roman' }, size: 21 },
        },
      },
    },
    sections: [{ properties: {}, children }],
  })
  return Packer.toBlob(myDoc)
}
