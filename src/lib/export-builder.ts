import {
  EXPORT_FORMATS, type DemoQuestion, type ExportTemplate, type QuestionSource,
} from './export-demo'
import { DEMO_TOPICS } from './topics-demo'

export interface ExportContext {
  source: QuestionSource
  generatedAt: string
}

export interface ExportResult {
  filename: string
  mime: string
  content: string
  questionCount: number
}

const SOURCE_LABEL: Record<QuestionSource, string> = {
  wrong: '错题本',
  favorite: '收藏夹',
}

function stars(difficulty: number): string {
  return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)
}

function dateOf(question: DemoQuestion): string {
  return question.lastWrongAt ?? question.favoritedAt ?? ''
}

/** 稳定的排序：先按题目来源时间倒序作为兜底，再按用户选择的主键排 */
export function orderQuestions(questions: DemoQuestion[], template: ExportTemplate): DemoQuestion[] {
  const topicOrder = new Map(DEMO_TOPICS.map((topic, index) => [topic.id, index]))
  return [...questions].sort((a, b) => {
    if (template.orderBy === 'wrongCount') return (b.wrongCount ?? 0) - (a.wrongCount ?? 0)
    if (template.orderBy === 'difficulty') return b.difficulty - a.difficulty
    if (template.orderBy === 'topic') {
      return (topicOrder.get(a.topicId) ?? 0) - (topicOrder.get(b.topicId) ?? 0)
    }
    return dateOf(b).localeCompare(dateOf(a))
  })
}

interface Group {
  label: string
  items: DemoQuestion[]
}

export function groupQuestions(questions: DemoQuestion[], template: ExportTemplate): Group[] {
  if (template.groupBy === 'none') return [{ label: '', items: questions }]

  const groups = new Map<string, DemoQuestion[]>()
  for (const question of questions) {
    const label =
      template.groupBy === 'topic'
        ? (DEMO_TOPICS.find((topic) => topic.id === question.topicId)?.name ?? question.topicId)
        : template.groupBy === 'type'
          ? question.type
          : `${question.difficulty} 星难度`
    const bucket = groups.get(label)
    if (bucket) bucket.push(question)
    else groups.set(label, [question])
  }
  return [...groups].map(([label, items]) => ({ label, items }))
}

function topicNameOf(question: DemoQuestion): string {
  return DEMO_TOPICS.find((topic) => topic.id === question.topicId)?.name ?? question.topicId
}

function metaLine(question: DemoQuestion): string {
  return `${topicNameOf(question)} · ${question.type} · 难度 ${question.difficulty}/5 · 来源「${question.bankName}」`
}

function statsLine(question: DemoQuestion): string {
  const parts: string[] = []
  if (typeof question.wrongCount === 'number') parts.push(`错误 ${question.wrongCount} 次`)
  if (question.lastWrongAt) parts.push(`最近练习 ${question.lastWrongAt}`)
  if (question.favoritedAt) parts.push(`收藏于 ${question.favoritedAt}`)
  return parts.join(' · ')
}

function tocOf(groups: Group[]): string[] {
  return groups
    .filter((group) => group.label)
    .map((group) => `${group.label}（${group.items.length} 题）`)
}

function buildMarkdown(title: string, groups: Group[], template: ExportTemplate, ctx: ExportContext): string {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const lines: string[] = []

  lines.push(`# ${title}`, '')

  if (template.includeCover) {
    lines.push(`> 数据来源：${SOURCE_LABEL[ctx.source]} · 共 ${total} 题 · 生成时间 ${ctx.generatedAt}`)
    lines.push(`> 导出模板：${template.name}`, '')
    lines.push('---', '')
  }

  if (template.includeToc) {
    lines.push('## 目录', '')
    lines.push(...tocOf(groups).map((item, index) => `${index + 1}. ${item}`), '')
    lines.push('---', '')
  }

  let index = 0
  for (const group of groups) {
    if (group.label) lines.push(`## ${group.label}`, '')
    for (const question of group.items) {
      index += 1
      const heading = template.includeIndex ? `${index}. ` : ''
      lines.push(`### ${heading}[${question.type}] ${stars(question.difficulty)}`, '')
      if (template.fields.includes('meta')) lines.push(`*${metaLine(question)}*`, '')
      if (template.fields.includes('stem')) lines.push(question.stem, '')

      if (template.fields.includes('options') && question.options?.length) {
        lines.push(...question.options.map((option) => `- ${option.key}. ${option.text}`), '')
      }
      if (template.fields.includes('answer')) lines.push(`**答案**：${question.answer}`, '')
      if (template.fields.includes('analysis')) lines.push(`**解析**：${question.analysis}`, '')
      if (template.fields.includes('wrongReason') && question.wrongReason) {
        lines.push(`**我的错因**：${question.wrongReason}`, '')
      }
      if (template.fields.includes('tags') && question.tags.length) {
        lines.push(question.tags.map((tag) => `\`${tag}\``).join(' '), '')
      }
      if (template.fields.includes('stats')) {
        const stats = statsLine(question)
        if (stats) lines.push(`*${stats}*`, '')
      }
      lines.push('---', '')
    }
  }

  return lines.join('\n')
}

function buildText(title: string, groups: Group[], template: ExportTemplate, ctx: ExportContext): string {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const rule = '='.repeat(56)
  const lines: string[] = []

  lines.push(rule, title, rule)

  if (template.includeCover) {
    lines.push(`数据来源：${SOURCE_LABEL[ctx.source]} · 共 ${total} 题`)
    lines.push(`生成时间：${ctx.generatedAt} · 导出模板：${template.name}`, '')
  }

  if (template.includeToc) {
    lines.push('目录')
    lines.push(...tocOf(groups).map((item, index) => `  ${index + 1}. ${item}`), '')
  }

  let index = 0
  for (const group of groups) {
    if (group.label) lines.push(`【${group.label}】`, '')
    for (const question of group.items) {
      index += 1
      const heading = template.includeIndex ? `${index}. ` : '· '
      lines.push(`${heading}[${question.type}] 难度 ${stars(question.difficulty)}`)
      if (template.fields.includes('meta')) lines.push(`   ${metaLine(question)}`)
      if (template.fields.includes('stem')) lines.push(question.stem)
      if (template.fields.includes('options') && question.options?.length) {
        lines.push(...question.options.map((option) => `   ${option.key}. ${option.text}`))
      }
      if (template.fields.includes('answer')) lines.push(`   答案：${question.answer}`)
      if (template.fields.includes('analysis')) lines.push(`   解析：${question.analysis}`)
      if (template.fields.includes('wrongReason') && question.wrongReason) {
        lines.push(`   我的错因：${question.wrongReason}`)
      }
      if (template.fields.includes('tags') && question.tags.length) {
        lines.push(`   标签：${question.tags.join('、')}`)
      }
      if (template.fields.includes('stats')) {
        const stats = statsLine(question)
        if (stats) lines.push(`   ${stats}`)
      }
      lines.push('-'.repeat(56))
    }
  }

  return lines.join('\n')
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(questions: DemoQuestion[], template: ExportTemplate): string {
  const headers: string[] = []
  if (template.includeIndex) headers.push('序号')
  if (template.fields.includes('meta')) headers.push('专业课', '题型', '难度', '来源题库')
  if (template.fields.includes('stem')) headers.push('题干')
  if (template.fields.includes('options')) headers.push('选项')
  if (template.fields.includes('answer')) headers.push('答案')
  if (template.fields.includes('analysis')) headers.push('解析')
  if (template.fields.includes('wrongReason')) headers.push('我的错因')
  if (template.fields.includes('tags')) headers.push('标签')
  if (template.fields.includes('stats')) headers.push('统计')

  const rows = template.groupBy === 'none' ? [{ label: '', items: questions }] : groupQuestions(questions, template)
  const lines = [headers.map(csvCell).join(',')]

  let index = 0
  for (const group of rows) {
    if (template.groupBy !== 'none' && group.label) {
      lines.push(csvCell(`【${group.label}】`))
    }
    for (const question of group.items) {
      index += 1
      const cells: string[] = []
      if (template.includeIndex) cells.push(String(index))
      if (template.fields.includes('meta')) {
        cells.push(topicNameOf(question), question.type, String(question.difficulty), question.bankName)
      }
      if (template.fields.includes('stem')) cells.push(question.stem)
      if (template.fields.includes('options')) {
        cells.push((question.options ?? []).map((option) => `${option.key}. ${option.text}`).join(' | '))
      }
      if (template.fields.includes('answer')) cells.push(question.answer)
      if (template.fields.includes('analysis')) cells.push(question.analysis)
      if (template.fields.includes('wrongReason')) cells.push(question.wrongReason ?? '')
      if (template.fields.includes('tags')) cells.push(question.tags.join('、'))
      if (template.fields.includes('stats')) cells.push(statsLine(question))
      lines.push(cells.map(csvCell).join(','))
    }
  }

  // Excel 需要 BOM 才能正确识别 UTF-8 中文
  return `\ufeff${lines.join('\r\n')}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(title: string, groups: Group[], template: ExportTemplate, ctx: ExportContext): string {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const parts: string[] = []

  parts.push('<!doctype html>')
  parts.push('<html lang="zh-CN"><head><meta charset="utf-8" />')
  parts.push(`<title>${escapeHtml(title)}</title>`)
  parts.push(`<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: system-ui, -apple-system, "Microsoft YaHei", sans-serif;
         color: #1a1a1a; background: #f5f5f5; line-height: 1.7; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px 44px; border-radius: 4px; }
  .cover { border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .cover h1 { margin: 0 0 8px; font-size: 24px; }
  .cover p { margin: 2px 0; font-size: 12px; color: #666; }
  .toc { border: 1px solid #e0e0e0; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }
  .toc h2 { margin: 0 0 8px; font-size: 14px; }
  .toc ol { margin: 0; padding-left: 20px; }
  h2.group { font-size: 16px; margin: 28px 0 12px; padding-left: 8px; border-left: 3px solid #333; }
  .q { margin-bottom: 22px; page-break-inside: avoid; }
  .q-head { font-size: 12px; color: #888; margin-bottom: 6px; }
  .q-stem { font-size: 14px; margin-bottom: 8px; }
  .q-options { font-size: 13px; color: #333; margin: 0 0 8px; padding-left: 18px; }
  .q-meta { font-size: 11px; color: #999; }
  .ans { background: #f3f7f3; border-left: 3px solid #4a8f5b; padding: 8px 12px; margin: 8px 0; font-size: 13px; }
  .ans b { color: #2f6b3c; }
  .reason { background: #fdf6ec; border-left: 3px solid #d99a2b; padding: 8px 12px; font-size: 13px; }
  .tags { font-size: 11px; color: #666; margin-top: 6px; }
  .tags span { border: 1px solid #ddd; border-radius: 3px; padding: 1px 6px; margin-right: 4px; }
  .answers { margin-top: 40px; border-top: 2px dashed #999; padding-top: 20px; }
  .answers h2 { font-size: 16px; }
  .answers ol { font-size: 13px; padding-left: 22px; }
  .answers li { margin-bottom: 10px; }
  .footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: center; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { max-width: none; padding: 0; }
    .no-print { display: none; }
  }
</style></head><body><div class="sheet">`)
  parts.push('<p class="no-print" style="font-size:12px;color:#a06d00;background:#fff8e6;padding:8px 12px;border-radius:4px">这是 DEMO 导出的示例文件：数据来自内置演示题目，可用浏览器「打印 → 另存为 PDF」验证排版效果。</p>')

  parts.push('<div class="cover">')
  parts.push(`<h1>${escapeHtml(title)}</h1>`)
  if (template.includeCover) {
    parts.push(`<p>数据来源：${SOURCE_LABEL[ctx.source]} · 共 ${total} 题</p>`)
    parts.push(`<p>导出模板：${escapeHtml(template.name)} · 生成时间 ${escapeHtml(ctx.generatedAt)}</p>`)
  }
  parts.push('</div>')

  if (template.includeToc) {
    parts.push('<div class="toc"><h2>目录</h2><ol>')
    parts.push(...tocOf(groups).map((item) => `<li>${escapeHtml(item)}</li>`))
    parts.push('</ol></div>')
  }

  const answerList: { index: number; question: DemoQuestion }[] = []
  let index = 0
  for (const group of groups) {
    if (group.label) parts.push(`<h2 class="group">${escapeHtml(group.label)}</h2>`)
    for (const question of group.items) {
      index += 1
      answerList.push({ index, question })
      const heading = template.includeIndex ? `${index}. ` : ''
      parts.push('<div class="q">')
      parts.push(`<div class="q-head">${escapeHtml(heading)}[${escapeHtml(question.type)}] 难度 ${stars(question.difficulty)}</div>`)
      if (template.fields.includes('stem')) parts.push(`<div class="q-stem">${escapeHtml(question.stem)}</div>`)
      if (template.fields.includes('options') && question.options?.length) {
        parts.push('<ol class="q-options" type="A">')
        parts.push(...question.options.map((option) => `<li>${escapeHtml(option.text)}</li>`))
        parts.push('</ol>')
      }
      if (template.fields.includes('meta')) parts.push(`<div class="q-meta">${escapeHtml(metaLine(question))}</div>`)
      if (template.fields.includes('answer')) {
        parts.push(`<div class="ans"><b>答案</b>：${escapeHtml(question.answer)}</div>`)
      }
      if (template.fields.includes('analysis')) {
        parts.push(`<div class="ans"><b>解析</b>：${escapeHtml(question.analysis)}</div>`)
      }
      if (template.fields.includes('wrongReason') && question.wrongReason) {
        parts.push(`<div class="reason"><b>我的错因</b>：${escapeHtml(question.wrongReason)}</div>`)
      }
      const tags = template.fields.includes('tags') && question.tags.length
        ? `<div class="tags">${question.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
        : ''
      const stats = template.fields.includes('stats') ? statsLine(question) : ''
      if (tags || stats) parts.push(`${tags}${stats ? `<div class="q-meta">${escapeHtml(stats)}</div>` : ''}`)
      parts.push('</div>')
    }
  }

  // 打印自测版等未选「答案」的模板，把答案统一附在卷末
  if (!template.fields.includes('answer')) {
    parts.push('<div class="answers"><h2>参考答案</h2><ol>')
    parts.push(
      ...answerList.map(({ index: order, question }) =>
        `<li><b>第 ${order} 题</b>：${escapeHtml(question.answer)}<br /><span style="color:#666">${escapeHtml(question.analysis)}</span></li>`,
      ),
    )
    parts.push('</ol></div>')
  }

  parts.push(`<div class="footer">本文件由刷题网导出 · DEMO 演示数据 · ${escapeHtml(ctx.generatedAt)}</div>`)
  parts.push('</div></body></html>')

  return parts.join('\n')
}

function safeFilename(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '_')
}

export function buildExport(
  questions: DemoQuestion[],
  template: ExportTemplate,
  ctx: ExportContext,
): ExportResult {
  const ordered = orderQuestions(questions, template)
  const groups = groupQuestions(ordered, template)
  const title = `${SOURCE_LABEL[ctx.source]}导出 · ${template.name}`
  const formatMeta = EXPORT_FORMATS.find((item) => item.key === template.format)
  const ext = formatMeta?.ext ?? 'txt'

  let mime = 'text/plain;charset=utf-8'
  let content: string

  if (template.format === 'markdown') {
    mime = 'text/markdown;charset=utf-8'
    content = buildMarkdown(title, groups, template, ctx)
  } else if (template.format === 'csv') {
    mime = 'text/csv;charset=utf-8'
    content = buildCsv(ordered, template)
  } else if (template.format === 'html') {
    mime = 'text/html;charset=utf-8'
    content = buildHtml(title, groups, template, ctx)
  } else {
    content = buildText(title, groups, template, ctx)
  }

  const stamp = ctx.generatedAt.replace(/[^0-9]/g, '').slice(0, 12)
  return {
    filename: safeFilename(`${SOURCE_LABEL[ctx.source]}-${template.name}-${stamp}.${ext}`),
    mime,
    content,
    questionCount: ordered.length,
  }
}
