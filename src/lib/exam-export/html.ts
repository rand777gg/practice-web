/**
 * HTML 导出(html.ts)
 * 把 PaperDoc 渲染成「自包含 .html」;内联打印 CSS + MathJax CDN。
 * 同一个 documentString 同时用于:
 *   - .html 文件下载;
 *   - 打印/另存为 PDF(新开窗口 window.print)。
 */

import type { PaperDoc, RenderedQuestion, RenderedCaseSub } from './paper'
import { escapeHtmlAttr, escapeHtmlText } from './text'

const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'

function optionsHtml(options: { key: string; text: string }[]): string {
  if (!options.length) return ''
  const lis = options.map((o) => `<li><span class="opt-key">${o.key}.</span>${o.text}</li>`).join('')
  return `<ul class="opts">${lis}</ul>`
}

function blankLines(n: number): string {
  if (n <= 0) return ''
  const arr: string[] = []
  for (let i = 0; i < n; i++) arr.push('<div class="blank-line"></div>')
  return `<div class="answer-area">${arr.join('')}</div>`
}

function caseSubHtml(sub: RenderedCaseSub): string {
  const head = `${sub.number}${sub.scoreText ? `（${sub.scoreText}）` : ''}`
  const opts = optionsHtml(sub.options)
  return `<div class="case-sub"><div class="case-sub-head"><span>${escapeHtmlText(head)}</span></div><div class="case-sub-body">${sub.body}${opts}</div></div>`
}

function questionHtml(q: RenderedQuestion, includeTypeTag: boolean): string {
  const score = q.scoreText ? ` <span class="q-score">${escapeHtmlText(q.scoreText)}</span>` : ''
  const typeTag = includeTypeTag && q.typeLabel ? `<span class="q-type">【${escapeHtmlText(q.typeLabel)}】</span>` : ''
  const blankLabel = q.blankLabel ? `<span class="blank-note">${escapeHtmlText(q.blankLabel)}</span>` : ''
  const caseHtml = q.isCase
    ? `<div class="case-subs">${q.caseSubs.map(caseSubHtml).join('')}</div>`
    : ''
  return `
  <div class="question">
    <div class="q-body">
      <span class="q-no">${q.number}.</span>
      ${typeTag}${q.body}${score}
    </div>
    ${optionsHtml(q.options)}
    ${caseHtml}
    ${blankLines(q.answerLines)}
    ${blankLabel}
  </div>`
}

function renderDoc(doc: PaperDoc): string {
  const metaLine = doc.meta.join('&nbsp;&nbsp;｜&nbsp;&nbsp;')
  const sections = doc.sections
    .map((sec) => {
      const qs = sec.questions.map((q) => questionHtml(q, false)).join('\n')
      return `
  <section class="section">
    <h2 class="sec-head">${escapeHtmlText(sec.orderText)}、${escapeHtmlText(sec.name)}</h2>
    ${qs}
  </section>`
    })
    .join('\n')

  return `
  <div class="paper">
    <header class="paper-head">
      <div class="doc-title">${escapeHtmlText(doc.title)}</div>
      ${metaLine ? `<div class="meta-line">${metaLine}</div>` : ''}
      <div class="total-rule"><span>全卷共 ${doc.questionTotal} 题</span></div>
    </header>
    ${sections}
  </div>`
}

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#f0f0f0;color:#111}
  body{font-family:"Songti SC","SimSun","宋体",serif;line-height:1.7}
  .paper{width:794px;max-width:100%;margin:0 auto;background:#fff;padding:56px 64px;min-height:1122px}
  .doc-title{font-size:22px;font-weight:bold;text-align:center;letter-spacing:2px;margin-bottom:14px}
  .meta-line{text-align:center;font-size:13px;color:#333;margin-bottom:18px;line-height:2}
  .total-rule{border-top:3px double #333;margin-bottom:18px;padding-top:6px;text-align:center;font-size:12px;color:#555}
  .section{margin-bottom:22px;page-break-inside:auto}
  .sec-head{font-size:16px;font-weight:bold;border-bottom:1px solid #333;padding-bottom:6px;margin-bottom:14px;break-after:avoid}
  .question{margin-bottom:20px;page-break-inside:avoid}
  .q-body{font-size:14px;text-align:justify}
  .q-no{font-weight:bold;margin-right:2px}
  .q-type{font-size:12px;color:#666;margin:0 6px}
  .q-score{font-size:12px;color:#666;white-space:nowrap}
  .opts{margin:10px 0 0 26px;list-style:none}
  .opts li{font-size:14px;padding:2px 0;display:flex;gap:6px;align-items:flex-start}
  .opt-key{white-space:nowrap}
  .blank-note{display:block;margin-top:6px;font-size:12px;color:#999}
  .answer-area{padding-top:6px}
  .blank-line{height:34px;border-bottom:1px solid #d6d6d6;margin-top:12px}
  .case-subs{margin:10px 0 0 22px;border-left:2px solid #eee;padding-left:14px}
  .case-sub{margin:8px 0}
  .case-sub-head{font-weight:bold;font-size:14px}
  .case-sub-body{font-size:14px;margin-top:2px}
  pre{background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;padding:10px 12px;font-size:12.5px;font-family:Consolas,Menlo,monospace;overflow-x:auto;margin:8px 0;white-space:pre-wrap}
  code{font-family:Consolas,Menlo,monospace}
  p code{background:#f3f4f6;border-radius:3px;padding:1px 4px;font-size:0.9em}
  img{max-width:100%;height:auto}
  table{border-collapse:collapse;margin:8px 0;font-size:13px}
  table,th,td{border:1px solid #ccc;padding:5px 9px}
  th{background:#f6f8fa}
  ul,ol{margin:6px 0 6px 24px}
  @media print{
    html,body{background:#fff}
    .paper{width:auto;margin:0;padding:0;box-shadow:none}
    .section{page-break-inside:auto}
    .question{page-break-inside:avoid}
  }
`

export function buildHtmlDocument(doc: PaperDoc): string {
  const body = renderDoc(doc)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtmlAttr(doc.title)}</title>
<style>${CSS}</style>
<script>
window.MathJax = {
  tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] },
  svg: { fontCache: 'global' },
  startup: { typeset: false }
};
</script>
<script defer src="${MATHJAX_CDN}"></script>
</head>
<body>
${body}
</body>
</html>`
}
