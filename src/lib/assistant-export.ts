/**
 * /export —— 把一次会话打成 zip。
 *
 * 为什么是三份而不是一份: 三个用途互不兼容。
 *   会话.md     人看的, 引用带链接和原文片段, 直接扔进笔记软件就能读
 *   会话.json   机器看的, 保留 role/sources/meta 的原始结构, 以后想再加工不用重新解析
 *   引用原文.md 核对用的, 把整个会话里引用过的片段去重后集中列一遍 ——
 *               "这段话到底出自哪儿"不该让人在几十条消息里翻
 *
 * jszip 用动态 import: 它近百 KB, 而绝大多数会话根本不会导出, 不该进首屏包。
 */
import type { ChatMessage } from '@/stores/assistant-store'

export interface ExportInput {
  conversationId: string | null
  title: string
  messages: ChatMessage[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function stamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/** 会话标题是第一句话截出来的, 可能带 / \ : * ? " < > | 这些在文件名里非法的字符 */
function safeName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 40) || '未命名会话'
}

function absolute(anchor: string | undefined): string | null {
  if (!anchor) return null
  if (/^https?:\/\//i.test(anchor)) return anchor
  if (typeof window === 'undefined') return anchor
  return `${window.location.origin}${anchor}`
}

function sourceLines(message: ChatMessage): string[] {
  if (!message.sources?.length) return []
  const out = ['', '> **依据**']
  for (const s of message.sources) {
    const link = absolute(s.anchor)
    out.push(`> - 【${s.type}】${s.label}${link ? ` — ${link}` : ''}`)
    if (s.snippet) out.push(`>   ${s.snippet.replace(/\n+/g, ' ')}`)
  }
  return out
}

function buildMarkdown(input: ExportInput): string {
  const lines: string[] = [
    `# ${input.title}`,
    '',
    `- 导出时间：${new Date().toLocaleString()}`,
    `- 会话 ID：${input.conversationId ?? '（尚未入库）'}`,
    `- 消息数：${input.messages.length}`,
    '',
    '> 由小Q（刷题网）导出。引用条目附有站内地址，文献引用可直接定位到页与段落。',
    '',
    '---',
    '',
  ]

  for (const message of input.messages) {
    lines.push(message.role === 'user' ? '### 我' : '### 小Q')
    lines.push('')
    lines.push(message.content)
    if (message.sub) {
      lines.push('')
      lines.push(message.sub)
    }
    lines.push(...sourceLines(message))
    if (message.tags?.length) {
      lines.push('')
      lines.push(`\`${message.tags.join('` `')}\``)
    }
    lines.push('', '---', '')
  }
  return lines.join('\n')
}

function buildQuotes(input: ExportInput): string {
  const seen = new Set<string>()
  const items: { type: string; label: string; anchor: string | null; snippet: string }[] = []
  for (const message of input.messages) {
    for (const s of message.sources ?? []) {
      const key = `${s.type}|${s.label}|${s.snippet ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ type: s.type, label: s.label, anchor: absolute(s.anchor), snippet: s.snippet ?? '' })
    }
  }
  if (items.length === 0) {
    return `# 引用原文\n\n这次会话没有引用平台资料，所以这里是空的。\n`
  }
  const lines = [`# 引用原文\n`, `共 ${items.length} 条（已去重）。\n`]
  items.forEach((item, i) => {
    lines.push(`## ${i + 1}. 【${item.type}】${item.label}`)
    lines.push('')
    if (item.anchor) lines.push(item.anchor)
    lines.push('')
    lines.push(item.snippet ? `> ${item.snippet.replace(/\n+/g, ' ')}` : '（这条引用没有附带原文片段）')
    lines.push('')
  })
  return lines.join('\n')
}

function buildJson(input: ExportInput): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      conversation: { id: input.conversationId, title: input.title },
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
        sub: m.sub,
        tags: m.tags,
        sources: m.sources,
        followups: m.followups,
        meta: m.meta ?? null,
        created_at: m.createdAt ?? null,
      })),
    },
    null,
    2,
  )
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立刻 revoke 会让部分浏览器来不及取数据, 给一拍
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function exportConversation(input: ExportInput): Promise<{ filename: string; bytes: number }> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('会话.md', buildMarkdown(input))
  zip.file('会话.json', buildJson(input))
  zip.file('引用原文.md', buildQuotes(input))

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const filename = `小Q-${safeName(input.title)}-${stamp()}.zip`
  download(blob, filename)
  return { filename, bytes: blob.size }
}
